package com.CAPDATABASE.capdatabase

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
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
 * re-minted from the refresh token on process start via [restore].
 */

data class SupabaseSession(val accessToken: String, val refreshToken: String, val userId: String, val email: String)

class SupabaseAuthException(message: String, val isNetworkError: Boolean = false) : Exception(message)

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

    /** Current in-memory access token, for callers (e.g. a future PostgREST-backed data
     *  repository in Phase D) that need to attach it to their own requests. Null when
     *  signed out. */
    val accessToken: String? get() = currentAccessToken

    suspend fun login(email: String, password: String): SupabaseSession = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        val response = postJson("$baseUrl/auth/v1/token?grant_type=password", body, authToken = null)
        parseSessionResponse(response).also {
            currentAccessToken = it.accessToken
            sessionStore.saveRefreshToken(it.refreshToken)
        }
    }

    /**
     * Restores a session from the encrypted refresh token, if any -- exchanges it for a
     * fresh access token. Returns null (not an error) if there is no saved session, or if
     * the stored refresh token is no longer valid (expired/revoked/rotated elsewhere) --
     * callers should treat either case as simply "not logged in", matching
     * AuthRepository.restore()'s existing pre-Phase-C contract exactly.
     */
    suspend fun restore(): SupabaseSession? = withContext(Dispatchers.IO) {
        val refreshToken = sessionStore.savedRefreshToken() ?: return@withContext null
        try {
            val body = JSONObject().put("refresh_token", refreshToken)
            val response = postJson("$baseUrl/auth/v1/token?grant_type=refresh_token", body, authToken = null)
            parseSessionResponse(response).also {
                currentAccessToken = it.accessToken
                sessionStore.saveRefreshToken(it.refreshToken)
            }
        } catch (_: Exception) {
            sessionStore.clear()
            null
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val token = currentAccessToken
        if (token != null) {
            // Best-effort: revokes the refresh token server-side. Local sign-out below is
            // unconditional regardless of whether this network call succeeds.
            runCatching { postJson("$baseUrl/auth/v1/logout", JSONObject(), authToken = token) }
        }
        currentAccessToken = null
        sessionStore.clear()
    }

    /** Loads the caller's own `public.users` row via PostgREST, authorized by their own
     *  access token (RLS-gated, never the service-role key). */
    suspend fun loadProfile(userId: String): CapUser = withContext(Dispatchers.IO) {
        val token = currentAccessToken ?: throw SupabaseAuthException("Not authenticated.")
        val url = "$baseUrl/rest/v1/users?id=eq.$userId&select=id,email,full_name,role,is_active,effective_permissions"
        val rows = JSONArray(httpGet(url, token))
        if (rows.length() == 0) throw SupabaseAuthException("User profile not found.")
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
            email = user.optString("email", "")
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
                when {
                    code == 400 && description?.contains("Invalid login credentials", ignoreCase = true) == true ->
                        "Incorrect email address or password."
                    code == 401 -> "Your session has expired. Sign in again."
                    code == 429 -> "Too many login attempts. Please try again later."
                    else -> "Unable to reach the authentication service. Please try again."
                }
            )
        }
        return text
    }
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
        permissions = permissions
    )
}

private fun JSONArray.optStringOrNull(index: Int): String? =
    if (index in 0 until length() && !isNull(index)) optString(index, null) else null
