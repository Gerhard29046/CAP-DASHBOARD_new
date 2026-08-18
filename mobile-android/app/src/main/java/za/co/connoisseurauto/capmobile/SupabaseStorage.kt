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
 *  `can_access_job_card_photo` prefix checks exactly. Profile photos (cross-platform parity
 *  Phase 7) deliberately do NOT use this namespace/path shape -- they reuse the pre-existing
 *  `profile-images` bucket instead, which already has a different, simpler, one-file-per-user
 *  path convention (`{auth.uid()}/...`, no per-upload UUID) established in
 *  `0004_storage_buckets.sql` before this session, matching the web client's already-existing
 *  (if previously unwired) `uploadProfileImage()`. See [SupabaseAvatarRepository] below. */
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
    require(
        namespace == RecordPhotoNamespace.SERVICE_RECORD ||
            namespace == RecordPhotoNamespace.JOB_CARD
    ) {
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

/**
 * Cross-platform parity Phase 7 (profile photo). Deliberately a separate, small class rather
 * than another [SupabaseStorageRepository] namespace -- the `profile-images` bucket
 * (`0004_storage_buckets.sql`) has a genuinely different contract from the `photos` bucket
 * [SupabaseStorageRepository] already owns: one fixed path per user (`{userId}/avatar.webp`,
 * always the same object, upsert-overwritten on every re-upload) rather than an ever-growing
 * set of uniquely-named record photos. Reuses that bucket rather than creating a new one or
 * bending it to fit the record-photo shape -- matches the web client's own pre-existing (if
 * previously unwired) `uploadProfileImage()` (`frontend/src/services/supabase/storage.js`),
 * same bucket, same one-file-per-user path.
 *
 * `photo_path` (`public.users.photo_path`, migration 0026, NOT YET APPLIED as of this file being
 * written) stores this permanent path, never a signed URL -- same permanent-path/sign-at-display
 * discipline as [SupabaseStorageRepository], deliberately not the 7-day-signed-URL mistake found
 * live in Knowledge Base uploads this same session (see docs/ai-memory/KNOWN_ISSUES.md).
 *
 * WIRE FORMAT NOTE, disclosed rather than asserted as confirmed: upload uses an `x-upsert: true`
 * header on the same `POST {baseUrl}/storage/v1/object/profile-images/{path}` shape
 * [SupabaseStorageRepository.uploadBytes] already uses and has confirmed live for the `photos`
 * bucket -- `x-upsert` is Supabase Storage's documented mechanism for "overwrite if exists"
 * instead of a create-only POST erroring on conflict. Unlike every other wire-format detail in
 * this file, this one has NOT been independently confirmed against the live project, because
 * migration 0026 (which changes `profile-images`' RLS to actually permit this feature to work at
 * all) has not been applied yet -- there is no live policy to test an upload against until then.
 * Verify this specific detail for real once 0026 is applied, rather than trusting this comment.
 */
@Singleton
class SupabaseAvatarRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    private companion object {
        const val BUCKET = "profile-images"
        const val FILE_NAME = "avatar.webp"
    }

    /** Always the same path for a given user -- matches `profile-images`' existing
     *  `{auth.uid()}/...` RLS path convention (0004_storage_buckets.sql), one folder segment,
     *  no per-upload uniqueness. Re-uploading replaces the previous avatar at the same path. */
    fun avatarPath(userId: String): String {
        require(userId.isNotBlank()) { "avatarPath: userId is required" }
        return "$userId/$FILE_NAME"
    }

    /** Uploads (overwriting any existing avatar) and returns the permanent path -- the caller
     *  persists this into `public.users.photo_path` via the existing generic
     *  `RecordsRepository.update("users", userId, mapOf("photo_path" to path))`, never a signed
     *  URL. [userId] must be the caller's own id -- 0026's RLS permits a write only where the
     *  path's id segment equals `auth.uid()` (or an admin), so uploading under any other id is
     *  rejected server-side regardless of what this method is given. */
    suspend fun uploadAvatar(userId: String, bytes: ByteArray, contentType: String): String =
        withContext(Dispatchers.IO) {
            val path = avatarPath(userId)
            withAuth { token -> uploadBytes(path, bytes, contentType, token) }
            path
        }

    /** Fresh signed URL for displaying an already-known avatar path. Never persist the result. */
    suspend fun createAvatarSignedUrl(path: String, expiresInSeconds: Long = 3_600L): String =
        withContext(Dispatchers.IO) {
            withAuth { token -> signUrl(path, expiresInSeconds, token) }
        }

    /** Best-effort delete (e.g. "remove my photo"). Callers must clear `photo_path` via their
     *  own `update()` regardless of whether this succeeds, same contract as
     *  [SupabaseStorageRepository.deletePhoto]. */
    suspend fun deleteAvatar(path: String): Unit = withContext(Dispatchers.IO) {
        withAuth { token -> deleteObject(path, token) }
    }

    /** Same refresh-once-then-retry-once contract every Supabase REST file in this codebase
     *  duplicates independently -- see [SupabaseStorageRepository.withAuth]'s identical comment
     *  for why this isn't shared/extracted. */
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
            // See this class's own KDoc: unlike every other header in this file, x-upsert has
            // not been independently confirmed live yet (0026 isn't applied).
            connection.setRequestProperty("x-upsert", "true")
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.outputStream.use { it.write(bytes) }
            val code = connection.responseCode
            drainForClose(connection, code)
            if (code == 401) throw StorageUnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to upload your photo. Please try again.")
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
            if (code !in 200..299) throw ApiException("Unable to load your photo right now. Please try again.")
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
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val code = connection.responseCode
            drainForClose(connection, code)
            if (code == 401) throw StorageUnauthorizedException()
            if (code !in 200..299) throw ApiException("Unable to remove your photo. Please try again.")
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

    private fun drainForClose(connection: HttpURLConnection, code: Int) {
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        stream?.use { it.readBytes() }
    }
}

/**
 * Pure path construction for a generated Service Certificate PDF, no network/Android dependency
 * -- unit-tested directly, exactly like [buildRecordPhotoPath]. Must match migration 0030's
 * `can_access_service_certificate()` (`supabase/migrations/0030_service_certificates.sql`), which
 * requires EXACTLY ONE folder segment and that segment to parse as the uuid of an existing
 * `public.service_records` row: `{serviceRecordId}/{certificateNumber}.pdf`. Unlike the shared
 * `photos` bucket there is no extra namespace segment -- `bucket_id = 'service-certificates'`
 * already discriminates, and adding one would make the policy's `array_length(segments, 1) <> 1`
 * check fail. Identical to the web client's `uploadServiceCertificate()`
 * (`frontend/src/services/supabase/storage.js`).
 *
 * Deliberately contains NO per-upload uuid: the path must be STABLE across regenerations, because
 * `certificate_number` is assigned once and never changes (see `generate_service_certificate()`),
 * and regenerating overwrites the same object rather than orphaning the previous one.
 */
fun buildServiceCertificatePath(serviceRecordId: String, certificateNumber: String): String {
    require(serviceRecordId.isNotBlank()) { "buildServiceCertificatePath: serviceRecordId is required" }
    require(certificateNumber.isNotBlank()) { "buildServiceCertificatePath: certificateNumber is required" }
    return "$serviceRecordId/$certificateNumber.pdf"
}

/**
 * Service Certificate PDF storage (`service-certificates` bucket, migration 0030). A separate
 * small class rather than another [SupabaseStorageRepository] namespace, matching this file's
 * existing per-bucket-class convention (see [SupabaseAvatarRepository]'s KDoc for the same
 * reasoning): the bucket, its path shape, its MIME restriction (`application/pdf` only, enforced
 * server-side by the bucket's `allowed_mime_types`) and its overwrite semantics all differ from
 * the `photos` bucket's.
 *
 * `service_certificates.pdf_path` stores the PERMANENT object path returned by
 * [uploadCertificate], never a signed URL -- same discipline as [SupabaseStorageRepository] and
 * the Knowledge Base fix below. A fresh signed URL is minted at preview/download time via
 * [createSignedUrl] and never written back to the database.
 *
 * Authorization is entirely migration 0030's Storage RLS
 * (`can_access_service_certificate(name, 'services.view'|'services.edit')`); nothing here
 * duplicates or second-guesses it.
 *
 * WIRE FORMAT NOTE, disclosed rather than asserted: the upload/sign shapes below are the ones
 * already confirmed live against this project's Storage REST API for the `photos` bucket (see
 * this file's header). Two specifics have NOT been independently confirmed against the
 * `service-certificates` bucket from this environment, because that needs a live authenticated
 * request this machine cannot make as part of writing the file: (1) the `x-upsert: true`
 * overwrite header -- shared with [SupabaseAvatarRepository], which carries the same disclosure;
 * (2) that an overwrite is gated by the bucket's UPDATE policy rather than only its INSERT
 * policy. 0030 grants `services.edit` for both, so the outcome is the same either way, but verify
 * for real rather than trusting this comment.
 */
@Singleton
class SupabaseCertificateRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    private companion object {
        const val BUCKET = "service-certificates"
        const val CONTENT_TYPE = "application/pdf"
    }

    /**
     * Uploads (overwriting any previous PDF at the same path) and returns the permanent object
     * path. The caller persists that path into `service_certificates.pdf_path` via the existing
     * generic `update("service_certificates", id, mapOf("pdf_path" to path))` -- never a signed
     * URL.
     *
     * Overwrite-on-regenerate is why this sets `x-upsert: true` and follows
     * [SupabaseAvatarRepository]'s precedent rather than [SupabaseStorageRepository]'s create-only
     * photo upload: the certificate number, and therefore the path, is unchanged on regeneration,
     * so a create-only POST would conflict on every regenerate.
     */
    suspend fun uploadCertificate(
        serviceRecordId: String,
        certificateNumber: String,
        pdfBytes: ByteArray
    ): String = withContext(Dispatchers.IO) {
        val path = buildServiceCertificatePath(serviceRecordId, certificateNumber)
        withAuth { token -> uploadBytes(path, pdfBytes, token) }
        path
    }

    /** Fresh signed URL for previewing/downloading an already-stored certificate path. Never
     *  persist the result -- it expires; `pdf_path` does not. */
    suspend fun createSignedUrl(path: String, expiresInSeconds: Long = 3_600L): String =
        withContext(Dispatchers.IO) {
            withAuth { token -> signUrl(path, expiresInSeconds, token) }
        }

    /** Same refresh-once-then-retry-once contract every Supabase REST file in this codebase
     *  duplicates independently -- see [SupabaseStorageRepository.withAuth]'s comment for why
     *  this is not shared/extracted. */
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

    private fun uploadBytes(path: String, bytes: ByteArray, token: String) {
        val connection = URL("$baseUrl/storage/v1/object/$BUCKET/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", CONTENT_TYPE)
            // Regenerating a certificate rewrites the SAME object at the SAME path -- see this
            // method's KDoc. Carries [SupabaseAvatarRepository]'s same not-yet-live-confirmed
            // disclosure for this header.
            connection.setRequestProperty("x-upsert", "true")
            connection.connectTimeout = 15_000
            // A PDF is larger than the JSON payloads most of this app sends -- same longer read
            // timeout [SupabaseStorageRepository.uploadBytes] uses for photos.
            connection.readTimeout = 30_000
            connection.outputStream.use { it.write(bytes) }
            val code = connection.responseCode
            drainForClose(connection, code)
            if (code == 401) throw StorageUnauthorizedException()
            // As confirmed live for the photos bucket, a Storage RLS violation can arrive as 400
            // rather than 403 -- any non-2xx is treated as a failure, with a fixed message that
            // leaks neither the token nor the response body.
            if (code !in 200..299) throw ApiException("Unable to upload this certificate. Please try again.")
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
            if (code !in 200..299) throw ApiException("Unable to open this certificate right now. Please try again.")
            val relative = JSONObject(text).getString("signedURL")
            return "$baseUrl/storage/v1$relative"
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

    private fun drainForClose(connection: HttpURLConnection, code: Int) {
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        stream?.use { it.readBytes() }
    }
}

/**
 * Signing-only access to the `documents` bucket for already-uploaded Knowledge Base files.
 *
 * WHY THIS EXISTS: `knowledge_media.file_url` / `knowledge_documents.file_url` used to hold a
 * ready-to-use (7-day) signed URL, which is what this app's Knowledge Base detail screen still
 * assumes. As of `supabase/migrations/0029_knowledge_base_permanent_file_paths.sql` (applied) plus
 * the matching shipped web change (`frontend/src/services/supabase/storage.js`'s
 * `uploadKnowledgeMedia()`/`uploadKnowledgeDocument()`/`getKnowledgeFileSignedUrl()`), both columns
 * now store a PERMANENT Storage object path -- `knowledge-media/{knowledgeMachineId}/{uuid}-{name}`
 * or `knowledge-documents/{knowledgeMachineId}/{uuid}-{name}`. The column name did not change, only
 * the meaning of its contents. Loading that value directly as a URL therefore cannot work any more;
 * it must be signed at display time through this class first. Wiring that into the screen is
 * android-ui-bee's follow-up -- this class only supplies the primitive.
 *
 * A separate class rather than a new bucket constant on [SupabaseStorageRepository], which is
 * hardcoded to `photos`: changing that class's bucket would alter behavior for every existing
 * photo caller, which must keep working byte-for-byte as before.
 *
 * DELIBERATELY SIGN-ONLY -- no upload, no delete. Android has no Knowledge Base upload capability
 * (see `docs/ai-memory/KNOWN_ISSUES.md`); it only displays content uploaded from the web client, so
 * adding write methods here would be speculative surface with real RLS consequences. 0029's
 * `knowledge_base.create`/`.edit`/`.delete`-gated policies exist server-side regardless, so nothing
 * is weakened by this class not calling them.
 *
 * Authorization is entirely 0029's record-scoped Storage RLS
 * (`can_access_knowledge_media`/`can_access_knowledge_document`, gated on `knowledge_base.view` for
 * reads) -- notably record-scoped, not owner-scoped, which is what lets a technician who did not
 * personally upload a file open it at all. Nothing here filters or re-checks that client-side.
 */
@Singleton
class SupabaseKnowledgeFileRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    private companion object {
        const val BUCKET = "documents"
    }

    /**
     * Fresh signed URL for an already-stored `knowledge_media.file_url`/
     * `knowledge_documents.file_url` path. Never persist the result back into either table -- it
     * expires, and persisting it is precisely the bug 0029 exists to fix.
     *
     * [path] must be the stored value as-is (it already carries its `knowledge-media/`/
     * `knowledge-documents/` prefix); this method must not prepend or rewrite anything, or 0029's
     * `array_length(segments, 1) <> 2` path-shape check will reject it.
     */
    suspend fun createSignedUrl(path: String, expiresInSeconds: Long = 3_600L): String =
        withContext(Dispatchers.IO) {
            withAuth { token -> signUrl(path, expiresInSeconds, token) }
        }

    /** Same refresh-once-then-retry-once contract duplicated per file by existing convention --
     *  see [SupabaseStorageRepository.withAuth]. */
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
            if (code !in 200..299) throw ApiException("Unable to open this file right now. Please try again.")
            val relative = JSONObject(text).getString("signedURL")
            return "$baseUrl/storage/v1$relative"
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
