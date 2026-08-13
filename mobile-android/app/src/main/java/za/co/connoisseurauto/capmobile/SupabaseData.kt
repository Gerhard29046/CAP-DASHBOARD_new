package com.CAPDATABASE.capdatabase

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase D (Android->Supabase migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md):
 * generic PostgREST-backed CRUD + polling "observe" for the tables moved off Firestore this
 * phase (see [SUPABASE_MIGRATED_TABLES] in Core.kt -- clients, machines, service_records,
 * job_cards, job_card_lines). Deliberately plain REST (HttpURLConnection/org.json), matching
 * SupabaseAuth.kt's Phase C precedent, NOT the third-party supabase-kt SDK -- this build
 * environment cannot verify new Gradle dependencies (see KNOWN_ISUES.md), so this reuses an
 * already-proven technique rather than introduce an unverifiable one.
 *
 * Returns/accepts the exact same shapes [RecordsRepository] already used for Firestore
 * (CapRecord/Map<String, Any?>), so [MainViewModel] and every screen composable need ZERO
 * changes -- only the data source underneath [RecordsRepository] changes, not its contract.
 *
 * "Observe" is POLLING-based (every [POLL_INTERVAL_MS]), not Firestore-style server push --
 * real-time push would require either the supabase-kt SDK or a hand-rolled Postgres-changes
 * WebSocket/Phoenix-channel client, both judged too much unverified risk to add in this phase.
 * A local write (create/update/delete) triggers an immediate targeted re-fetch via
 * [refreshSignals] so the signed-in user's own edits appear instantly; changes made by other
 * users/devices appear within one poll interval (worst case). This is a disclosed, temporary
 * simplification versus Firestore's real-time listeners, not an oversight.
 *
 * SECURITY: every request is authorized by the signed-in user's own Supabase access token
 * (via [SupabaseAuthRepository.accessToken]) against Postgres RLS -- the service-role key is
 * never present here, identical trust model to SupabaseAuth.kt and the web app's Supabase
 * client.
 */
@Singleton
class SupabaseDataRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    // Keyed by table name -- create/update/delete emit here so any active observeCollection(
    // table) flow re-fetches immediately instead of waiting for the next poll tick.
    private val refreshSignals = MutableSharedFlow<String>(extraBufferCapacity = 16)

    companion object {
        private const val POLL_INTERVAL_MS = 20_000L
    }

    fun observeCollection(table: String): Flow<List<CapRecord>> = channelFlow {
        suspend fun fetchAndSend() {
            val records = try {
                fetchAll(table)
            } catch (error: Exception) {
                close(error)
                return
            }
            send(records)
        }
        fetchAndSend()
        launch {
            while (true) {
                delay(POLL_INTERVAL_MS)
                fetchAndSend()
            }
        }
        launch {
            refreshSignals.collect { changedTable ->
                if (changedTable == table) fetchAndSend()
            }
        }
    }

    suspend fun create(table: String, fields: Map<String, Any?>): String = withContext(Dispatchers.IO) {
        val token = requireToken()
        val payload = fields.filterValues { it != null }.toMutableMap()
        payload["updated_at"] = nowIso()
        val response = request(
            "$baseUrl/rest/v1/$table",
            "POST",
            token,
            payload.toJsonObject().toString(),
            preferReturn = true
        )
        val id = JSONArray(response).getJSONObject(0).getString("id")
        refreshSignals.tryEmit(table)
        id
    }

    suspend fun update(table: String, id: String, fields: Map<String, Any?>) = withContext(Dispatchers.IO) {
        val token = requireToken()
        val payload = fields.filterValues { it != null }.toMutableMap()
        payload["updated_at"] = nowIso()
        request("$baseUrl/rest/v1/$table?id=eq.$id", "PATCH", token, payload.toJsonObject().toString())
        refreshSignals.tryEmit(table)
    }

    suspend fun delete(table: String, id: String) = withContext(Dispatchers.IO) {
        val token = requireToken()
        request("$baseUrl/rest/v1/$table?id=eq.$id", "DELETE", token, null)
        refreshSignals.tryEmit(table)
    }

    /** Row count for the Status screen's "sync" feature -- uses PostgREST's exact-count
     *  header rather than fetching every row just to count them. */
    suspend fun count(table: String): Int = withContext(Dispatchers.IO) {
        val token = requireToken()
        val connection = URL("$baseUrl/rest/v1/$table?select=id&limit=1").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Prefer", "count=exact")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val code = connection.responseCode
            if (code !in 200..299) throw ApiException("Unable to reach the database.")
            connection.getHeaderField("Content-Range")?.substringAfter("/")?.toIntOrNull() ?: 0
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun fetchAll(table: String): List<CapRecord> = withContext(Dispatchers.IO) {
        val token = requireToken()
        val body = request("$baseUrl/rest/v1/$table?select=*&order=created_at.desc", "GET", token, null)
        val array = JSONArray(body)
        (0 until array.length()).map { i -> array.getJSONObject(i).toCapRecord() }
    }

    private fun requireToken(): String = supabaseAuth.accessToken ?: throw ApiException("Not authenticated.")

    private fun request(urlString: String, method: String, token: String, body: String?, preferReturn: Boolean = false): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
            }
            if (preferReturn) connection.setRequestProperty("Prefer", "return=representation")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            if (body != null) {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use(BufferedReader::readText) }.orEmpty()
            if (code !in 200..299) {
                throw ApiException(
                    when (code) {
                        401 -> "Your session has expired. Sign in again."
                        403 -> "You do not have permission to do that."
                        404 -> "The requested record could not be found."
                        409 -> "This record was changed elsewhere. Please refresh and try again."
                        else -> "Unable to reach the CAP Database service. Please try again."
                    }
                )
            }
            return text
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }
}

private fun nowIso(): String = Instant.now().toString()

private fun Map<String, Any?>.toJsonObject(): JSONObject {
    val json = JSONObject()
    for ((key, value) in this) json.put(key, value ?: JSONObject.NULL)
    return json
}

private fun JSONObject.toCapRecord(): CapRecord {
    val map = mutableMapOf<String, Any?>()
    val keys = keys()
    while (keys.hasNext()) {
        val key = keys.next()
        map[key] = jsonValueToAny(get(key))
    }
    val id = map["id"]?.toString().orEmpty()
    return CapRecord(id, map)
}

private fun jsonValueToAny(value: Any?): Any? = when (value) {
    JSONObject.NULL -> null
    is JSONObject -> {
        val map = mutableMapOf<String, Any?>()
        val keys = value.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = jsonValueToAny(value.get(key))
        }
        map
    }
    is JSONArray -> (0 until value.length()).map { jsonValueToAny(value.get(it)) }
    else -> value
}
