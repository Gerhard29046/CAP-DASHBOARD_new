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
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

data class CapUser(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val active: Boolean,
    val permissions: Set<String> = emptySet()
) {
    fun hasPermission(key: String) = key in permissions
    fun hasAnyPermission(keys: Collection<String>) = keys.any(::hasPermission)
    fun hasAllPermissions(keys: Collection<String>) = keys.all(::hasPermission)
}

enum class ConnectionStatus { Connected, Checking, Offline, AuthRequired, ServerError, DbUnavailable, SyncError }
data class SyncResult(val resource: String, val count: Int?, val error: String? = null)
data class SyncResource(val label: String, val permission: String, val collection: String)

val syncResources = listOf(
    SyncResource("Clients", "clients.view", "clients"),
    SyncResource("Machines", "machines.view", "machines"),
    SyncResource("Service Records", "services.view", "service_records"),
    SyncResource("Job Cards", "job_cards.view", "job_cards")
)

fun allowedSyncResources(user: CapUser): List<SyncResource> =
    syncResources.filter { user.hasPermission(it.permission) }

data class GlobalStatus(
    val connection: ConnectionStatus = ConnectionStatus.Checking,
    val apiHealthy: Boolean = false,
    val dbHealthy: Boolean = false,
    val lastSync: Long = 0,
    val lastError: String? = null,
    val syncResults: List<SyncResult> = emptyList(),
    val latency: Long = 0
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

@Singleton
class StatusRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
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
        val currentUser = auth.currentUser
        if (currentUser == null) {
            _status.update { it.copy(connection = ConnectionStatus.AuthRequired, apiHealthy = true, dbHealthy = false) }
            return
        }
        val start = System.currentTimeMillis()
        try {
            firestore.collection("users").document(currentUser.uid).get().await()
            _status.update { it.copy(
                connection = ConnectionStatus.Connected,
                apiHealthy = true,
                dbHealthy = true,
                latency = System.currentTimeMillis() - start,
                lastError = null
            ) }
        } catch (error: Exception) {
            _status.update { it.copy(
                connection = error.connectionStatus(),
                apiHealthy = auth.currentUser != null,
                dbHealthy = false,
                lastError = error.userMessage()
            ) }
        }
    }

    suspend fun sync(user: CapUser) = coroutineScope {
        _status.update { it.copy(connection = ConnectionStatus.Checking) }
        val results = allowedSyncResources(user).map { resource ->
            async {
                val result = runCatching { firestore.collection(resource.collection).get().await().size() }
                SyncResult(resource.label, result.getOrNull(), result.exceptionOrNull()?.userMessage())
            }
        }.awaitAll()
        _status.update { it.copy(
            connection = if (results.any { result -> result.error != null }) ConnectionStatus.SyncError else ConnectionStatus.Connected,
            apiHealthy = auth.currentUser != null,
            dbHealthy = results.none { result -> result.error != null },
            syncResults = results,
            lastSync = System.currentTimeMillis(),
            lastError = results.firstOrNull { result -> result.error != null }?.error
        ) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {
    @Provides @Singleton fun auth(): FirebaseAuth = FirebaseAuth.getInstance()
    @Provides @Singleton fun firestore(): FirebaseFirestore =
        FirebaseFirestore.getInstance(FirebaseApp.getInstance(), "capdashboard")
}

class ApiException(message: String) : Exception(message)

@Singleton
class AuthRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) {
    suspend fun restore(): CapUser? {
        val firebaseUser = auth.currentUser ?: return null
        return try {
            loadProfile(firebaseUser.uid, firebaseUser.email.orEmpty())
        } catch (_: Exception) {
            auth.signOut()
            null
        }
    }

    suspend fun login(email: String, password: String): CapUser {
        try {
            val result = auth.signInWithEmailAndPassword(email.trim(), password).await()
            val firebaseUser = result.user ?: throw ApiException("Firebase did not return a user account.")
            return loadProfile(firebaseUser.uid, firebaseUser.email ?: email)
        } catch (error: ApiException) {
            auth.signOut()
            throw error
        } catch (error: Exception) {
            auth.signOut()
            throw ApiException(error.userMessage())
        }
    }

    private suspend fun loadProfile(uid: String, email: String): CapUser {
        val direct = firestore.collection("users").document(uid).get().await()
        val profile = if (direct.exists()) direct else {
            firestore.collection("users")
                .whereEqualTo("email", email.lowercase())
                .limit(1)
                .get()
                .await()
                .documents
                .firstOrNull()
                ?: throw ApiException("User profile not found.")
        }
        val user = profile.toCapUser(uid, email)
        if (!user.active) throw ApiException("This account is disabled.")
        return user
    }

    suspend fun logout() { auth.signOut() }
}

private fun DocumentSnapshot.toCapUser(uid: String, authEmail: String): CapUser {
    val permissions = (get("effective_permissions") ?: get("permissions") as? List<*>)
    val permissionSet = when (permissions) {
        is List<*> -> permissions.filterIsInstance<String>().toSet()
        is Map<*, *> -> permissions.filterValues { it == true }.keys.filterIsInstance<String>().toSet()
        else -> emptySet()
    }
    return CapUser(
        id = uid,
        name = getString("name") ?: getString("display_name") ?: authEmail,
        email = getString("email") ?: authEmail,
        role = getString("role") ?: "",
        active = getBoolean("is_active") ?: getBoolean("active") ?: false,
        permissions = permissionSet
    )
}

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
