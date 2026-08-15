package com.CAPDATABASE.capdatabase

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase Auth (GoTrue) + `public.users` profile client for Phase C of the Android->Supabase
 * migration (see docs/android/ANDROID_SUPABASE_MIGRATION.md). Uses plain REST calls, matching
 * the existing GoogleCalendarRepository.kt pattern, rather than adding the third-party
 * supabase-kt SDK -- deliberate: this build environment cannot currently resolve or verify
 * new Gradle dependencies (confirmed, see KNOWN_ISSUES.md), so this avoids introducing an
 * entirely unverifiable dependency. Every technique used here (org.json, HttpURLConnection,
 * coroutines) was already proven working in this codebase before this file existed.
 *
 * SECURITY: uses BuildConfig.SUPABASE_ANON_KEY (the publishable/anon key, same real value
 * already committed in frontend/.env.production -- safe, public, RLS-constrained) for every
 * call. The service-role key is never present in this file, this module, or anywhere in
 * mobile-android/ -- profile reads are authorized by the signed-in user's own access token
 * against RLS (`public.users`' `users_select` policy: `auth.uid() = id or is_admin()`),
 * identical trust model to the web app's Supabase client.
 *
 * Session persistence: only the refresh token is persisted (Keystore-backed
 * EncryptedSharedPreferences, per CLAUDE.md's Android conventions -- never a plaintext
 * password, never stored unencrypted). The short-lived access token lives in memory only,
 * re-minted from the refresh token on process start via [restore] AND, from the E1 reliability
 * fix onward, whenever it expires or a request comes back 401 -- see [validAccessToken] /
 * [refreshAfterUnauthorized].
 *
 * NEVER log an access or refresh token. This file deliberately contains no logging at all;
 * every error surfaced from here is one of a fixed set of product-facing strings (see
 * [readResponse]), never a raw body or token.
 */

data class SupabaseSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    /** Epoch millis at which [accessToken] stops being accepted, derived from the token
     *  response's own `expires_at`/`expires_in` -- never a guessed TTL. */
    val accessTokenExpiresAtMs: Long
) {
    /** Overridden so the data-class default can never print the tokens into a log/crash report
     *  if some future call site does `Log.d(TAG, "$session")`. */
    override fun toString(): String = "SupabaseSession(userId=$userId, tokens=REDACTED)"
}

/**
 * An access token plus the session generation it belongs to. Callers hand the generation back
 * to [SupabaseAuthRepository.refreshAfterUnauthorized] so a refresh triggered by a stale token
 * can be recognised as already-done by whichever concurrent caller got there first, instead of
 * each 401 kicking off its own duplicate refresh.
 */
data class SupabaseAccessToken(val value: String, val generation: Long) {
    /** Same redaction rationale as [SupabaseSession.toString]. */
    override fun toString(): String = "SupabaseAccessToken(generation=$generation, value=REDACTED)"
}

/** Refresh this far before the real expiry, so a request never leaves with a token that dies in
 *  transit (also absorbs modest device/server clock skew). */
private const val EXPIRY_SKEW_MS = 60_000L

/** Only used if Supabase ever omits BOTH expires_at and expires_in -- deliberately short, so an
 *  unknown expiry means "refresh often", never "assume valid forever". */
private const val FALLBACK_TTL_MS = 5 * 60_000L

/**
 * Shared `select=` column list for [SupabaseAuthRepository.loadProfile]/[SupabaseAuthRepository.updateProfile]
 * so the two can never silently drift into parsing/returning a different row shape.
 *
 * DELIBERATELY does NOT include `photo_path` yet, even though [CapUser]/[JSONObject.toCapUser]
 * already have the field wired end-to-end (cross-platform parity Phase 7) -- this SELECT clause
 * runs on every single login and session restore, unconditionally. Adding an unknown column to
 * it would make PostgREST 400 that request outright, which would break EVERY login app-wide the
 * moment this shipped, not just the new photo feature -- a fundamentally bigger blast radius than
 * a write payload for a not-yet-applied migration (which only fails the one save it's part of).
 * Migration 0026 (`public.users.photo_path`) is written but genuinely NOT applied as of this
 * comment. Add `,photo_path` to this constant ONLY after 0026 is confirmed live -- until then,
 * `CapUser.photoPath` will simply always be null (the JSON key is absent, `optStringOrNull`
 * degrades to null gracefully), which is safe, not broken.
 */
private const val PROFILE_COLUMNS = "id,email,full_name,role,is_active,effective_permissions"

/**
 * @param isNetworkError the request never reached Supabase (connectivity/timeout). Transient --
 *        must NOT be treated as "the session is gone", or a tunnel ride would sign the user out.
 * @param isSessionExpired the session is genuinely, terminally unusable (refresh token expired,
 *        revoked, or rejected). The only condition that should force a re-login.
 * @param isUnauthorized the server answered 401 for THIS request. Recoverable: it means "this
 *        access token is stale", which is exactly the trigger for one refresh + one retry. Not
 *        the same thing as [isSessionExpired].
 */
class SupabaseAuthException(
    message: String,
    val isNetworkError: Boolean = false,
    val isSessionExpired: Boolean = false,
    val isUnauthorized: Boolean = false
) : Exception(message)

@Singleton
class SupabaseSessionStore @Inject constructor(@ApplicationContext context: Context) {
    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "cap_supabase_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveRefreshToken(refreshToken: String) {
        prefs.edit().putString("refresh_token", refreshToken).apply()
    }

    fun savedRefreshToken(): String? = prefs.getString("refresh_token", null)

    fun clear() {
        prefs.edit().clear().apply()
    }
}

@Singleton
class SupabaseAuthRepository @Inject constructor(
    private val sessionStore: SupabaseSessionStore
) {
    private val baseUrl = BuildConfig.SUPABASE_URL
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    @Volatile private var currentAccessToken: String? = null
    @Volatile private var accessTokenExpiresAtMs: Long = 0L

    /**
     * Incremented every time a new access token is installed (login/restore/refresh). Lets a
     * caller holding a token say "refresh only if nobody has already replaced the one I had",
     * which is what collapses a burst of simultaneous 401s into a single refresh.
     */
    @Volatile private var sessionGeneration: Long = 0L

    /** Serialises refreshes: only one `grant_type=refresh_token` call is ever in flight, no
     *  matter how many requests discover expiry at once. */
    private val refreshMutex = Mutex()

    /** True when a session exists at all. Deliberately does NOT expose the raw token: the old
     *  `val accessToken: String?` getter handed out a possibly-expired token with no way for the
     *  caller to know, which is the bug this fix removes. Callers issuing an authorized request
     *  must use [validAccessToken]; nothing else needs the token value. */
    val hasSession: Boolean get() = currentAccessToken != null

    /**
     * The access token to authorize a request with, proactively refreshed if it has expired (or
     * is about to). This is the only correct way to obtain a token for an outgoing request.
     *
     * @throws SupabaseAuthException `isSessionExpired` when there is no usable session and one
     *         cannot be re-minted; `isNetworkError` when the refresh could not be attempted
     *         because the network was unreachable (transient -- the session is left intact).
     */
    suspend fun validAccessToken(): SupabaseAccessToken {
        val token = currentAccessToken
            ?: throw SupabaseAuthException("Your session has expired. Sign in again.", isSessionExpired = true)
        val generation = sessionGeneration
        if (System.currentTimeMillis() < accessTokenExpiresAtMs - EXPIRY_SKEW_MS) {
            return SupabaseAccessToken(token, generation)
        }
        return refreshAfterUnauthorized(SupabaseAccessToken(token, generation))
    }

    /**
     * Re-mints the access token after a request authorized with [stale] was rejected (401), or
     * after [validAccessToken] found it expired.
     *
     * Concurrency: guarded by [refreshMutex], plus a generation re-check once the lock is held --
     * if another coroutine already refreshed while this one waited, the freshly installed token
     * is returned immediately and NO second network call is made. So N concurrent 401s produce
     * exactly one refresh request.
     *
     * @throws SupabaseAuthException `isSessionExpired` when the refresh token itself was
     *         rejected (terminal -- the caller must surface "sign in again", not retry);
     *         `isNetworkError` when the refresh could not be attempted at all (transient -- the
     *         stored refresh token is deliberately NOT cleared, so going offline never signs
     *         the user out).
     */
    suspend fun refreshAfterUnauthorized(stale: SupabaseAccessToken): SupabaseAccessToken =
        withContext(Dispatchers.IO) {
            refreshMutex.withLock {
                val current = currentAccessToken
                if (current != null && sessionGeneration != stale.generation) {
                    // Someone else already refreshed while we waited on the lock.
                    return@withLock SupabaseAccessToken(current, sessionGeneration)
                }
                val refreshToken = sessionStore.savedRefreshToken()
                    ?: throw SupabaseAuthException("Your session has expired. Sign in again.", isSessionExpired = true)

                val response = try {
                    postJson(
                        "$baseUrl/auth/v1/token?grant_type=refresh_token",
                        JSONObject().put("refresh_token", refreshToken),
                        authToken = null
                    )
                } catch (error: SupabaseAuthException) {
                    if (error.isNetworkError) throw error // transient: keep the session intact
                    clearSession()
                    throw SupabaseAuthException("Your session has expired. Sign in again.", isSessionExpired = true)
                }

                val session = try {
                    parseSessionResponse(response)
                } catch (_: Exception) {
                    clearSession()
                    throw SupabaseAuthException("Your session has expired. Sign in again.", isSessionExpired = true)
                }
                installSession(session)
                SupabaseAccessToken(session.accessToken, sessionGeneration)
            }
        }

    /** Installs a newly minted session. Supabase ROTATES the refresh token on every refresh, so
     *  the new one must be persisted or the NEXT refresh would fail with a stale token. */
    private fun installSession(session: SupabaseSession) {
        currentAccessToken = session.accessToken
        accessTokenExpiresAtMs = session.accessTokenExpiresAtMs
        sessionGeneration += 1
        sessionStore.saveRefreshToken(session.refreshToken)
    }

    private fun clearSession() {
        currentAccessToken = null
        accessTokenExpiresAtMs = 0L
        sessionGeneration += 1
        sessionStore.clear()
    }

    suspend fun login(email: String, password: String): SupabaseSession = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        val response = postJson("$baseUrl/auth/v1/token?grant_type=password", body, authToken = null)
        parseSessionResponse(response).also { installSession(it) }
    }

    /**
     * Restores a session from the encrypted refresh token, if any -- exchanges it for a
     * fresh access token. Returns null (not an error) if there is no saved session, or if
     * the stored refresh token is no longer valid (expired/revoked/rotated elsewhere) --
     * callers should treat either case as simply "not logged in", matching
     * AuthRepository.restore()'s existing pre-Phase-C contract exactly.
     *
     * E1 reliability fix: a NETWORK failure here also returns null (still "not logged in" for
     * this launch) but no longer wipes the stored refresh token -- starting the app with no
     * signal used to permanently sign the user out.
     */
    suspend fun restore(): SupabaseSession? = withContext(Dispatchers.IO) {
        val refreshToken = sessionStore.savedRefreshToken() ?: return@withContext null
        try {
            val body = JSONObject().put("refresh_token", refreshToken)
            val response = postJson("$baseUrl/auth/v1/token?grant_type=refresh_token", body, authToken = null)
            parseSessionResponse(response).also { installSession(it) }
        } catch (error: Exception) {
            // A network failure at cold start must NOT destroy the stored session -- the user is
            // simply offline, not signed out. Only an actual rejection of the refresh token
            // (or an unparseable response) means the session is really gone.
            if (error is SupabaseAuthException && error.isNetworkError) null else {
                clearSession()
                null
            }
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val token = currentAccessToken
        if (token != null) {
            // Best-effort: revokes the refresh token server-side. Local sign-out below is
            // unconditional regardless of whether this network call succeeds.
            runCatching { postJson("$baseUrl/auth/v1/logout", JSONObject(), authToken = token) }
        }
        clearSession()
    }

    /** Loads the caller's own `public.users` row via PostgREST, authorized by their own
     *  access token (RLS-gated, never the service-role key). */
    suspend fun loadProfile(userId: String): CapUser = withContext(Dispatchers.IO) {
        val url = "$baseUrl/rest/v1/users?id=eq.$userId&select=$PROFILE_COLUMNS"
        // Same refresh-once-then-retry-once contract as SupabaseData: a 401 here (long-idle app
        // resumed, token aged out) gets one refresh and one retry, never a loop.
        var token = validAccessToken()
        val body = try {
            httpGet(url, token.value)
        } catch (error: SupabaseAuthException) {
            if (!error.isUnauthorized) throw error
            token = refreshAfterUnauthorized(token) // throws isSessionExpired if truly gone
            httpGet(url, token.value)               // a 401 on this attempt propagates as-is
        }
        val rows = JSONArray(body)
        if (rows.length() == 0) throw SupabaseAuthException("User profile not found.")
        rows.getJSONObject(0).toCapUser()
    }

    /**
     * Cross-platform parity Phase 7 (Account editing + profile photo). Updates the caller's OWN
     * `public.users` row -- deliberately a direct PostgREST call here, in the same file/class as
     * [loadProfile], rather than routed through [RecordsRepository]'s generic
     * `update("users", ...)`. That generic path still targets Firestore for `"users"` (it is not
     * in [SUPABASE_MIGRATED_TABLES] yet -- the separate, still-read-only "Users" list screen is
     * the ONLY thing that still legitimately reads Firestore's `users` collection, per Core.kt's
     * own KDoc on that distinction) -- routing a real profile edit through it would silently
     * write to the wrong backend, or fail outright. The signed-in user's OWN identity has always
     * come from here (`loadProfile`, PostgREST), authoritatively, since Phase C; this is simply
     * the write side of that same, already-correct path.
     *
     * `fields` is intentionally narrow at the call-site level (only `full_name`/`photo_path` are
     * meant to be sent) but this method itself does not enforce that allowlist -- the real
     * enforcement is `restrict_self_user_update_trigger` (`0002_rls_policies.sql`), which already
     * rejects a non-admin self-update touching role/is_active/effective_permissions/email. A
     * caller attempting to smuggle one of those through here gets a real server-side rejection,
     * not a silently-accepted no-op.
     *
     * Uses PATCH with `Prefer: return=representation` so the updated row (including anything the
     * server changed, e.g. `updated_at`) comes back in one round-trip, parsed the same way
     * [loadProfile] parses a fetch -- callers should replace their in-memory [CapUser] with this
     * method's result rather than assuming their own submitted values took effect verbatim.
     */
    suspend fun updateProfile(userId: String, fields: Map<String, String?>): CapUser = withContext(Dispatchers.IO) {
        val url = "$baseUrl/rest/v1/users?id=eq.$userId&select=$PROFILE_COLUMNS"
        val body = JSONObject().apply {
            fields.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
        }
        var token = validAccessToken()
        val responseText = try {
            patchJson(url, body, token.value)
        } catch (error: SupabaseAuthException) {
            if (!error.isUnauthorized) throw error
            token = refreshAfterUnauthorized(token)
            patchJson(url, body, token.value)
        }
        val rows = JSONArray(responseText)
        if (rows.length() == 0) throw SupabaseAuthException("Unable to update your profile.")
        rows.getJSONObject(0).toCapUser()
    }

    private fun parseSessionResponse(raw: String): SupabaseSession {
        val json = JSONObject(raw)
        val user = json.optJSONObject("user")
            ?: throw SupabaseAuthException("Supabase did not return a user account.")
        return SupabaseSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            userId = user.getString("id"),
            email = user.optString("email", ""),
            accessTokenExpiresAtMs = json.accessTokenExpiryMs()
        )
    }

    private fun postJson(urlString: String, body: JSONObject, authToken: String?): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            if (authToken != null) connection.setRequestProperty("Authorization", "Bearer $authToken")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            return readResponse(connection)
        } catch (error: IOException) {
            throw SupabaseAuthException("Network unavailable. Please check your connection.", isNetworkError = true)
        } finally {
            connection.disconnect()
        }
    }

    /** Same shape as [postJson], but PATCH and with `Prefer: return=representation` so PostgREST
     *  returns the updated row instead of an empty 204 -- [updateProfile] needs the server's own
     *  view of the row back (e.g. its own `updated_at`), not just an assumption the submitted
     *  values took effect verbatim. */
    private fun patchJson(urlString: String, body: JSONObject, authToken: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "PATCH"
            connection.doOutput = true
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Prefer", "return=representation")
            connection.setRequestProperty("Authorization", "Bearer $authToken")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            return readResponse(connection)
        } catch (error: IOException) {
            throw SupabaseAuthException("Network unavailable. Please check your connection.", isNetworkError = true)
        } finally {
            connection.disconnect()
        }
    }

    private fun httpGet(urlString: String, token: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            return readResponse(connection)
        } catch (error: IOException) {
            throw SupabaseAuthException("Network unavailable. Please check your connection.", isNetworkError = true)
        } finally {
            connection.disconnect()
        }
    }

    /** Never surfaces a raw exception message, HTTP body, or token -- always one of a fixed
     *  set of product-facing strings, matching the existing connectionUserMessage() /
     *  userMessage() convention already established in Core.kt for Firebase errors. */
    private fun readResponse(connection: HttpURLConnection): String {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use(BufferedReader::readText) }.orEmpty()
        if (code !in 200..299) {
            val description = runCatching {
                val errorJson = JSONObject(text)
                errorJson.optStringOrNull("error_description") ?: errorJson.optStringOrNull("msg")
            }.getOrNull()
            throw SupabaseAuthException(
                message = when {
                    code == 400 && description?.contains("Invalid login credentials", ignoreCase = true) == true ->
                        "Incorrect email address or password."
                    code == 401 -> "Your session has expired. Sign in again."
                    code == 429 -> "Too many login attempts. Please try again later."
                    else -> "Unable to reach the authentication service. Please try again."
                },
                isUnauthorized = code == 401
            )
        }
        return text
    }
}

/**
 * Access-token expiry in epoch millis, taken from the token response itself rather than assumed.
 * Supabase returns BOTH `expires_at` (absolute, UNIX SECONDS) and `expires_in` (relative,
 * seconds) on the password and refresh grants alike -- `expires_at` is preferred, `expires_in`
 * is the fallback. If neither is present (never observed, but not worth crashing over) the
 * result is a deliberately short window, so an unknown expiry causes frequent refreshes rather
 * than a token assumed valid forever -- the previous behavior, which is the bug being fixed.
 */
private fun JSONObject.accessTokenExpiryMs(): Long {
    val expiresAtSeconds = optLong("expires_at", 0L)
    if (expiresAtSeconds > 0L) return expiresAtSeconds * 1000L
    val expiresInSeconds = optLong("expires_in", 0L)
    if (expiresInSeconds > 0L) return System.currentTimeMillis() + expiresInSeconds * 1000L
    return System.currentTimeMillis() + FALLBACK_TTL_MS
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (has(key) && !isNull(key)) optString(key, null) else null

private fun JSONObject.toCapUser(): CapUser {
    val permissionsArray = optJSONArray("effective_permissions")
    val permissions = if (permissionsArray != null) {
        (0 until permissionsArray.length()).mapNotNull { permissionsArray.optStringOrNull(it) }.toSet()
    } else emptySet()
    return CapUser(
        id = getString("id"),
        name = optStringOrNull("full_name") ?: optStringOrNull("email") ?: "Someone",
        email = optStringOrNull("email") ?: "",
        role = optStringOrNull("role") ?: "",
        active = optBoolean("is_active", false),
        permissions = permissions,
        // Absent entirely (0026 not applied yet) and blank both parse the same way: no photo.
        photoPath = optStringOrNull("photo_path")
    )
}

private fun JSONArray.optStringOrNull(index: Int): String? =
    if (index in 0 until length() && !isNull(index)) optString(index, null) else null
