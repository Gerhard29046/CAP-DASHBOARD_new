package za.co.connoisseurauto.capmobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Serializable data class LoginRequest(val email:String,val password:String)
@Serializable data class CapUser(val id:Long,val name:String,val email:String,val role:String,@SerialName("is_active")val active:Boolean,@SerialName("effective_permissions")val permissions:Set<String> = emptySet()){fun hasPermission(key:String)=key in permissions;fun hasAnyPermission(keys:Collection<String>)=keys.any(::hasPermission);fun hasAllPermissions(keys:Collection<String>)=keys.all(::hasPermission)}
@Serializable data class LoginResponse(val token:String,val user:CapUser)
@Serializable data class MeResponse(val user:CapUser)
@Serializable data class HealthResponse(val status: String, val message: String, val database: String)

interface CapApi {
    @POST("login") suspend fun login(@Body request:LoginRequest):LoginResponse
    @GET("me") suspend fun me():MeResponse
    @POST("logout") suspend fun logout()
    @GET("health") suspend fun health(): HealthResponse
    @GET("clients") suspend fun getClients(): List<Map<String, kotlinx.serialization.json.JsonElement>>
    @GET("machines") suspend fun getMachines(): List<Map<String, kotlinx.serialization.json.JsonElement>>
    @GET("service-records") suspend fun getServiceRecords(): List<Map<String, kotlinx.serialization.json.JsonElement>>
    @GET("job-cards") suspend fun getJobCards(): List<Map<String, kotlinx.serialization.json.JsonElement>>
}

@Singleton class SecureSession @Inject constructor(@ApplicationContext context:Context){
    private val prefs=EncryptedSharedPreferences.create(context,"cap_secure_session",MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    var token:String? get()=prefs.getString("token",null)
    set(value){prefs.edit().apply{if(value==null)remove("token")else putString("token",value)}.apply()}
}

enum class ConnectionStatus { Connected, Checking, Offline, AuthRequired, ServerError, DbUnavailable, SyncError }
data class SyncResult(val resource: String, val count: Int?, val error: String? = null)
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
        connectivityManager.registerNetworkCallback(NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), callback)
        trySend(connectivityManager.activeNetwork != null)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}

@Singleton class StatusRepository @Inject constructor(
    private val api: CapApi,
    private val session: SecureSession,
    @ApplicationContext context: Context
) {
    private val _status = MutableStateFlow(GlobalStatus())
    val status = _status.asStateFlow()
    private val connectivity = ConnectivityObserver(context)

    init {
        connectivity.status.onEach { isOnline ->
            if (!isOnline) _status.update { it.copy(connection = ConnectionStatus.Offline) }
            else checkHealth()
        }.launchIn(kotlinx.coroutines.GlobalScope)
    }

    suspend fun checkHealth() {
        _status.update { it.copy(connection = ConnectionStatus.Checking) }
        val start = System.currentTimeMillis()
        try {
            val health = api.health()
            val latency = System.currentTimeMillis() - start
            _status.update { it.copy(
                connection = if (health.status == "ok") ConnectionStatus.Connected else ConnectionStatus.DbUnavailable,
                apiHealthy = true,
                dbHealthy = health.status == "ok",
                latency = latency,
                lastSync = System.currentTimeMillis()
            )}
        } catch (e: Exception) {
            val status = when {
                e is retrofit2.HttpException && e.code() == 401 -> ConnectionStatus.AuthRequired
                e is retrofit2.HttpException && e.code() >= 500 -> ConnectionStatus.ServerError
                else -> ConnectionStatus.Offline
            }
            _status.update { it.copy(connection = status, apiHealthy = false, dbHealthy = false, lastError = e.message) }
        }
    }

    suspend fun sync() = coroutineScope {
        _status.update { it.copy(connection = ConnectionStatus.Checking) }
        try {
            val results = listOf(
                async { runCatching { api.getClients().size }.let { SyncResult("Clients", it.getOrNull(), it.exceptionOrNull()?.message) } },
                async { runCatching { api.getMachines().size }.let { SyncResult("Machines", it.getOrNull(), it.exceptionOrNull()?.message) } },
                async { runCatching { api.getServiceRecords().size }.let { SyncResult("Service Records", it.getOrNull(), it.exceptionOrNull()?.message) } },
                async { runCatching { api.getJobCards().size }.let { SyncResult("Job Cards", it.getOrNull(), it.exceptionOrNull()?.message) } }
            ).awaitAll()
            _status.update { it.copy(
                connection = if (results.any { r -> r.error != null }) ConnectionStatus.SyncError else ConnectionStatus.Connected,
                syncResults = results,
                lastSync = System.currentTimeMillis()
            )}
        } catch (e: Exception) {
            _status.update { it.copy(connection = ConnectionStatus.SyncError, lastError = e.message) }
        }
    }
}

@Module @InstallIn(SingletonComponent::class) object NetworkModule {
    @Provides @Singleton fun json() = Json { ignoreUnknownKeys = true }
    @Provides @Singleton fun api(session: SecureSession, json: Json): CapApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .addInterceptor(Interceptor { chain ->
                chain.proceed(chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .apply { session.token?.let { header("Authorization", "Bearer $it") } }
                    .build())
            }).build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(CapApi::class.java)
    }
}

@Singleton class AuthRepository @Inject constructor(private val api: CapApi, private val session: SecureSession) {
    suspend fun restore(): CapUser? = if (session.token == null) null else runCatching { api.me().user }.getOrElse { session.token = null; null }
    suspend fun login(email: String, password: String): CapUser {
        val r = api.login(LoginRequest(email, password))
        session.token = r.token
        return r.user
    }
    suspend fun logout() { runCatching { api.logout() }; session.token = null }
}
