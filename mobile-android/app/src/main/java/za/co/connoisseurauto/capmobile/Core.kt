package com.CAPDATABASE.capdatabase

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

data class CapUser(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val active: Boolean,
    val permissions: Set<String> = emptySet(),
    /** Permanent Storage object path (never a signed URL) -- cross-platform parity Phase 7,
     *  see `public.users.photo_path` (migration 0026, NOT yet applied). Null until a user
     *  uploads a photo, or on any account this app hasn't re-fetched since 0026 landed. */
    val photoPath: String? = null
) {
    fun hasPermission(key: String) = key in permissions
    fun hasAnyPermission(keys: Collection<String>) = keys.any(::hasPermission)
    fun hasAllPermissions(keys: Collection<String>) = keys.all(::hasPermission)
}

enum class ConnectionStatus { Connected, Checking, Offline, AuthRequired, ServerError, DbUnavailable, SyncError }
data class SyncResult(val resource: String, val count: Int?, val error: String? = null)
data class ConnectionTestResult(val success: Boolean, val latencyMs: Long? = null, val message: String)
data class SyncResource(val label: String, val permission: String, val collection: String)

val syncResources = listOf(
    SyncResource("Clients", "clients.view", "clients"),
    SyncResource("Machines", "machines.view", "machines"),
    SyncResource("Service Records", "services.view", "service_records"),
    SyncResource("Job Cards", "job_cards.view", "job_cards")
)

data class CapRecord(
    val id: String,
    val fields: Map<String, Any?>
) {
    fun text(key: String): String = fields[key]?.toString().orEmpty()
}

fun sameRecordId(left: Any?, right: Any?): Boolean =
    left != null && right != null && left.toString() == right.toString()

fun relatedRecords(records: List<CapRecord>, foreignKey: String, parentId: String): List<CapRecord> =
    records.filter { sameRecordId(it.fields[foreignKey], parentId) }

data class RecordsState(
    val loading: Boolean = true,
    val records: Map<String, List<CapRecord>> = emptyMap(),
    val error: String? = null,
    val lastUpdated: Long = 0
) {
    fun collection(name: String): List<CapRecord> = records[name].orEmpty()
}

fun allowedSyncResources(user: CapUser): List<SyncResource> =
    syncResources.filter { user.hasPermission(it.permission) }

data class GlobalStatus(
    val connection: ConnectionStatus = ConnectionStatus.Checking,
    val apiHealthy: Boolean = false,
    val dbHealthy: Boolean = false,
    val lastSync: Long = 0,
    val lastError: String? = null,
    val syncResults: List<SyncResult> = emptyList(),
    val latency: Long = 0,
    val pendingOperations: Int = 0,
    val failedOperations: Int = 0
)

class ConnectivityObserver(context: Context) {
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val status: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(false) }
        }
        connectivityManager.registerNetworkCallback(
            NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
            callback
        )
        trySend(connectivityManager.activeNetwork != null)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}

/**
 * Cross-platform parity Phase 11 (2026-08-16): this used to probe
 * `firestore.collection("users").document(uid).get()` -- accurate when written (the "users"
 * collection was still Firestore-backed then), but "users" moved onto Supabase in `b8aaaee`
 * (Phase 8's prerequisite), so that Firestore doc is now stale/vestigial for most accounts.
 * Continuing to gate this screen's "is the backend reachable" signal on a read of dead data
 * would be actively misleading (a real Supabase outage could read as "Connected", or a merely
 * stale Firestore doc could read as broken while Supabase itself is fine) -- not just a stale
 * label, an actually wrong health check. Now probes Supabase directly, via the same `count()`
 * primitive `sync()` already uses below, against `permissions` (a tiny, always-populated
 * reference table any active profile can read -- see 0002_rls_policies.sql's
 * `permissions_select` policy -- so this can only fail for real connectivity/server reasons,
 * never a permissions one).
 *
 * No longer depends on FirebaseAuth/FirebaseFirestore at all -- [SupabaseAuthRepository.hasSession]
 * is the "is someone signed in" signal, and [SupabaseDataRepository] is the only backend probed.
 * (The Firebase Auth login bridge and `observeFirestoreCollection()` were still present when this
 * was first written -- both are gone now too, deleted in the same-day Phase 12 follow-up.)
 */
@Singleton
class StatusRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository,
    private val supabaseData: SupabaseDataRepository,
    @ApplicationContext context: Context
) {
    private val _status = MutableStateFlow(GlobalStatus())
    val status = _status.asStateFlow()
    private val connectivity = ConnectivityObserver(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        connectivity.status.onEach { isOnline ->
            if (!isOnline) _status.update { it.copy(connection = ConnectionStatus.Offline) }
            else checkHealth()
        }.launchIn(scope)
    }

    suspend fun checkHealth() {
        _status.update { it.copy(connection = ConnectionStatus.Checking) }
        if (!supabaseAuth.hasSession) {
            _status.update { it.copy(connection = ConnectionStatus.AuthRequired, apiHealthy = true, dbHealthy = false) }
            return
        }
        val start = System.currentTimeMillis()
        try {
            supabaseData.count("permissions")
            _status.update { it.copy(
                connection = ConnectionStatus.Connected,
                apiHealthy = true,
                dbHealthy = true,
                latency = System.currentTimeMillis() - start,
                lastError = null
            ) }
        } catch (error: Exception) {
            _status.update { it.copy(
                connection = error.supabaseConnectionStatus(),
                apiHealthy = error !is SessionExpiredException,
                dbHealthy = false,
                lastError = error.message ?: "Unable to reach the CAP Database service."
            ) }
        }
    }

    suspend fun testConnection(): ConnectionTestResult {
        if (!supabaseAuth.hasSession) {
            return ConnectionTestResult(success = false, message = "Please sign in to test the connection.")
        }
        val start = System.currentTimeMillis()
        return try {
            supabaseData.count("permissions")
            ConnectionTestResult(success = true, latencyMs = System.currentTimeMillis() - start, message = "Connected")
        } catch (error: Exception) {
            ConnectionTestResult(success = false, message = error.message ?: "Unable to reach the CAP Database service.")
        }
    }

    suspend fun sync(user: CapUser) = coroutineScope {
        _status.update { it.copy(connection = ConnectionStatus.Checking) }
        val results = allowedSyncResources(user).map { resource ->
            async {
                // Every entry in `syncResources` (below) is already a SUPABASE_MIGRATED_TABLES
                // table -- there is no remaining Firestore-backed sync resource to fall back to,
                // so this no longer branches on collection name the way it used to pre-b8aaaee.
                val result = runCatching { supabaseData.count(resource.collection) }
                SyncResult(resource.label, result.getOrNull(), result.exceptionOrNull()?.message)
            }
        }.awaitAll()
        val failedCount = results.count { result -> result.error != null }
        _status.update { it.copy(
            connection = if (failedCount > 0) ConnectionStatus.SyncError else ConnectionStatus.Connected,
            apiHealthy = supabaseAuth.hasSession,
            dbHealthy = failedCount == 0,
            syncResults = results,
            lastSync = System.currentTimeMillis(),
            lastError = if (failedCount > 0)
                "The application could not complete the latest sync. Existing live information was not deleted or replaced."
            else null,
            failedOperations = failedCount
        ) }
    }
}

/** Maps a Supabase data-layer failure onto [ConnectionStatus] for the Status screen. Coarser
 *  than the Firestore mapping below (SupabaseDataRepository's ApiException doesn't yet
 *  distinguish network vs. 5xx vs. RLS at the type level) -- a terminal session failure reads as
 *  "sign in again", everything else reads as a generic server/reachability problem, which is
 *  honest given what's actually knowable here without deeper request-layer typing. */
private fun Exception.supabaseConnectionStatus(): ConnectionStatus = when (this) {
    is SessionExpiredException -> ConnectionStatus.AuthRequired
    else -> ConnectionStatus.ServerError
}

/**
 * Phase 12 (Firebase removal, 2026-08-16): now a thin pass-through to [SupabaseDataRepository]
 * for every collection -- there is nothing left to route between. This class used to also route
 * to a Firestore path for whichever collections hadn't migrated yet (most recently, and finally,
 * just `"users"` -- see `b8aaaee`, Phase 8's prerequisite, which moved it onto Supabase and made
 * the Firestore branch provably unreachable). That branch (a whole "users"-specific listener
 * retry-forever reliability policy, `observeFirestoreCollection()`) is deleted here, along with
 * `FirebaseModule` and the `firebaseAuth` bridge in [AuthRepository] below -- see
 * `docs/ai-memory/ROADMAP.md`'s Phase 12 entry for the full removal scope and proof. Nothing
 * about this class's public contract changed: [MainViewModel]/every screen composable calling
 * it needed zero changes.
 */
@Singleton
class RecordsRepository @Inject constructor(
    private val supabaseData: SupabaseDataRepository
) {
    fun observeCollection(name: String): Flow<List<CapRecord>> = supabaseData.observeCollection(name)

    fun observeCollections(names: List<String>): Flow<RecordsState> {
        if (names.isEmpty()) return flowOf(RecordsState(loading = false))
        val sources = names.map(::observeCollection)
        return combine(sources) { snapshots ->
            RecordsState(
                loading = false,
                records = names.zip(snapshots.toList()).toMap(),
                lastUpdated = System.currentTimeMillis()
            )
        }.catch { error ->
            emit(RecordsState(loading = false, error = error.userMessage()))
        }
        // The `.catch` above is deliberately left as-is by the E1 reliability fix, and still
        // correct post-Phase-12: it emits one error state and completes the whole combined flow,
        // which is only correct if reaching it genuinely means "nothing here can recover". With
        // every source now a Supabase-backed SupabaseDataRepository.observeCollection() (which no
        // longer closes on transient failures -- it swallows them and polls again), the only
        // thing that can still reach here is a terminal Supabase auth failure
        // (SessionExpiredException -- re-login required) or a cold-start failure on a table
        // before it has ever emitted. Moving recovery here instead (e.g. retry/retryWhen) would
        // be wrong: combine() cannot resubscribe a single failed source without restarting all of
        // them, which is precisely the cross-table blast radius the E1 fix removed.
    }

    suspend fun create(collection: String, fields: Map<String, Any?>): String =
        supabaseData.create(collection, fields)

    suspend fun update(collection: String, id: String, fields: Map<String, Any?>) =
        supabaseData.update(collection, id, fields)

    suspend fun delete(collection: String, id: String) =
        supabaseData.delete(collection, id)
}

/** `open` so [SessionExpiredException] (SupabaseData.kt) can specialise it without changing the
 *  contract every `catch (error: ApiException)` call site already relies on. */
open class ApiException(message: String) : Exception(message)

/**
 * Phase C (Android->Supabase auth migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md):
 * Supabase Auth + `public.users` (via [SupabaseAuthRepository]) is the AUTHORITATIVE
 * login/session/identity mechanism -- replacing what was previously a pure Firebase Auth +
 * Firestore `users/{uid}` flow. `login()`/`restore()`/`logout()` keep the exact same
 * signatures as before Phase C, so [MainViewModel] and every UI call site needed zero changes
 * then, and none now.
 *
 * Phase 12 (Firebase removal, 2026-08-16): this class used to also sign into Firebase Auth as a
 * best-effort secondary bridge, because `firestore.rules` required a real Firebase session for
 * the one remaining Firestore-backed read (`RecordsRepository`'s old `"users"` branch). That
 * branch was deleted once `"users"` moved onto Supabase (`b8aaaee`, Phase 8's prerequisite),
 * which removed the bridge's only reason to exist -- deleted here along with it, and with
 * `GoogleCalendarRepository` (an unrelated, separately already-deleted legacy Firestore
 * consumer, Phase G). Nothing in this app reads Firestore anymore.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository
) {
    suspend fun restore(): CapUser? {
        val session = supabaseAuth.restore() ?: return null
        return try {
            loadProfile(session.userId)
        } catch (_: Exception) {
            supabaseAuth.logout()
            null
        }
    }

    suspend fun login(email: String, password: String): CapUser {
        val session = try {
            supabaseAuth.login(email, password)
        } catch (error: SupabaseAuthException) {
            throw ApiException(error.message ?: "Authentication failed.")
        } catch (error: Exception) {
            throw ApiException("An unexpected error occurred.")
        }
        val user = try {
            loadProfile(session.userId)
        } catch (error: Exception) {
            supabaseAuth.logout()
            throw error
        }
        return user
    }

    private suspend fun loadProfile(userId: String): CapUser {
        val user = try {
            supabaseAuth.loadProfile(userId)
        } catch (error: SupabaseAuthException) {
            // Wrapped so every caller (MainViewModel's `catch (error: ApiException)`) keeps
            // seeing the exact specific message, matching this class's pre-Phase-C contract
            // of always throwing ApiException, never a raw underlying exception type.
            throw ApiException(error.message ?: "Unable to load your profile.")
        }
        if (!user.active) {
            supabaseAuth.logout()
            throw ApiException("This account is disabled.")
        }
        return user
    }

    /**
     * Write side of [loadProfile] -- the signed-in user's own `public.users` row, PostgREST.
     * Deliberately propagates the underlying exception rather than flattening it into
     * [ApiException] the way login does: the caller here is a screen that owns its own inline
     * error state and shows `error.message` directly, and those messages are already
     * user-facing -- including the real server-side rejection raised when a field is not
     * self-editable.
     */
    suspend fun updateProfile(userId: String, fields: Map<String, String?>): CapUser =
        supabaseAuth.updateProfile(userId, fields)

    suspend fun logout() {
        supabaseAuth.logout()
    }
}

// DocumentSnapshot.toCapUser() (the old Firestore users/{uid} -> CapUser mapper) was removed
// here in Phase C -- AuthRepository's identity/profile has come from Supabase
// (SupabaseAuth.kt's JSONObject.toCapUser()) ever since, not Firestore. The separate "Users"
// administration screen (UsersScreen/UserDetailScreen in MainActivity.kt, reading generic
// CapRecords via RecordsRepository) is a different read of the same public.users rows -- both
// paths have been Supabase-only since "users" joined SUPABASE_MIGRATED_TABLES (Phase 8) and,
// as of Phase 12, there is no other backend left for either to be inconsistent with.

// Phase 12 (Firebase removal, 2026-08-16): this used to also map FirebaseAuthException/
// FirebaseFirestoreException branches -- deleted along with every code path that could still
// throw one into here (RecordsRepository's Firestore branch, the AuthRepository Firebase
// bridge). The one real remaining error source combined via [RecordsRepository.observeCollections]
// is [SupabaseDataRepository], whose exceptions are always [ApiException] (or its
// [SessionExpiredException] subtype) and already carry a specific, product-facing message.
private fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message ?: "Authentication failed."
    else -> message ?: "An unexpected error occurred."
}
