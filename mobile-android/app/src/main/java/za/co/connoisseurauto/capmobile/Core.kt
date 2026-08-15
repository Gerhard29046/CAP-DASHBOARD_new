package com.CAPDATABASE.capdatabase

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
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

/**
 * Phase D + E1 (Android->Supabase migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md):
 * these tables now read/write live Postgres via [SupabaseDataRepository] instead of Firestore.
 *
 * Phase D: `clients`/`machines`/`service_records`/`job_cards`/`job_card_lines`.
 * `job_card_lines` is included even though it has no direct permission gate in
 * [syncResources] because JobCardDetail-equivalent screens read/write it through the same
 * generic `RecordsRepository`/`RecordsState` contract as everything else.
 *
 * Phase E1: the 5 knowledge-base tables. All 5 are RLS-gated by the same
 * `knowledge_base.view`/`.create`/`.edit`/`.delete` permission keys
 * (`supabase/migrations/0002_rls_policies.sql`), and `KnowledgeBaseScreen`/
 * `KnowledgeBaseDetailScreen` already read the real Postgres column names
 * (manufacturer/model_name/variant/product_code/category/summary/supported_refrigerants/
 * technical_specifications/main_functions; title/content/note_type; function_name/
 * service_code; file_url/caption/original_filename/title) -- so this is a pure backend swap
 * with no UI change, exactly like Phase D.
 *
 * Cross-platform parity Phase 6 (Notes, 2026-08-15): `dashboard_notes` added. Genuinely new to
 * Android -- unlike every table above, this one was never on Firestore at all, so there is no
 * "migration" here, just a new generic table this repository already knows how to talk to.
 * Global read for any authenticated user, creator-or-admin write/delete -- enforced entirely by
 * Postgres RLS (`supabase/migrations/0023_dashboard_notes_direct_rls.sql`'s
 * `public.is_admin()`-based policies plus a `BEFORE INSERT/UPDATE` trigger that server-side
 * pins `created_by_name` so a client can never spoof it), not by anything in this file or the
 * UI layer -- matches the web client's own `dashboardNotesClient.js`, which is likewise a thin
 * pass-through with no authorization logic of its own.
 *
 * NOT yet migrated: `users` (web-only administration; Android's Users screen is read-only) --
 * still reads Firestore, unchanged, via [RecordsRepository]'s Firestore branch below.
 *
 * Cross-platform parity Phase 8 (Users + Roles, 2026-08-15): `"users"` added -- the prerequisite
 * for real, RLS-respecting role/active-status editing (public.users' role/is_active/
 * effective_permissions self-updates are already admin-only, enforced by
 * restrict_self_user_update_trigger, not by anything in this app -- see SupabaseAuth.kt's
 * updateProfile() doc comment for the same trigger, added one phase earlier). This was the
 * ONLY remaining Firestore-routed collection -- observeFirestoreCollection() below (and its
 * whole "users"-specific E1 retry-forever reliability policy) is now provably unreachable dead
 * code, since nothing in [permittedCollections][MainActivity]'s list routes here anymore. NOT
 * deleted in this commit -- full Firebase removal (deleting the dead code, the Firebase Auth
 * login bridge it existed to support, and the Firebase Gradle dependencies themselves) is its
 * own later, dedicated phase per the user's own git-discipline instruction, not a side effect
 * of this one. The signed-in user's OWN identity continues to come from
 * SupabaseAuthRepository.loadProfile()/updateProfile() (a separate, already-Supabase,
 * already-correct path since Phase C) -- this addition is specifically about the Users LIST
 * screen and role-editing, a different real use case for the same table, not a duplicate of
 * that path.
 *
 * `permissions` and `role_permissions` are added alongside `users` for the same phase: the Users
 * screen's permission matrix is derived from them (a permission's "role default" is whether
 * `role_permissions` has a row for that (role, permission_key) pair), so without them the matrix
 * could only be a hardcoded stand-in. Both are read-only from this app -- RLS
 * (`0002_rls_policies.sql`) grants `select` to any active profile and restricts writes to admins,
 * and nothing here writes to either table.
 */
val SUPABASE_MIGRATED_TABLES = setOf(
    "clients",
    "machines",
    "service_records",
    "job_cards",
    "job_card_lines",
    "knowledge_machines",
    "knowledge_notes",
    "knowledge_service_codes",
    "knowledge_media",
    "knowledge_documents",
    "dashboard_notes",
    "users",
    "permissions",
    "role_permissions"
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
 * The Firebase Auth login bridge and `observeFirestoreCollection()` (Core.kt, both still present)
 * are untouched by this change -- their removal is Phase 12's dedicated commit, not a side effect
 * of fixing this screen's health check.
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
 * Phase D/E1 (Android->Supabase migration): routes each named collection/table to whichever
 * backend currently owns it -- [SUPABASE_MIGRATED_TABLES] go to [SupabaseDataRepository]
 * (Postgres/PostgREST), everything else (`users` only, as of Phase E1) stays on the original
 * Firestore path -- unchanged in what data it reads/shows; its failure-isolation policy was
 * fixed separately (see `observeFirestoreCollection`'s doc comment). Both branches return/accept
 * the exact same [CapRecord]/[RecordsState]
 * shapes, so callers (MainViewModel, every screen composable) never need to know or care which
 * backend actually served a given collection -- see docs/android/ANDROID_SUPABASE_MIGRATION.md
 * Phase D section for the full design writeup.
 */
@Singleton
class RecordsRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val supabaseData: SupabaseDataRepository
) {
    fun observeCollection(name: String): Flow<List<CapRecord>> =
        if (name in SUPABASE_MIGRATED_TABLES) supabaseData.observeCollection(name)
        else observeFirestoreCollection(name)

    /**
     * The one remaining Firestore-backed collection reached here today is `"users"` (the legacy,
     * permission-gated, read-only "Users" list screen -- see `docs/ai-memory/KNOWN_ISSUES.md`'s
     * 2026-08-14 entry and the architectural audit it references). It is intentionally still
     * Firestore during the migration -- this function does not migrate it, remove it, or change
     * what data it shows. It only fixes how its *failures* are isolated.
     *
     * E1 reliability fix, `"users"`-specific: a Firestore listener error here must NEVER close
     * this flow. Doing so previously terminated the whole shared `combine()` flow in
     * [observeCollections] -- the exact cross-table blast radius
     * [SupabaseDataRepository.observeCollection] was already fixed to avoid for every
     * Supabase-backed table, but this collection was left out of that fix. On any listener error,
     * the current registration is torn down and a fresh one is scheduled after
     * [FIRESTORE_RETRY_DELAY_MS]; the flow immediately re-sends the last-known-good list (or an
     * empty list if it has never had one) instead of closing or staying silent.
     *
     * This deliberately diverges from [SupabaseDataRepository.observeCollection]'s rule that a
     * failure before the very first emission still closes the flow. That rule is safe there
     * because a Supabase table is only ever combined with other equally must-have Supabase
     * tables -- closing surfaces an honest error instead of an infinite spinner for that one
     * screen. `"users"` is different: it is combined via the SAME `combine()` as every core table
     * (Clients/Machines/Service Records/Job Cards/Knowledge Base), and per the architectural
     * audit it is an optional, permission-gated, "borderline-unnecessary" legacy screen, not
     * must-have data. A `PERMISSION_DENIED` from `firestore.rules:31` (`allow list: if
     * isAdmin()`) is not transient -- it happens on every attempt, including the first -- so
     * applying the Supabase rule here would still close the shared flow on literally the first
     * subscribe attempt for exactly the real account this fix exists for. Kotlin's `combine()`
     * also never emits until every source has emitted at least once, so silently withholding
     * emission forever on error would hang every other screen instead of crashing it -- equally
     * unacceptable. Always emitting promptly (even an empty list) is what keeps
     * [observeCollections] moving regardless of this collection's health.
     *
     * Known, disclosed limitation, matching the Supabase fix's own disclosed one
     * ([SupabaseDataRepository.observeCollection]'s doc comment): a failed `"users"` fetch is
     * currently invisible to the user beyond an empty/stale list -- no per-collection "stale
     * data" indicator exists in [RecordsState] today. Out of this fix's scope (a UI change,
     * `android-ui-bee`'s territory, not requested here).
     */
    private fun observeFirestoreCollection(name: String): Flow<List<CapRecord>> = callbackFlow {
        var registration: ListenerRegistration? = null
        var lastGood: List<CapRecord> = emptyList()

        fun attach() {
            registration = firestore.collection(name).addSnapshotListener { snapshot, error ->
                when {
                    error != null -> {
                        // Never close: see policy doc above. Degrade to last-known-good (or
                        // empty) data and retry with a fresh listener after a delay -- this
                        // specific registration will not deliver further callbacks once its
                        // error callback has fired, so a plain retry (not a resume) is required.
                        trySend(lastGood)
                        registration?.remove()
                        registration = null
                        launch {
                            delay(FIRESTORE_RETRY_DELAY_MS)
                            attach()
                        }
                    }
                    snapshot != null -> {
                        lastGood = snapshot.documents.map { document ->
                            CapRecord(document.id, document.data.orEmpty())
                        }
                        trySend(lastGood)
                    }
                }
            }
        }

        attach()
        awaitClose { registration?.remove() }
    }

    companion object {
        /** Matches [SupabaseDataRepository.POLL_INTERVAL_MS]'s interval in spirit (retry cadence
         *  for a degraded background collection), kept as its own named constant here since this
         *  is a push-listener retry delay, not a poll interval -- a different mechanism that
         *  happens to want a similar cadence. */
        private const val FIRESTORE_RETRY_DELAY_MS = 20_000L
    }

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
        // The `.catch` above is deliberately left as-is by the E1 reliability fix. It emits one
        // error state and completes the whole combined flow, which is only correct if reaching it
        // genuinely means "nothing here can recover". That is now true for every source combined
        // here: SupabaseDataRepository.observeCollection() no longer closes on transient failures
        // (it swallows them and polls again), and observeFirestoreCollection()'s `"users"` source
        // no longer closes on ANY listener error (it swallows them too and retries with a fresh
        // listener -- see that function's doc comment for why its policy is even stricter than
        // the Supabase one). So the only thing that can still reach here is a terminal Supabase
        // auth failure (SessionExpiredException -- re-login required) or a cold-start failure on
        // a Supabase-backed table before it has ever emitted. Moving recovery here instead (e.g.
        // retry/retryWhen) would be wrong: combine() cannot resubscribe a single failed source
        // without restarting all of them, which is precisely the cross-table blast radius being
        // removed.
    }

    suspend fun create(collection: String, fields: Map<String, Any?>): String {
        if (collection in SUPABASE_MIGRATED_TABLES) return supabaseData.create(collection, fields)
        val payload = fields.filterValues { it != null }.toMutableMap().apply {
            put("created_at", FieldValue.serverTimestamp())
            put("updated_at", FieldValue.serverTimestamp())
        }
        return firestore.collection(collection).add(payload).await().id
    }

    suspend fun update(collection: String, id: String, fields: Map<String, Any?>) {
        if (collection in SUPABASE_MIGRATED_TABLES) { supabaseData.update(collection, id, fields); return }
        val payload = fields.filterValues { it != null }.toMutableMap().apply {
            put("updated_at", FieldValue.serverTimestamp())
        }
        firestore.collection(collection).document(id).update(payload).await()
    }

    suspend fun delete(collection: String, id: String) {
        if (collection in SUPABASE_MIGRATED_TABLES) { supabaseData.delete(collection, id); return }
        firestore.collection(collection).document(id).delete().await()
    }
}

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {
    @Provides @Singleton fun auth(): FirebaseAuth = FirebaseAuth.getInstance()
    @Provides @Singleton fun firestore(): FirebaseFirestore =
        FirebaseFirestore.getInstance(FirebaseApp.getInstance(), "capdashboard")
}

/** `open` so [SessionExpiredException] (SupabaseData.kt) can specialise it without changing the
 *  contract every `catch (error: ApiException)` call site already relies on. */
open class ApiException(message: String) : Exception(message)

/**
 * Phase C (Android->Supabase auth migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md):
 * Supabase Auth + `public.users` (via [SupabaseAuthRepository]) is now the AUTHORITATIVE
 * login/session/identity mechanism -- replacing what was previously a pure Firebase Auth +
 * Firestore `users/{uid}` flow. `login()`/`restore()`/`logout()` keep the exact same
 * signatures as before Phase C, so [MainViewModel] and every UI call site needed zero
 * changes.
 *
 * Firebase Auth is kept as a best-effort SECONDARY bridge, not removed, because Firestore is
 * not yet FULLY migrated: as of Phase E1, Clients/Machines/Jobs/Services/Knowledge Base all read
 * Postgres via [SupabaseDataRepository] (see [SUPABASE_MIGRATED_TABLES]), but the `users`
 * collection still reads Firestore through [RecordsRepository]'s Firestore branch (and
 * [GoogleCalendarRepository] remains a legacy Firestore consumer), and `firestore.rules`
 * hard-requires a real Firebase
 * Auth session for every read (`signedIn() = request.auth != null`, confirmed by reading the
 * rules file directly -- there is no anonymous/bridged access path). Signing into Firebase
 * with the same credentials right after a successful Supabase login keeps those
 * not-yet-migrated screens working exactly as before. If the Firebase-side sign-in fails
 * (e.g. this Supabase account has no Firebase counterpart, or the two systems' passwords
 * differ -- a real, expected possibility since only 1 real user has been migrated to
 * Supabase Auth so far), the Supabase login itself still succeeds (it is authoritative
 * regardless), and Firestore-backed screens will show their EXISTING "sign-in
 * required"/error state (already handled by `StatusRepository`'s `ConnectionStatus`) rather
 * than crash -- a disclosed, temporary limitation of this transitional phase, not a masked
 * one. This bridge is removed in Phase I once Firestore itself is migrated.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val supabaseAuth: SupabaseAuthRepository,
    private val firebaseAuth: FirebaseAuth
) {
    suspend fun restore(): CapUser? {
        val session = supabaseAuth.restore() ?: return null
        return try {
            loadProfile(session.userId)
        } catch (_: Exception) {
            supabaseAuth.logout()
            null
        }
        // Deliberately no Firebase-side action here: FirebaseAuth's own SDK persists its
        // session locally, independent of this class. If the original login's bridge (below)
        // succeeded, auth.currentUser is already populated from Firebase's own persistence
        // by the time this runs -- nothing to redo. If it didn't succeed, restore()
        // correctly leaves Firebase signed out too, consistent with login-time reality.
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
        // Best-effort Firestore-continuity bridge -- see class doc. Never allowed to fail
        // the overall login (Supabase already succeeded, that's authoritative) and never
        // surfaced as a user-facing error here; StatusRepository's existing ConnectionStatus
        // mechanism is what tells the user if Firestore-backed screens aren't reachable.
        runCatching { firebaseAuth.signInWithEmailAndPassword(email.trim(), password).await() }
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
     * Write side of [loadProfile] -- the signed-in user's own `public.users` row, PostgREST,
     * never Firestore's separate `users` collection (see this file's closing note on why those
     * two are currently different data sources). Deliberately propagates the underlying
     * exception rather than flattening it into [ApiException] the way login does: the caller
     * here is a screen that owns its own inline error state and shows `error.message` directly,
     * and those messages are already user-facing -- including the real server-side rejection
     * raised when a field is not self-editable.
     */
    suspend fun updateProfile(userId: String, fields: Map<String, String?>): CapUser =
        supabaseAuth.updateProfile(userId, fields)

    suspend fun logout() {
        supabaseAuth.logout()
        runCatching { firebaseAuth.signOut() }
    }
}

// DocumentSnapshot.toCapUser() (the old Firestore users/{uid} -> CapUser mapper) was removed
// here in Phase C -- AuthRepository's identity/profile now comes from Supabase
// (SupabaseAuth.kt's JSONObject.toCapUser()), not Firestore. Note this is specifically about
// the SIGNED-IN user's own identity: the separate "Users" administration screen
// (UsersScreen/UserDetailScreen in MainActivity.kt, reading generic CapRecords via
// RecordsRepository) is a different read of the same table. Both now hit the same Supabase
// public.users rows -- the temporary Firestore/Supabase inconsistency noted here previously
// ended when "users" joined SUPABASE_MIGRATED_TABLES.

private fun Throwable.connectionStatus(): ConnectionStatus = when (this) {
    is FirebaseAuthException -> ConnectionStatus.AuthRequired
    is FirebaseNetworkException -> ConnectionStatus.Offline
    is FirebaseFirestoreException -> when (code) {
        FirebaseFirestoreException.Code.PERMISSION_DENIED,
        FirebaseFirestoreException.Code.UNAUTHENTICATED -> ConnectionStatus.AuthRequired
        FirebaseFirestoreException.Code.UNAVAILABLE -> ConnectionStatus.Offline
        else -> ConnectionStatus.DbUnavailable
    }
    else -> ConnectionStatus.ServerError
}

private fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message ?: "Authentication failed."
    is FirebaseNetworkException -> "Network unavailable. Please check your connection."
    is FirebaseAuthException -> when (errorCode) {
        "ERROR_INVALID_CREDENTIAL", "ERROR_WRONG_PASSWORD", "ERROR_USER_NOT_FOUND", "ERROR_INVALID_EMAIL" ->
            "Incorrect email address or password."
        "ERROR_USER_DISABLED" -> "This account is disabled."
        "ERROR_TOO_MANY_REQUESTS" -> "Too many login attempts. Please try again later."
        else -> "Unable to authenticate with Firebase."
    }
    is FirebaseFirestoreException -> when (code) {
        FirebaseFirestoreException.Code.PERMISSION_DENIED -> "Permission denied by Firestore."
        FirebaseFirestoreException.Code.UNAVAILABLE -> "Firestore is currently unavailable."
        FirebaseFirestoreException.Code.UNAUTHENTICATED -> "Your session has expired."
        else -> "Unable to load Firebase data."
    }
    else -> message ?: "An unexpected Firebase error occurred."
}

// Error mapping for connection/sync-status contexts only (checkHealth/testConnection/sync).
// Never surfaces a raw exception message, stack trace, auth token, or Firebase secret -
// every branch resolves to one of the fixed product-spec strings below.
private fun Throwable.connectionUserMessage(): String = when {
    // Phase D: errors raised by SupabaseDataRepository (Postgres/PostgREST path) already carry
    // a specific, product-facing message -- reuse it rather than falling through to the
    // generic Firebase-oriented branches below.
    this is ApiException -> message ?: "The service responded, but the returned information could not be processed."
    this is FirebaseNetworkException ->
        "Your phone is not connected to the internet. Check Wi-Fi or mobile data and try again."
    this is FirebaseAuthException ->
        "Your login session has expired. Sign in again to reconnect securely."
    this is FirebaseFirestoreException -> when (code) {
        FirebaseFirestoreException.Code.UNAUTHENTICATED ->
            "Your login session has expired. Sign in again to reconnect securely."
        FirebaseFirestoreException.Code.PERMISSION_DENIED ->
            "Your account is connected, but it does not have permission to access this information."
        FirebaseFirestoreException.Code.DEADLINE_EXCEEDED ->
            "The connection took too long. Check your signal and try again."
        FirebaseFirestoreException.Code.UNAVAILABLE ->
            "The CAP Database service could not be reached. Your data has not been changed."
        FirebaseFirestoreException.Code.INTERNAL,
        FirebaseFirestoreException.Code.DATA_LOSS,
        FirebaseFirestoreException.Code.UNKNOWN,
        FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED ->
            "The application reached the live service, but the database did not respond."
        else ->
            "The service responded, but the returned information could not be processed."
    }
    this is IllegalStateException && (message?.contains("Firebase", ignoreCase = true) == true ||
        message?.contains("google-services", ignoreCase = true) == true) ->
        "A required Android connection setting is missing. Do not create a replacement database."
    else ->
        "The service responded, but the returned information could not be processed."
}
