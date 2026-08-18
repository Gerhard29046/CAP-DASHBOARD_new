package com.CAPDATABASE.capdatabase

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
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
 * Phase D/E1 (Android->Supabase migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md):
 * generic PostgREST-backed CRUD + polling "observe" for every table moved off Firestore so far
 * (see [SUPABASE_MIGRATED_TABLES] in Core.kt -- clients, machines, service_records, job_cards,
 * job_card_lines, and the 5 knowledge_* tables). Deliberately plain REST (HttpURLConnection/org.json), matching
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
 * (via [SupabaseAuthRepository.validAccessToken], which keeps it fresh) against Postgres RLS --
 * the service-role key is never present here, identical trust model to SupabaseAuth.kt and the
 * web app's Supabase client. Tokens are never logged: this file contains no logging at all, and
 * no error message it raises includes a token or a raw response body.
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

        /**
         * Tables that genuinely have no `created_at` column, so [fetchAll] must NOT ask PostgREST
         * to order by it (PostgREST answers 400 for an unknown order column, and on a cold-start
         * fetch that closes the flow -- which, through [RecordsRepository.observeCollections]'
         * `combine()`, would take every OTHER table's stream down with it).
         *
         * Verified against the .sql files under supabase/migrations: every other table this app
         * subscribes to (clients, machines, service_records, job_cards, job_card_lines, the 5 knowledge_*
         * tables, users, permissions, role_permissions -- 0001_initial_schema.sql; dashboard_notes
         * -- 0017; products_services -- 0018) declares `created_at timestamptz not null default
         * now()`, and no later migration drops it. `job_card_settings` (0018) is a singleton row
         * keyed on a boolean primary key with only `updated_at`/`updated_by`, so ordering it is
         * meaningless as well as invalid.
         *
         * `company_settings` (0030_service_certificates.sql) is the same singleton shape for the
         * same reason -- `id boolean primary key default true`, columns company_name/address/
         * phone/email/vat_number/updated_at/updated_by, no `created_at`. Confirmed by reading that
         * migration's `create table`, not inferred from a failing query. Its `service_certificates`
         * sibling table in the same migration DOES declare `created_at`, so it deliberately is not
         * listed here.
         *
         * Add a table here only after confirming in the migrations that the column really is
         * absent -- this is a schema fact, not a workaround for a failing query.
         */
        private val TABLES_WITHOUT_CREATED_AT = setOf("job_card_settings", "company_settings")
    }

    /**
     * Polling "observe" for one table.
     *
     * Failure policy (E1 reliability fix -- the previous version called `close(error)` on ANY
     * failure, which permanently terminated this flow, and through [RecordsRepository]'s
     * `combine()` took every OTHER table's stream down with it until app restart):
     *
     * - A TERMINAL auth failure (the refresh token itself was rejected -- [SessionExpiredException])
     *   still closes the flow with the error. That is honest and correct: no amount of retrying
     *   fixes it, the user must sign in again, and the existing `RecordsState.error` path shows
     *   exactly that.
     * - Any OTHER failure (network drop, timeout, 5xx, a transient 401 that the refresh already
     *   handled and lost anyway) is treated as one failed poll cycle, NOT as the end of the
     *   stream: it is swallowed, the last successfully emitted list stays on screen, and the next
     *   tick retries. One table hiccuping can no longer kill the others.
     * - EXCEPT on the very first fetch, before this flow has ever emitted: there is no
     *   last-good data to fall back on, and silently emitting nothing would leave the screen
     *   stuck on its loading state forever. So a cold-start failure still closes the flow and
     *   surfaces the error, exactly as it did before this change.
     *
     * Known, disclosed limitation: after at least one success, a transient failure is currently
     * invisible to the user -- the screen keeps showing the last-good rows with no "stale data"
     * indicator. Surfacing that would need a per-table status channel through
     * [RecordsRepository.observeCollections]' `combine()` and a UI change (out of this fix's
     * scope, and UI is android-ui-bee's). The Status screen's existing connection check remains
     * the user-visible signal for "the backend is unreachable right now".
     */
    fun observeCollection(table: String): Flow<List<CapRecord>> = channelFlow {
        var hasEmitted = false

        suspend fun fetchAndSend() {
            val records = try {
                fetchAll(table)
            } catch (error: SessionExpiredException) {
                close(error) // terminal: only a fresh sign-in can fix this
                return
            } catch (error: CancellationException) {
                // Not a failure: the collector went away (screen closed, user signed out).
                // Must propagate so coroutine cancellation still works -- swallowing it here
                // would be the classic "keep polling a dead flow" leak.
                throw error
            } catch (error: Exception) {
                // Transient. Keep the last good data and try again on the next tick; do NOT
                // close, or this table (and via combine(), every other table) dies here.
                if (!hasEmitted) close(error)
                return
            }
            send(records)
            hasEmitted = true
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
        val payload = fields.filterValues { it != null }.toMutableMap()
        payload["updated_at"] = nowIso()
        val response = withAuth { token ->
            request(
                "$baseUrl/rest/v1/$table",
                "POST",
                token,
                payload.toJsonObject().toString(),
                preferReturn = true
            )
        }
        val id = JSONArray(response).getJSONObject(0).getString("id")
        refreshSignals.tryEmit(table)
        id
    }

    suspend fun update(table: String, id: String, fields: Map<String, Any?>) = withContext(Dispatchers.IO) {
        val payload = fields.filterValues { it != null }.toMutableMap()
        payload["updated_at"] = nowIso()
        val response = withAuth { token ->
            request(
                "$baseUrl/rest/v1/$table?id=eq.$id",
                "PATCH",
                token,
                payload.toJsonObject().toString(),
                preferReturn = true
            )
        }
        requireRowAffected(table, id, response)
        refreshSignals.tryEmit(table)
    }

    suspend fun delete(table: String, id: String) = withContext(Dispatchers.IO) {
        val response = withAuth { token ->
            request("$baseUrl/rest/v1/$table?id=eq.$id", "DELETE", token, null, preferReturn = true)
        }
        requireRowAffected(table, id, response)
        refreshSignals.tryEmit(table)
    }

    /**
     * Fails a write that the server accepted but that actually changed NOTHING.
     *
     * Why [update]/[delete] must ask for the representation at all (live-confirmed against the
     * production project on 2026-08-17 via supabase/scripts/qa-verify-phase9-settings-rls.mjs):
     * a PATCH/DELETE that an RLS `USING` clause filtered down to zero rows is answered `204`,
     * byte-for-byte identical to the `204` a genuinely successful write returns. RLS itself is
     * correct -- the row is provably unchanged -- but the HTTP response gives the client no way
     * to tell "saved" from "silently refused", so `MainViewModel.save()`/`delete()` would have
     * reported "saved and synchronized." to a user whose permission was revoked mid-session
     * while the screen was still reachable from cached nav state. This is a UX-honesty fix, not
     * an authorization fix: nothing here grants anything, it only stops the client claiming a
     * write happened when it did not.
     *
     * Only `USING`-clause policies behave this way. A `WITH CHECK` policy (e.g.
     * `products_services_insert`) hard-fails 403, which [request] already surfaces -- which is
     * why [create] needs none of this and is deliberately left alone.
     *
     * A zero-length array means the `id=eq.` filter AND the RLS `USING` clause together matched
     * no row. It does NOT mean "the UPDATE ran but changed nothing": Postgres returns every row
     * an UPDATE touches even when the new values equal the old ones (and [update] always writes
     * a fresh `updated_at` regardless), so an authorized no-op edit still comes back as one row.
     * Nor can a legitimate write be lost to the SELECT policy: Postgres already requires the row
     * to be visible under a SELECT/ALL policy before a filtered UPDATE/DELETE can match it at
     * all, so anything this app is allowed to change is by construction allowed to be returned.
     *
     * A zero-row answer has exactly two possible causes, which [zeroRowMessage] tells apart with
     * one extra round-trip taken ONLY on this already-failed path (never on the success path, so
     * a normal save costs nothing extra): the RLS `USING` clause refused the write (the row is
     * still there), or the `id=eq.` filter matched nothing because the row is gone (someone else
     * deleted it while this screen was open). Whichever it is, this function ALWAYS throws -- the
     * probe only chooses the wording, it can never turn a refused write back into a success. That
     * invariant is the whole point of this function and must survive any future edit here.
     */
    private suspend fun requireRowAffected(table: String, id: String, response: String) {
        val affected = try {
            JSONArray(response).length()
        } catch (_: JSONException) {
            // 2xx with a body that isn't the representation we asked for -- unknown outcome.
            // Reported as such rather than assumed successful; silently treating it as a save
            // is exactly the failure mode this whole function exists to remove.
            throw ApiException("Unable to confirm the change was saved. Please refresh and try again.")
        }
        if (affected == 0) throw ApiException(zeroRowMessage(table, id))
    }

    /**
     * Chooses the honest message for a write that affected zero rows, by asking whether the row
     * is still there at all.
     *
     * - Row still readable -> the write itself was refused: the same "You do not have permission
     *   to do that." an outright 403 produces, so a denial reads identically to the user whichever
     *   HTTP shape it arrived in.
     * - Row not readable -> it is gone (or was never visible), which "permission" does not
     *   describe honestly -- the user is told to refresh instead of being blamed for a permission
     *   they may well have.
     *
     * Deliberate limitations, disclosed rather than hidden:
     * - A row the caller may edit but may NOT read would be reported as "no longer available".
     *   Not reachable in this app: every screen that offers an edit got the row from a
     *   `select`-gated list read first, so anything editable here is by construction readable.
     * - The probe races: a row deleted in the gap between the write and this check reports as
     *   "no longer available" rather than as the denial it actually was. Harmless -- the row
     *   really is gone by the time the user reads the message, and either way the write failed.
     * - If the probe itself fails (offline, session died, 5xx) the outcome is genuinely unknown,
     *   so it falls back to the pre-existing permission wording rather than inventing a
     *   conclusion from a failed check. Never returns "it worked".
     */
    private suspend fun zeroRowMessage(table: String, id: String): String {
        val denied = "You do not have permission to do that."
        val rowStillExists = try {
            val body = withAuth { token ->
                request("$baseUrl/rest/v1/$table?id=eq.$id&select=id", "GET", token, null)
            }
            JSONArray(body).length() > 0
        } catch (error: CancellationException) {
            throw error // the caller went away; must not be swallowed into a message
        } catch (_: Exception) {
            return denied
        }
        return if (rowStillExists) denied
        else "This record is no longer available -- it may have been deleted by someone else. Please refresh."
    }

    /**
     * Calls a Postgres function through PostgREST's RPC endpoint
     * (`POST /rest/v1/rpc/{functionName}`, JSON body = the named arguments).
     *
     * Added for `generate_service_certificate(p_service_record_id uuid, p_include_photos boolean)`
     * (`supabase/migrations/0030_service_certificates.sql`), which is the ONLY way a
     * `public.service_certificates` row can be created -- that table has no client-facing INSERT
     * policy or grant at all, deliberately, so a client cannot insert a row with a spoofed
     * `certificate_number`. The function is security-definer and runs its own
     * `has_permission('services.edit')` check first; that check, not anything in this file, is the
     * authorization boundary. Mirrors the web client's `serviceCertificatesApi.generate()`
     * (`frontend/src/api/supabaseApiClient.js`) exactly, including its idempotency: calling it
     * twice for the same service record updates and returns the existing row, reusing the original
     * certificate number, rather than erroring or minting a second one.
     *
     * SHAPE ASSUMPTION, and the reason this returns a single [CapRecord] rather than a list: a
     * function whose `returns` is a single composite type (`returns public.service_certificates`)
     * answers with a single JSON object. A `returns setof`/table-valued function answers with a
     * JSON array instead, which this method does NOT handle -- it would fail the parse below and
     * surface as the malformed-response error. Add a separate list-returning variant if such a
     * function is ever needed; do not loosen this one into "object or array", which would make the
     * caller's contract ambiguous.
     *
     * ACCEPTED SIMPLIFICATION, disclosed rather than hidden: a `RAISE EXCEPTION` raised inside the
     * function (e.g. 'Not permitted to generate a service certificate.', 'Service record not
     * found.') arrives as a non-2xx whose Postgres message is NOT threaded through to the user --
     * [request] maps it onto its existing fixed message set, exactly as an RLS denial anywhere else
     * in this file already collapses to "You do not have permission to do that.". That is this
     * codebase's established behavior, not a defect introduced here; changing it would mean
     * reworking [request]'s error contract for every caller.
     *
     * Emits no [refreshSignals] entry: this is a generic primitive with no way to know which table
     * a given function touched, and nothing currently observes `service_certificates` as a
     * collection anyway. A caller that needs a list to refresh should re-read it explicitly.
     */
    suspend fun rpc(functionName: String, params: Map<String, Any?>): CapRecord = withContext(Dispatchers.IO) {
        val response = withAuth { token ->
            request(
                "$baseUrl/rest/v1/rpc/$functionName",
                "POST",
                token,
                params.toJsonObject().toString()
            )
        }
        try {
            JSONObject(response).toCapRecord()
        } catch (_: JSONException) {
            // 2xx whose body is not the single composite row this contract expects. Reported as an
            // unknown outcome rather than silently turned into an empty record -- the caller must
            // not be told a certificate exists when the response cannot be read.
            throw ApiException("The service returned an unexpected response. Please try again.")
        }
    }

    /**
     * Single row matched by one equality filter, or `null` when there genuinely is no such row.
     *
     * Exists for `service_certificates.getForServiceRecord(serviceRecordId)` -- the web client's
     * `.eq("service_record_id", ...).maybeSingle()` (`frontend/src/api/supabaseApiClient.js`),
     * whose "no certificate generated yet" answer is a legitimate empty result the caller uses to
     * choose between "Generate" and "Regenerate/Download", NOT an error. Generalized to any
     * table/column rather than written certificate-specific, since single-row-by-foreign-key is an
     * obvious future need, but deliberately kept to exactly one equality filter -- anything richer
     * belongs in a purpose-built method, not in a creeping generic query builder.
     *
     * `null` here means "the query succeeded and matched nothing". Every failure mode (auth,
     * permission, network, malformed response) still throws, exactly as elsewhere in this class --
     * an error is never collapsed into a null/empty result.
     */
    suspend fun fetchOne(table: String, filterColumn: String, filterValue: String): CapRecord? =
        withContext(Dispatchers.IO) {
            val body = withAuth { token ->
                request("$baseUrl/rest/v1/$table?$filterColumn=eq.$filterValue&select=*", "GET", token, null)
            }
            val array = try {
                JSONArray(body)
            } catch (_: JSONException) {
                throw ApiException("The service returned an unexpected response. Please try again.")
            }
            if (array.length() == 0) null else array.getJSONObject(0).toCapRecord()
        }

    /** Row count for the Status screen's "sync" feature -- uses PostgREST's exact-count
     *  header rather than fetching every row just to count them. */
    suspend fun count(table: String): Int = withContext(Dispatchers.IO) {
        withAuth { token -> countWithToken(table, token) }
    }

    private fun countWithToken(table: String, token: String): Int {
        val connection = URL("$baseUrl/rest/v1/$table?select=id&limit=1").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Prefer", "count=exact")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val code = connection.responseCode
            // 401 must stay distinguishable so withAuth() can refresh and retry once, instead of
            // reporting "unable to reach the database" for what is really a stale token.
            if (code == 401) throw UnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to reach the database.")
            return connection.getHeaderField("Content-Range")?.substringAfter("/")?.toIntOrNull() ?: 0
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun fetchAll(table: String): List<CapRecord> = withContext(Dispatchers.IO) {
        // Newest-first everywhere the column exists; see [TABLES_WITHOUT_CREATED_AT] for why the
        // order clause has to be omitted for the handful of tables that lack it.
        val query = if (table in TABLES_WITHOUT_CREATED_AT) "select=*" else "select=*&order=created_at.desc"
        val body = withAuth { token ->
            request("$baseUrl/rest/v1/$table?$query", "GET", token, null)
        }
        val array = JSONArray(body)
        (0 until array.length()).map { i -> array.getJSONObject(i).toCapRecord() }
    }

    /**
     * Runs one authorized request, transparently recovering from an expired access token.
     *
     * Contract (E1 reliability fix): obtain a token that [SupabaseAuthRepository.validAccessToken]
     * considers fresh (it refreshes proactively if the tracked expiry has passed), run [block],
     * and if the server nonetheless answers 401, refresh ONCE and run [block] exactly ONCE more.
     *
     * Exactly-one-retry is structural, not counter-based: the retry path calls [block] directly
     * rather than re-entering [withAuth], and a 401 on that second attempt is converted to a
     * terminal [SessionExpiredException] instead of looping. There is no code path that can
     * produce a third attempt.
     *
     * Concurrency: N callers hitting 401 at once all funnel into
     * [SupabaseAuthRepository.refreshAfterUnauthorized], which is Mutex-guarded and
     * generation-checked, so they share ONE refresh call and then each retry their own request.
     */
    private suspend fun <T> withAuth(block: (String) -> T): T {
        val token = try {
            supabaseAuth.validAccessToken()
        } catch (error: SupabaseAuthException) {
            throw error.asDataException()
        }
        return try {
            block(token.value)
        } catch (_: UnauthorizedException) {
            val refreshed = try {
                supabaseAuth.refreshAfterUnauthorized(token)
            } catch (error: SupabaseAuthException) {
                throw error.asDataException()
            }
            try {
                block(refreshed.value)
            } catch (_: UnauthorizedException) {
                // Rejected even with a token minted seconds ago -- not a staleness problem.
                // Stop here rather than retry again.
                throw SessionExpiredException("Your session has expired. Sign in again.")
            }
        }
    }

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
            // 401 is thrown as a distinct type (not an ApiException) so withAuth() can tell
            // "stale access token, refresh and retry once" apart from every other failure.
            if (code == 401) throw UnauthorizedException()
            if (code !in 200..299) {
                throw ApiException(
                    when (code) {
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

/**
 * Terminal auth failure: the session cannot be re-minted (refresh token expired/revoked/rejected)
 * and only a fresh sign-in will fix it. Subclasses [ApiException] so every existing
 * `catch (error: ApiException)` call site in MainViewModel keeps behaving exactly as before --
 * the subtype exists purely so [SupabaseDataRepository.observeCollection] can tell a permanent
 * auth failure (close the flow, show "sign in again") from a transient one (keep polling).
 */
class SessionExpiredException(message: String) : ApiException(message)

/** Internal marker for "the server said 401". Never surfaced to callers: [SupabaseDataRepository.withAuth]
 *  either recovers from it (refresh + one retry) or converts it to [SessionExpiredException]. */
private class UnauthorizedException : Exception("Unauthorized")

/** Maps an auth-layer failure onto the data layer's exception contract, preserving the
 *  transient/terminal distinction rather than flattening everything into "session expired". */
private fun SupabaseAuthException.asDataException(): ApiException = when {
    isSessionExpired -> SessionExpiredException(message ?: "Your session has expired. Sign in again.")
    isNetworkError -> ApiException("Network unavailable. Please check your connection.")
    else -> ApiException(message ?: "Unable to reach the CAP Database service. Please try again.")
}

private fun nowIso(): String = Instant.now().toString()

private fun Map<String, Any?>.toJsonObject(): JSONObject {
    val json = JSONObject()
    for ((key, value) in this) json.put(key, anyToJsonValue(value))
    return json
}

/**
 * Phase E1: collection/map values must become real JSONArray/JSONObject instances before
 * `JSONObject.toString()` runs. org.json does NOT auto-wrap a java.util.List/Map -- its
 * stringifier falls through to `value.toString()` for unknown types, which would have written
 * a Postgres `text[]` column as the literal string `"[a, b]"` and a `jsonb` column as
 * `"{k=v}"`. Nothing writes these today (Android's only knowledge-base write is "Add Note",
 * all plain strings; `service_records.photos`/`job_cards.arrival_photos` are read-only until
 * Phase E2), but the mapper is generic, and `knowledge_machines.supported_refrigerants`/
 * `main_functions` (text[]) and `technical_specifications` (jsonb) are the first tables routed
 * through it that have such columns at all -- so fixing it here rather than leaving a trap for
 * the first screen that does write one.
 *
 * The read direction already handled both correctly: PostgREST serialises text[] as a JSON
 * array and jsonb as a JSON object, which [jsonValueToAny] turns into a Kotlin List/Map --
 * exactly what MainActivity.kt's `stringList()`/`stringMap()` helpers expect.
 */
private fun anyToJsonValue(value: Any?): Any = when (value) {
    null -> JSONObject.NULL
    is JSONObject, is JSONArray -> value
    is Map<*, *> -> JSONObject().also { json ->
        for ((key, entryValue) in value) {
            if (key is String) json.put(key, anyToJsonValue(entryValue))
        }
    }
    is Iterable<*> -> JSONArray().also { array -> value.forEach { array.put(anyToJsonValue(it)) } }
    is Array<*> -> JSONArray().also { array -> value.forEach { array.put(anyToJsonValue(it)) } }
    else -> value
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
