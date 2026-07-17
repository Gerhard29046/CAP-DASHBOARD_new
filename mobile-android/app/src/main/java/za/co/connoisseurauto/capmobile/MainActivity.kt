package za.co.connoisseurauto.capmobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class AuthState(
    val loading: Boolean = true,
    val user: CapUser? = null,
    val error: String? = null
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val statusRepo: StatusRepository
) : ViewModel() {
    var state by mutableStateOf(AuthState())
        private set
    
    val status = statusRepo.status

    init {
        viewModelScope.launch {
            state = AuthState(false, auth.restore())
        }
    }

    fun login(email: String, password: String) = viewModelScope.launch {
        state = state.copy(loading = true, error = null)
        state = try {
            AuthState(false, auth.login(email, password))
        } catch (e: Exception) {
            AuthState(false, error = "Unable to sign in. Check your email address and password.")
        }
    }

    fun logout() = viewModelScope.launch {
        auth.logout()
        state = AuthState(false)
    }

    fun checkHealth() = viewModelScope.launch { statusRepo.checkHealth() }
    fun sync() = viewModelScope.launch { statusRepo.sync() }
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CapTheme {
                CapApp()
            }
        }
    }
}

private val Dark = darkColorScheme(
    primary = Color(0xFF67B58B),
    background = Color(0xFF0E1512),
    surface = Color(0xFF17201C)
)

@Composable
fun CapTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = Dark,
    content = content
)

@Composable
fun CapApp(vm: MainViewModel = hiltViewModel()) {
    when {
        vm.state.loading -> Box(Modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator()
        }
        vm.state.user == null -> LoginScreen(vm.state.error, vm::login)
        else -> AdaptiveShell(vm.state.user!!, vm::logout)
    }
}

@Composable
fun LoginScreen(error: String?, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().imePadding().padding(24.dp), Alignment.Center) {
        Card(Modifier.fillMaxWidth().widthIn(max = 460.dp)) {
            Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Icon(
                    Icons.Outlined.Engineering,
                    null,
                    Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Text("CAP Mobile", style = MaterialTheme.typography.headlineMedium)
                Text("Connoisseur Automotive Products")
                OutlinedTextField(
                    email,
                    { email = it },
                    Modifier.fillMaxWidth(),
                    label = { Text("Email Address") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                OutlinedTextField(
                    password,
                    { password = it },
                    Modifier.fillMaxWidth(),
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation()
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(
                    { login(email.trim(), password) },
                    Modifier.fillMaxWidth(),
                    enabled = email.isNotBlank() && password.isNotBlank()
                ) {
                    Text("Sign In")
                }
                Text("Version ${BuildConfig.VERSION_NAME}")
            }
        }
    }
}

data class Destination(
    val label: String,
    val permission: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

private val destinations = listOf(
    Destination("Dashboard", "dashboard.view", Icons.Outlined.Dashboard),
    Destination("Clients", "clients.view", Icons.Outlined.Groups),
    Destination("Machines", "machines.view", Icons.Outlined.PrecisionManufacturing),
    Destination("Services", "services.view", Icons.Outlined.Build),
    Destination("Jobs", "job_cards.view", Icons.Outlined.Assignment),
    Destination("Calendar", "calendar.view", Icons.Outlined.CalendarMonth),
    Destination("Knowledge Base", "knowledge_base.view", Icons.Outlined.LibraryBooks),
    Destination("Invoices", "invoices.queue.view", Icons.Outlined.ReceiptLong),
    Destination("Users", "users.view", Icons.Outlined.AdminPanelSettings),
    Destination("Status", "", Icons.Outlined.CloudSync)
)

@Composable
fun ServerStatusIndicator(status: ConnectionStatus) {
    val color = when (status) {
        ConnectionStatus.Connected -> Color.Green
        ConnectionStatus.Checking -> Color(0xFFFFA500)
        ConnectionStatus.Offline -> Color.Red
        ConnectionStatus.AuthRequired -> Color.Yellow
        ConnectionStatus.ServerError -> Color.Red
        ConnectionStatus.DbUnavailable -> Color.Red
        ConnectionStatus.SyncError -> Color(0xFFFFA500)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(status.name, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun StatusScreen(vm: MainViewModel) {
    val status by vm.status.collectAsState()
    val fmt = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("System Diagnostics", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
        }
        
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Connection Details", fontWeight = FontWeight.Bold)
                    StatusRow("Status", status.connection.name)
                    StatusRow("API Healthy", if (status.apiHealthy) "Yes" else "No")
                    StatusRow("DB Healthy", if (status.dbHealthy) "Yes" else "No")
                    StatusRow("Latency", "${status.latency} ms")
                    StatusRow("Environment", if (BuildConfig.DEBUG) "Debug" else "Production")
                    StatusRow("Base URL", BuildConfig.API_BASE_URL)
                    StatusRow("Last Sync", if (status.lastSync > 0) fmt.format(Date(status.lastSync)) else "Never")
                    
                    if (status.lastError != null) {
                        Text("Last Error: ${status.lastError}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button({ vm.checkHealth() }, Modifier.weight(1f)) { Text("Test") }
                        Button({ vm.sync() }, Modifier.weight(1f)) { Text("Sync") }
                    }
                }
            }
        }

        item {
            Text("Data Synchronisation", fontWeight = FontWeight.Bold)
        }

        items(status.syncResults) { result ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(result.resource)
                    if (result.error != null) {
                        Text("Error", color = MaterialTheme.colorScheme.error)
                    } else {
                        Text("${result.count ?: 0} records", color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
fun StatusRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdaptiveShell(user: CapUser, logout: () -> Unit) {
    val vm: MainViewModel = hiltViewModel()
    val status by vm.status.collectAsState()
    val visible = destinations.filter { it.label == "Status" || user.hasPermission(it.permission) }
    var selected by remember { mutableStateOf(visible.firstOrNull()?.label ?: "Access Denied") }
    
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val medium = maxWidth >= 600.dp
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(selected) },
                    actions = {
                        ServerStatusIndicator(status.connection)
                        IconButton(onClick = logout) {
                            Icon(Icons.Outlined.Logout, "Logout")
                        }
                    }
                )
            },
            bottomBar = {
                if (!medium) {
                    NavigationBar {
                        visible.take(4).forEach {
                            NavigationBarItem(
                                selected == it.label,
                                { selected = it.label },
                                icon = { Icon(it.icon, it.label) },
                                label = { Text(it.label) }
                            )
                        }
                    }
                }
            }
        ) { padding ->
            Row(Modifier.fillMaxSize().padding(padding)) {
                if (medium) {
                    NavigationRail {
                        visible.forEach {
                            NavigationRailItem(
                                selected == it.label,
                                { selected = it.label },
                                icon = { Icon(it.icon, it.label) },
                                label = { Text(it.label) }
                            )
                        }
                    }
                }
                Box(Modifier.weight(1f).fillMaxHeight().padding(24.dp)) {
                    if (selected == "Status") {
                        StatusScreen(vm)
                    } else {
                        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Text(selected, style = MaterialTheme.typography.headlineMedium)
                            Text("Phase 1 foundation is connected.")
                        }
                    }
                }
            }
        }
    }
}
