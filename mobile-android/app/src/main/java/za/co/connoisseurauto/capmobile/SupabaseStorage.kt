package com.CAPDATABASE.capdatabase

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Record-scoped, PERMANENT-path photo storage for `service_records.photos` /
 * `job_cards.arrival_photos` (E2 Photo Upload -- see docs/ai-memory/DECISIONS.md's matching
 * entry and `supabase/migrations/0024_photos_bucket_record_scoped_rls.sql`, already applied and
 * functionally verified in production). Mirrors the web implementation's contract exactly
 * (frontend/src/services/supabase/storage.js's uploadRecordPhoto()/getRecordPhotoSignedUrl()/
 * deleteRecordPhoto()): the database stores the PERMANENT Storage object path, never a signed
 * URL -- a signed URL must be generated fresh at display time and never written back.
 *
 * Deliberately plain REST (`HttpURLConnection`/`org.json`), matching `SupabaseAuth.kt`/
 * `SupabaseData.kt`'s existing precedent -- **not** the third-party `supabase-kt` SDK. This
 * build environment cannot verify a new Gradle dependency resolves, and every technique used
 * here (auth-header shape, refresh-once-retry-once via [SupabaseAuthRepository], org.json
 * parsing) is already proven working in this exact codebase.
 *
 * Wire format below was verified live against the real Storage REST API (not assumed from
 * documentation) before this file was written:
 * - Upload: `POST {baseUrl}/storage/v1/object/photos/{path}`, raw bytes body, `Content-Type`
 *   set to the actual image MIME type -> `200 {"Key":"photos/{path}","Id":"..."}`.
 * - Sign: `POST {baseUrl}/storage/v1/object/sign/photos/{path}`, JSON body
 *   `{"expiresIn": <seconds>}` -> `200 {"signedURL":"/object/sign/photos/{path}?token=..."}` --
 *   a RELATIVE path; the full URL is `{baseUrl}/storage/v1` + that relative path.
 * - Delete: `DELETE {baseUrl}/storage/v1/object/photos/{path}`, **no body, no Content-Type
 *   header** (sending an empty JSON-typed body 400s -- confirmed live) -> `200`.
 * - An RLS policy violation on upload comes back as **400**, not 403 (confirmed live against
 *   migration 0024's policies) -- error handling below does not assume 403 is the only
 *   "denied" status; any non-2xx is treated as a failure.
 *
 * SECURITY: every request uses [SupabaseAuthRepository.validAccessToken] (the caller's own
 * session, refreshed proactively/on-401 exactly like [SupabaseDataRepository]) plus
 * `BuildConfig.SUPABASE_ANON_KEY`. The service-role key is never present here or anywhere in
 * `mobile-android/`. Authorization for every operation is enforced entirely by migration 0024's
 * Storage RLS (`can_access_service_record_photo`/`can_access_job_card_photo`, keyed off
 * `services.view`/`.edit` and `job_cards.view`/`.edit`) -- this file does not duplicate or
 * second-guess that logic, it only calls the REST endpoints those policies already gate.
 *
 * Never logs a token, an access/signed URL's query string, or a raw response body -- matches
 * this codebase's existing "never log tokens or raw error bodies" convention.
 */

/** The only two valid namespaces -- matches migration 0024's `can_access_service_record_photo`/
 *  `can_access_job_card_photo` prefix checks exactly. */
object RecordPhotoNamespace {
    const val SERVICE_RECORD = "service-records"
    const val JOB_CARD = "job-cards"
}

/**
 * Pure path construction, no network/Android dependency -- unit-tested directly. Must exactly
 * match the path shape migration 0024 expects: `{namespace}/{recordId}/{uuid}-{fileName}`,
 * exactly 2 folder segments before the filename. This is the ONLY place a record-photo path is
 * constructed -- callers of [SupabaseStorageRepository.uploadPhoto] supply a namespace + record
 * id, never a raw path, so it is structurally impossible for a caller to construct an arbitrary
 * path that bypasses the intended namespace/record-id design.
 */
fun buildRecordPhotoPath(namespace: String, recordId: String, fileName: String): String {
    require(namespace == RecordPhotoNamespace.SERVICE_RECORD || namespace == RecordPhotoNamespace.JOB_CARD) {
        "buildRecordPhotoPath: invalid namespace \"$namespace\""
    }
    require(recordId.isNotBlank()) { "buildRecordPhotoPath: recordId is required" }
    require(fileName.isNotBlank()) { "buildRecordPhotoPath: fileName is required" }
    return "$namespace/$recordId/${UUID.randomUUID()}-$fileName"
}

@Singleton
class SupabaseStorageRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    private companion object {
        const val BUCKET = "photos"
    }

    /**
     * Uploads [bytes] to a record-scoped path built internally from [namespace]/[recordId] --
     * never accepts a caller-supplied path. Returns the PERMANENT object path; the caller is
     * responsible for persisting it (never a signed URL) into the relevant record's
     * `photos`/`arrival_photos` array via the existing generic `RecordsRepository.update()`.
     */
    suspend fun uploadPhoto(
        namespace: String,
        recordId: String,
        bytes: ByteArray,
        contentType: String,
        fileName: String
    ): String = withContext(Dispatchers.IO) {
        val path = buildRecordPhotoPath(namespace, recordId, fileName)
        withAuth { token -> uploadBytes(path, bytes, contentType, token) }
        path
    }

    /** Fresh signed URL for displaying an already-known, already-stored path. Never persist the
     *  result -- it expires; the stored path does not. */
    suspend fun createSignedUrl(path: String, expiresInSeconds: Long = 3_600L): String =
        withContext(Dispatchers.IO) {
            withAuth { token -> signUrl(path, expiresInSeconds, token) }
        }

    /** Best-effort delete. Callers must remove the path from the record's array via their own
     *  `update()` regardless of whether this succeeds -- a Storage-delete failure must never
     *  block the database update (matches the web implementation's exact delete contract). */
    suspend fun deletePhoto(path: String): Unit = withContext(Dispatchers.IO) {
        withAuth { token -> deleteObject(path, token) }
    }

    /** Same refresh-once-then-retry-once contract as [SupabaseDataRepository.withAuth] --
     *  duplicated rather than shared, matching this codebase's existing per-file convention
     *  (each Supabase REST file owns its own small 401-handling helper; see
     *  [SupabaseDataRepository.withAuth]/[SupabaseAuthRepository.loadProfile] for the same
     *  shape used independently in the other two files). */
    private suspend fun <T> withAuth(block: (String) -> T): T {
        val token = try {
            supabaseAuth.validAccessToken()
        } catch (error: SupabaseAuthException) {
            throw error.asStorageException()
        }
        return try {
            block(token.value)
        } catch (_: StorageUnauthorizedException) {
            val refreshed = try {
                supabaseAuth.refreshAfterUnauthorized(token)
            } catch (error: SupabaseAuthException) {
                throw error.asStorageException()
            }
            try {
                block(refreshed.value)
            } catch (_: StorageUnauthorizedException) {
                throw SessionExpiredException("Your session has expired. Sign in again.")
            }
        }
    }

    private fun uploadBytes(path: String, bytes: ByteArray, contentType: String, token: String) {
        val connection = URL("$baseUrl/storage/v1/object/$BUCKET/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", contentType)
            connection.connectTimeout = 15_000
            // Photos are meaningfully larger than the JSON payloads every other request in this
            // app sends -- a longer read timeout avoids spurious failures on slower connections.
            connection.readTimeout = 30_000
            connection.outputStream.use { it.write(bytes) }
            val code = connection.responseCode
            drainForClose(connection, code)
            // Confirmed live: an RLS violation on upload comes back as 400, not 403 -- do not
            // special-case 403 as "the" denied status, treat any non-2xx (other than 401,
            // handled separately) as a failure with a fixed, non-leaking message.
            if (code == 401) throw StorageUnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to upload this photo. Please try again.")
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }

    private fun signUrl(path: String, expiresInSeconds: Long, token: String): String {
        val connection = URL("$baseUrl/storage/v1/object/sign/$BUCKET/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val body = JSONObject().put("expiresIn", expiresInSeconds).toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val text = readBody(connection, code)
            if (code == 401) throw StorageUnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to load this photo right now. Please try again.")
            val relative = JSONObject(text).getString("signedURL")
            return "$baseUrl/storage/v1$relative"
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }

    private fun deleteObject(path: String, token: String) {
        val connection = URL("$baseUrl/storage/v1/object/$BUCKET/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "DELETE"
            // Deliberately NO Content-Type header and NO body -- confirmed live that sending an
            // empty body with Content-Type: application/json 400s ("Body cannot be empty when
            // content-type is set to 'application/json'"). A bodyless DELETE with no
            // Content-Type is what actually succeeds.
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val code = connection.responseCode
            drainForClose(connection, code)
            if (code == 401) throw StorageUnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to delete this photo. Please try again.")
        } catch (error: IOException) {
            throw ApiException("Network unavailable. Please check your connection.")
        } finally {
            connection.disconnect()
        }
    }

    private fun readBody(connection: HttpURLConnection, code: Int): String {
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        return stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use(BufferedReader::readText) }.orEmpty()
    }

    /** Upload/delete responses aren't parsed, but the stream must still be drained/closed. */
    private fun drainForClose(connection: HttpURLConnection, code: Int) {
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        stream?.use { it.readBytes() }
    }
}

/** Internal marker for "the server said 401" -- scoped to this file only, matching
 *  [SupabaseDataRepository]'s own identically-shaped, identically-private marker (not shared
 *  across files, by existing convention). Never surfaces to callers: [SupabaseStorageRepository.withAuth]
 *  either recovers from it or converts it to [SessionExpiredException]. */
private class StorageUnauthorizedException : Exception("Unauthorized")

/** Maps an auth-layer failure onto this file's exception contract -- mirrors
 *  [SupabaseDataRepository]'s identically-shaped, identically-private `asDataException()`. */
private fun SupabaseAuthException.asStorageException(): ApiException = when {
    isSessionExpired -> SessionExpiredException(message ?: "Your session has expired. Sign in again.")
    isNetworkError -> ApiException("Network unavailable. Please check your connection.")
    else -> ApiException(message ?: "Unable to reach the CAP Database service. Please try again.")
}
