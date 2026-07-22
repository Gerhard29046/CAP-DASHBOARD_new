package com.CAPDATABASE.capdatabase

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import com.CAPDATABASE.capdatabase.ui.components.CapCard
import com.CAPDATABASE.capdatabase.ui.components.CapDateField
import com.CAPDATABASE.capdatabase.ui.components.CapDropdownField
import com.CAPDATABASE.capdatabase.ui.components.CapEmptyState
import com.CAPDATABASE.capdatabase.ui.components.CapListItem
import com.CAPDATABASE.capdatabase.ui.components.CapPrimaryButton
import com.CAPDATABASE.capdatabase.ui.components.CapScreenHeader
import com.CAPDATABASE.capdatabase.ui.components.CapSearchField
import com.CAPDATABASE.capdatabase.ui.components.CapSecondaryButton
import com.CAPDATABASE.capdatabase.ui.components.CapSectionCard
import com.CAPDATABASE.capdatabase.ui.components.CapSectionHeader
import com.CAPDATABASE.capdatabase.ui.components.CapStatCard
import com.CAPDATABASE.capdatabase.ui.components.CapStatusBadge
import com.CAPDATABASE.capdatabase.ui.components.CapTextField
import com.CAPDATABASE.capdatabase.ui.components.CapUserAvatar
import com.CAPDATABASE.capdatabase.ui.components.StatusTone
import com.CAPDATABASE.capdatabase.ui.navigation.CapAppScaffold
import com.CAPDATABASE.capdatabase.ui.navigation.CapBottomNavigation
import com.CAPDATABASE.capdatabase.ui.navigation.CapNavDestination
import com.CAPDATABASE.capdatabase.ui.navigation.CapTopAppBar
import com.CAPDATABASE.capdatabase.ui.theme.CapTheme
import com.CAPDATABASE.capdatabase.ui.theme.Spacing
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

data class AuthState(
    val loading: Boolean = true,
    val user: CapUser? = null,
    val error: String? = null
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val statusRepo: StatusRepository,
    private val recordsRepository: RecordsRepository
) : ViewModel() {
    var state by mutableStateOf(AuthState())
        private set
    var recordsState by mutableStateOf(RecordsState())
        private set
    var actionMessage by mutableStateOf<String?>(null)
        private set
    var connectionTestResult by mutableStateOf<ConnectionTestResult?>(null)
        private set
    var testingConnection by mutableStateOf(false)
        private set
    var sessionRestored by mutableStateOf(false)
        private set

    val status = statusRepo.status
    private var recordsJob: Job? = null

    init {
        viewModelScope.launch {
            val restoredUser = auth.restore()
            state = AuthState(false, restoredUser)
            if (restoredUser != null) start(restoredUser)
            sessionRestored = true
        }
    }

    private fun start(user: CapUser) {
        viewModelScope.launch {
            statusRepo.checkHealth()
            statusRepo.sync(user)
        }
        val permittedCollections = listOf(
            Triple("clients", "clients.view", true),
            Triple("machines", "machines.view", true),
            Triple("service_records", "services.view", true),
            Triple("job_cards", "job_cards.view", true),
            Triple("job_card_lines", "job_cards.lines.manage", true),
            Triple("knowledge_machines", "knowledge_base.view", true),
            Triple("knowledge_notes", "knowledge_base.view", true),
            Triple("knowledge_media", "knowledge_base.view", true),
            Triple("knowledge_documents", "knowledge_base.view", true),
            Triple("knowledge_service_codes", "knowledge_base.view", true),
            Triple("users", "users.view", true)
        ).filter { (_, permission) -> user.hasPermission(permission) }.map { it.first }
        recordsJob?.cancel()
        recordsJob = viewModelScope.launch {
            recordsRepository.observeCollections(permittedCollections).collect { recordsState = it }
        }
    }

    fun login(email: String, password: String) = viewModelScope.launch {
        state = state.copy(loading = true, error = null)
        try {
            val user = auth.login(email, password)
            state = AuthState(false, user)
            start(user)
        } catch (error: ApiException) {
            state = state.copy(loading = false, error = error.message)
        } catch (_: Exception) {
            state = state.copy(loading = false, error = "An unexpected error occurred.")
        }
    }

    fun logout() = viewModelScope.launch {
        recordsJob?.cancel()
        recordsState = RecordsState()
        auth.logout()
        state = AuthState(false)
    }

    fun save(collection: String, id: String?, fields: Map<String, Any?>, label: String) = viewModelScope.launch {
        actionMessage = null
        runCatching {
            if (id == null) recordsRepository.create(collection, fields)
            else recordsRepository.update(collection, id, fields)
        }.onSuccess { actionMessage = "$label saved and synchronized." }
            .onFailure { actionMessage = it.message ?: "Unable to save $label." }
    }

    fun delete(collection: String, id: String, label: String) = viewModelScope.launch {
        actionMessage = null
        runCatching { recordsRepository.delete(collection, id) }
            .onSuccess { actionMessage = "$label deleted." }
            .onFailure { actionMessage = it.message ?: "Unable to delete $label." }
    }

    fun clearMessage() { actionMessage = null }
    fun checkHealth() = viewModelScope.launch { statusRepo.checkHealth() }
    fun sync() = state.user?.let { user -> viewModelScope.launch { statusRepo.sync(user) } }
    fun testConnection() = viewModelScope.launch {
        testingConnection = true
        connectionTestResult = statusRepo.testConnection()
        testingConnection = false
    }
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CapTheme { CapApp() } }
    }
}

@Composable
fun CapApp(vm: MainViewModel = hiltViewModel()) {
    when {
        !vm.sessionRestored -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        vm.state.user == null -> LoginScreen(vm.state.error, vm.state.loading, vm::login)
        else -> AdaptiveShell(vm)
    }
}

@Composable
fun LoginScreen(error: String?, loading: Boolean, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf(BuildConfig.DEFAULT_LOGIN_EMAIL) }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    LazyColumn(
        Modifier.fillMaxSize().imePadding().padding(Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        item {
            CapCard(
                Modifier.widthIn(max = 460.dp),
            ) {
                Column(
                    Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    Icon(Icons.Outlined.Engineering, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("CAP Mobile", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Connoisseur Automotive Products",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    CapTextField(
                        label = "Email Address",
                        value = email,
                        onValueChange = { email = it },
                        keyboardType = KeyboardType.Email
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton({ passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                    contentDescription = if (passwordVisible) "Hide password" else "Show password"
                                )
                            }
                        },
                        shape = MaterialTheme.shapes.medium
                    )
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    CapPrimaryButton(
                        text = "Sign In",
                        onClick = { login(email.trim(), password) },
                        enabled = email.isNotBlank() && password.isNotBlank(),
                        loading = loading
                    )
                    Text(
                        "Version ${BuildConfig.VERSION_NAME}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

data class Destination(val label: String, val permission: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

/**
 * Permission-key registry for every non-bottom-nav screen. No longer the bottom-nav source
 * (see [AdaptiveShell] for the 4-item `CapBottomNavigation`) but kept as the single source of
 * truth for permission strings so [MoreScreen] gates each row on exactly the same key this list
 * has always used — none of these permission strings changed.
 */
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

private fun permissionFor(label: String) = destinations.first { it.label == label }.permission

@Composable
fun ServerStatusIndicator(status: ConnectionStatus) {
    val color = when (status) {
        ConnectionStatus.Connected -> Color.Green
        ConnectionStatus.Checking, ConnectionStatus.SyncError -> Color(0xFFFFA500)
        ConnectionStatus.AuthRequired -> Color.Yellow
        else -> Color.Red
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(status.name, style = MaterialTheme.typography.labelSmall)
    }
}

/**
 * The 4 bottom-nav destinations the whole build has been leading up to: Home, Clients, Jobs,
 * More. "Home" maps to the pre-existing "Dashboard" route string so `ScreenContent`'s `when`
 * doesn't need every case renamed. Clients/Jobs stay gated by their existing permission keys;
 * Home and More are always visible.
 *
 * Deliberate simplification: the old wide-screen `NavigationRail` branch (width >= 600dp) is
 * dropped entirely. The spec asks for "four main bottom-navigation destinations" with no
 * tablet-rail variant called out, and maintaining two parallel nav paradigms (rail + bottom bar)
 * for just 4 items adds complexity the spec doesn't ask for — `CapBottomNavigation` is now used
 * at all widths.
 */
private fun bottomNavDestinations(user: CapUser): List<CapNavDestination> = buildList {
    add(CapNavDestination("Dashboard", "Home", Icons.Outlined.Home))
    if (user.hasPermission(permissionFor("Clients"))) add(CapNavDestination("Clients", "Clients", Icons.Outlined.Groups))
    if (user.hasPermission(permissionFor("Jobs"))) add(CapNavDestination("Jobs", "Jobs", Icons.Outlined.Assignment))
    add(CapNavDestination("More", "More", Icons.Outlined.MoreHoriz))
}

@Composable
fun AdaptiveShell(vm: MainViewModel) {
    val user = vm.state.user ?: return
    val status by vm.status.collectAsState()
    var selected by remember { mutableStateOf("Dashboard") }
    val snackbar = remember { SnackbarHostState() }
    val bottomDestinations = remember(user) { bottomNavDestinations(user) }

    LaunchedEffect(vm.actionMessage) {
        vm.actionMessage?.let { snackbar.showSnackbar(it); vm.clearMessage() }
    }

    val title = when (selected) {
        "Dashboard" -> "Home"
        "LogNewService" -> "Log New Service"
        "BookIn" -> "Book In"
        else -> destinations.firstOrNull { it.label == selected }?.label ?: selected
    }

    CapAppScaffold(
        topBar = {
            CapTopAppBar(
                title = title,
                actions = { ServerStatusIndicator(status.connection) }
            )
        },
        bottomBar = {
            CapBottomNavigation(bottomDestinations, selected, onSelect = { selected = it })
        },
        snackbarHostState = snackbar
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 12.dp)) {
            ScreenContent(selected, vm, user) { selected = it }
        }
    }
}

@Composable
private fun ScreenContent(selected: String, vm: MainViewModel, user: CapUser, onNavigate: (String) -> Unit) {
    val data = vm.recordsState
    if (data.loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    data.error?.let {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(it, color = MaterialTheme.colorScheme.error) }
        return
    }
    when (selected) {
        "Dashboard" -> DashboardScreen(data, user, onNavigate)
        "Clients" -> ClientsScreen(data, user, vm::save)
        "Machines" -> MachinesScreen(data, user, vm::save)
        "Services" -> ServicesScreen(data, user, vm::save)
        "Jobs" -> JobsScreen(data, user, vm::save)
        "Calendar" -> CalendarScreen(data, user, vm::save)
        "Knowledge Base" -> KnowledgeBaseScreen(data, user, vm::save)
        "Invoices" -> InvoiceScreen(data)
        "Users" -> SimpleRecordsScreen("users", data, "name", "email", "No users found.")
        "Status" -> StatusScreen(vm)
        "More" -> MoreScreen(user, onNavigate, vm::logout)
        "Account" -> AccountScreen(user, vm::logout)
        "LogNewService" -> LogNewServiceScreen(data.collection("clients"), data.collection("machines"), vm::save, vm.actionMessage, { onNavigate("Dashboard") }) { onNavigate("Dashboard") }
        "BookIn" -> BookInScreen(data.collection("clients"), data.collection("machines"), vm::save, vm.actionMessage, { onNavigate("Dashboard") }) { onNavigate("Dashboard") }
    }
}

/**
 * Phase 12 "More" screen: everything that used to live in the old dropdown-menu / NavigationRail
 * now lives here, still gated by the exact same permission keys `destinations` has always used.
 * "Upcoming Services" is the existing due-services screen restyled in Phase 6 (route "Calendar")
 * — there is no separate literal calendar-grid view in this app, so this is intentionally a
 * single row, not a duplicate of some other calendar feature.
 */
@Composable
private fun MoreScreen(user: CapUser, onNavigate: (String) -> Unit, onLogout: () -> Unit) {
    var confirmLogout by remember { mutableStateOf(false) }
    val showOperations = user.hasPermission(permissionFor("Machines")) ||
        user.hasPermission(permissionFor("Calendar")) ||
        user.hasPermission(permissionFor("Services")) ||
        user.hasPermission("job_cards.create")
    val showResources = user.hasPermission(permissionFor("Knowledge Base")) ||
        user.hasPermission(permissionFor("Invoices")) ||
        user.hasPermission(permissionFor("Users"))

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        CapScreenHeader("More")

        if (showOperations) {
            CapCard {
                if (user.hasPermission(permissionFor("Machines"))) {
                    CapListItem("Machines", leading = { Icon(Icons.Outlined.PrecisionManufacturing, null) }, showNavArrow = true, onClick = { onNavigate("Machines") })
                }
                if (user.hasPermission(permissionFor("Calendar"))) {
                    CapListItem("Upcoming Services", leading = { Icon(Icons.Outlined.CalendarMonth, null) }, showNavArrow = true, onClick = { onNavigate("Calendar") })
                }
                if (user.hasPermission(permissionFor("Services"))) {
                    CapListItem("Service Records", leading = { Icon(Icons.Outlined.Build, null) }, showNavArrow = true, onClick = { onNavigate("Services") })
                }
                if (user.hasPermission("job_cards.create")) {
                    CapListItem("Book In", leading = { Icon(Icons.Outlined.EventAvailable, null) }, showNavArrow = true, onClick = { onNavigate("BookIn") })
                }
            }
        }

        if (showResources) {
            CapCard {
                if (user.hasPermission(permissionFor("Knowledge Base"))) {
                    CapListItem("Machine Knowledge Base", leading = { Icon(Icons.Outlined.LibraryBooks, null) }, showNavArrow = true, onClick = { onNavigate("Knowledge Base") })
                }
                if (user.hasPermission(permissionFor("Invoices"))) {
                    CapListItem("Invoice Queue", leading = { Icon(Icons.Outlined.ReceiptLong, null) }, showNavArrow = true, onClick = { onNavigate("Invoices") })
                }
                if (user.hasPermission(permissionFor("Users"))) {
                    CapListItem("Users", leading = { Icon(Icons.Outlined.AdminPanelSettings, null) }, showNavArrow = true, onClick = { onNavigate("Users") })
                }
            }
        }

        CapCard {
            CapListItem("Connection and Sync Status", leading = { Icon(Icons.Outlined.CloudSync, null) }, showNavArrow = true, onClick = { onNavigate("Status") })
        }

        CapCard {
            CapListItem("Account", leading = { Icon(Icons.Outlined.Person, null) }, showNavArrow = true, onClick = { onNavigate("Account") })
            CapListItem("Logout", leading = { Icon(Icons.Outlined.Logout, null) }, onClick = { confirmLogout = true })
        }
    }

    if (confirmLogout) {
        LogoutConfirmDialog(onDismiss = { confirmLogout = false }) {
            confirmLogout = false
            onLogout()
        }
    }
}

/** Phase 12 Account screen: identity summary, auth provider, app build, and logout with confirmation. */
@Composable
private fun AccountScreen(user: CapUser, onLogout: () -> Unit) {
    var confirmLogout by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        CapScreenHeader("Account")

        CapCard {
            CapListItem(user.name, subtitle = "Name", leading = { Icon(Icons.Outlined.Person, null) })
            CapListItem(user.email, subtitle = "Email", leading = { Icon(Icons.Outlined.Email, null) })
            CapListItem(user.role, subtitle = "Role", leading = { Icon(Icons.Outlined.Badge, null) })
            CapListItem("Firebase", subtitle = "Authentication provider", leading = { Icon(Icons.Outlined.Security, null) })
        }

        CapCard {
            CapListItem(
                "${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                subtitle = "App version",
                leading = { Icon(Icons.Outlined.Info, null) }
            )
        }

        Button(
            onClick = { confirmLogout = true },
            modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError
            ),
            shape = MaterialTheme.shapes.medium
        ) {
            Icon(Icons.Outlined.Logout, null, Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text("Logout")
        }
    }

    if (confirmLogout) {
        LogoutConfirmDialog(onDismiss = { confirmLogout = false }) {
            confirmLogout = false
            onLogout()
        }
    }
}

/** Shared logout confirmation dialog, mirroring the existing `EditDialog` AlertDialog structure. */
@Composable
private fun LogoutConfirmDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log out?") },
        text = { Text("Are you sure you want to log out?") },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError
                )
            ) { Text("Logout") }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun DashboardScreen(data: RecordsState, user: CapUser, onNavigate: (String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    val jobs = data.collection("job_cards")
    val machinesById = machines.associateBy { it.id }
    val clientsById = clients.associateBy { it.id }

    val closedJobStatuses = setOf("Completed", "Collected")
    val openJobs = jobs.count { it.text("status") !in closedJobStatuses }
    val dueServices = services.filter { it.text("next_service_due").isNotBlank() }.sortedBy { it.text("next_service_due") }

    val initials = user.name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        .take(2).mapNotNull { it.firstOrNull()?.toString() }.joinToString("").ifBlank { "?" }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        item {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                CapScreenHeader(title = "CAP Database", subtitle = "Live Firebase overview")
                CapCard {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        CapUserAvatar(initials)
                        Column(Modifier.weight(1f)) {
                            Text(user.name.ifBlank { "Signed-in user" }, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(user.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        CapStatusBadge(user.role.ifBlank { "User" }, StatusTone.Info)
                    }
                }
            }
        }
        item {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapStatCard(Icons.Outlined.Groups, "Clients", clients.size.toString(), Modifier.weight(1f), "Active client accounts")
                    CapStatCard(Icons.Outlined.Build, "Machines", machines.size.toString(), Modifier.weight(1f), "Machines on record")
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapStatCard(Icons.Outlined.Assignment, "Open Jobs", openJobs.toString(), Modifier.weight(1f), "Not yet completed")
                    CapStatCard(Icons.Outlined.Event, "Due Services", dueServices.size.toString(), Modifier.weight(1f), "With a next-due date")
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                DashboardQuickAction(Icons.Outlined.Build, "Log New Service", Modifier.weight(1f)) {
                    onNavigate("LogNewService")
                }
                DashboardQuickAction(Icons.Outlined.PrecisionManufacturing, "Book In Machine", Modifier.weight(1f)) {
                    onNavigate("BookIn")
                }
                DashboardQuickAction(Icons.Outlined.Assignment, "View Jobs", Modifier.weight(1f)) {
                    onNavigate("Jobs")
                }
                DashboardQuickAction(Icons.Outlined.Groups, "View Clients", Modifier.weight(1f)) {
                    onNavigate("Clients")
                }
            }
        }
        item {
            CapCard {
                CapSectionHeader(title = "Upcoming Services", action = {
                    Text(
                        "View all",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable {
                            // TODO: wire navigation once bottom-nav/NavHost lands
                        }
                    )
                })
                if (dueServices.isEmpty()) {
                    CapEmptyState("No upcoming service dates.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                } else {
                    dueServices.take(5).forEach { service ->
                        val machine = machinesById[service.text("machine_id")]
                        val client = clientsById[machine?.text("client_id")]
                        CapListItem(
                            title = machineTitle(machine),
                            subtitle = listOfNotNull(
                                client?.text("company_name")?.ifBlank { null },
                                "Due ${service.text("next_service_due")}"
                            ).joinToString(" · ")
                        )
                    }
                }
            }
        }
        item {
            CapCard {
                CapSectionHeader(title = "Recent Clients")
                if (clients.isEmpty()) {
                    CapEmptyState("No clients yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                } else {
                    clients.takeLast(5).reversed().forEach { client ->
                        ClientSummary(client, relatedRecords(machines, "client_id", client.id))
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardQuickAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            Modifier.fillMaxWidth().padding(Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun ClientsScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    val jobs = data.collection("job_cards")
    var clientDialog by remember { mutableStateOf(false) }
    var machineClient by remember { mutableStateOf<CapRecord?>(null) }
    var editMachine by remember { mutableStateOf<CapRecord?>(null) }
    var selectedClient by remember { mutableStateOf<CapRecord?>(null) }
    var query by remember { mutableStateOf("") }

    val activeClient = selectedClient
    if (activeClient != null) {
        val clientMachineIds = relatedRecords(machines, "client_id", activeClient.id).map { it.id }.toSet()
        ClientDetailScreen(
            client = activeClient,
            machines = relatedRecords(machines, "client_id", activeClient.id),
            services = services.filter { it.text("machine_id") in clientMachineIds },
            jobs = relatedRecords(jobs, "client_id", activeClient.id),
            user = user,
            clients = clients,
            save = save,
            onBack = { selectedClient = null }
        )
        return
    }

    val filteredClients = clients.filter { client ->
        query.isBlank() ||
            client.text("company_name").contains(query, ignoreCase = true) ||
            client.text("contact_person").contains(query, ignoreCase = true)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search clients",
                    modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
                )
            }
            if (filteredClients.isEmpty()) {
                item {
                    CapEmptyState(
                        if (clients.isEmpty()) "No clients yet. Add the first client." else "No clients match your search.",
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }
            items(filteredClients, key = { it.id }) { client ->
                val clientMachines = relatedRecords(machines, "client_id", client.id)
                CapCard {
                    CapListItem(
                        title = client.text("company_name").ifBlank { "Unnamed client" },
                        subtitle = listOfNotNull(
                            client.text("contact_person").ifBlank { null },
                            "${clientMachines.size} ${if (clientMachines.size == 1) "machine" else "machines"}"
                        ).joinToString(" · "),
                        showNavArrow = true,
                        onClick = { selectedClient = client }
                    )
                }
            }
        }
        if (user.hasPermission("clients.create")) FloatingActionButton({ clientDialog = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.PersonAdd, "Add client") }
    }
    if (clientDialog) ClientDialog({ clientDialog = false }) { fields -> save("clients", null, fields, "Client"); clientDialog = false }
    machineClient?.let { client -> MachineDialog(clients, null, client.id, { machineClient = null }) { fields -> save("machines", null, fields, "Machine"); machineClient = null } }
    editMachine?.let { machine -> MachineDialog(clients, machine, machine.text("client_id"), { editMachine = null }) { fields -> save("machines", machine.id, fields, "Machine"); editMachine = null } }
}

@Composable
private fun ClientSummary(client: CapRecord, machines: List<CapRecord>) {
    Column {
        Text(client.text("company_name").ifBlank { "Unnamed client" }, style = MaterialTheme.typography.titleMedium)
        Text(client.text("contact_person").ifBlank { "No contact person" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("${machines.size} ${if (machines.size == 1) "machine" else "machines"}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun ClientDetailScreen(
    client: CapRecord,
    machines: List<CapRecord>,
    services: List<CapRecord>,
    jobs: List<CapRecord>,
    user: CapUser,
    clients: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onBack: () -> Unit
) {
    var machineDialog by remember { mutableStateOf(false) }
    var editMachine by remember { mutableStateOf<CapRecord?>(null) }
    val closedJobStatuses = setOf("Completed", "Collected")
    val openJobs = jobs.filter { it.text("status") !in closedJobStatuses }
    val recentServices = services.sortedByDescending { it.text("service_date") }.take(5)
    val machinesById = machines.associateBy { it.id }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                    Text("Back to clients", style = MaterialTheme.typography.labelLarge)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        client.text("company_name").ifBlank { "Unnamed client" },
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                client.text("contact_person").ifBlank { null }?.let { "Contact" to it },
                                client.text("phone").ifBlank { null }?.let { "Phone" to it },
                                client.text("email").ifBlank { null }?.let { "Email" to it },
                                client.text("address").ifBlank { null }?.let { "Address" to it },
                                client.text("notes").ifBlank { null }?.let { "Notes" to it }
                            ).forEach { (label, value) ->
                                Column {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
            item {
                CapCard {
                    CapSectionHeader(title = "Machines (${machines.size})")
                    if (machines.isEmpty()) {
                        CapEmptyState("No machines for this client yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            machines.forEach { machine ->
                                CapListItem(
                                    title = machineTitle(machine),
                                    subtitle = machine.text("serial_number").ifBlank { "No serial number" },
                                    showNavArrow = user.hasPermission("machines.edit"),
                                    onClick = if (user.hasPermission("machines.edit")) ({ editMachine = machine }) else null
                                )
                            }
                        }
                    }
                    if (user.hasPermission("machines.create")) {
                        CapSecondaryButton(
                            text = "Add machine",
                            onClick = { machineDialog = true },
                            modifier = Modifier.padding(top = Spacing.sm)
                        )
                    }
                }
            }
            item {
                CapCard {
                    CapSectionHeader(title = "Recent Service Records")
                    if (recentServices.isEmpty()) {
                        CapEmptyState("No service records yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            recentServices.forEach { service ->
                                CapListItem(
                                    title = machineTitle(machinesById[service.text("machine_id")]),
                                    subtitle = listOfNotNull(
                                        service.text("service_date").ifBlank { null },
                                        service.text("work_performed").ifBlank { null }
                                    ).joinToString(" · ")
                                )
                            }
                        }
                    }
                }
            }
            item {
                CapCard {
                    CapSectionHeader(title = "Open Jobs (${openJobs.size})")
                    if (openJobs.isEmpty()) {
                        CapEmptyState("No open jobs for this client.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            openJobs.forEach { job ->
                                CapListItem(
                                    title = job.text("job_number").ifBlank { "Job card" },
                                    subtitle = listOfNotNull(
                                        job.text("status").ifBlank { null },
                                        job.text("fault_description").ifBlank { null }
                                    ).joinToString(" · ")
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    if (machineDialog) MachineDialog(clients, null, client.id, { machineDialog = false }) { fields -> save("machines", null, fields, "Machine"); machineDialog = false }
    editMachine?.let { machine -> MachineDialog(clients, machine, machine.text("client_id"), { editMachine = null }) { fields -> save("machines", machine.id, fields, "Machine"); editMachine = null } }
}

@Composable
private fun MachinesScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    var creating by remember { mutableStateOf(false) }
    var selectedMachine by remember { mutableStateOf<CapRecord?>(null) }
    var query by remember { mutableStateOf("") }
    val clientNames = clients.associate { it.id to it.text("company_name") }

    val activeMachine = selectedMachine
    if (activeMachine != null) {
        MachineDetailScreen(
            machine = activeMachine,
            clients = clients,
            services = relatedRecords(services, "machine_id", activeMachine.id),
            user = user,
            save = save,
            onBack = { selectedMachine = null }
        )
        return
    }

    val filteredMachines = machines.filter { machine ->
        query.isBlank() ||
            machine.text("brand").contains(query, ignoreCase = true) ||
            machine.text("model").contains(query, ignoreCase = true) ||
            machine.text("serial_number").contains(query, ignoreCase = true)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search machines",
                    modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
                )
            }
            if (filteredMachines.isEmpty()) {
                item {
                    CapEmptyState(
                        if (machines.isEmpty()) "No machines yet. Add the first machine." else "No machines match your search.",
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }
            items(filteredMachines, key = { it.id }) { machine ->
                CapCard {
                    CapListItem(
                        title = machineTitle(machine),
                        subtitle = listOfNotNull(
                            clientNames[machine.text("client_id")]?.ifBlank { null },
                            machine.text("serial_number").ifBlank { null }
                        ).joinToString(" · "),
                        showNavArrow = true,
                        onClick = { selectedMachine = machine }
                    )
                }
            }
        }
        if (user.hasPermission("machines.create") && clients.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add machine") }
    }
    if (creating) MachineDialog(clients, null, clients.firstOrNull()?.id.orEmpty(), { creating = false }) { save("machines", null, it, "Machine"); creating = false }
}

@Composable
private fun MachineDetailScreen(
    machine: CapRecord,
    clients: List<CapRecord>,
    services: List<CapRecord>,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onBack: () -> Unit
) {
    var editDialog by remember { mutableStateOf(false) }
    val client = clients.firstOrNull { it.id == machine.text("client_id") }
    val sortedServices = services.sortedByDescending { it.text("service_date") }
    val lastService = sortedServices.firstOrNull { it.text("service_date").isNotBlank() }
    val nextService = services
        .filter { it.text("next_service_due").isNotBlank() }
        .maxByOrNull { it.text("next_service_due") }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                    Text("Back to machines", style = MaterialTheme.typography.labelLarge)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        machineTitle(machine),
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                client?.text("company_name")?.ifBlank { null }?.let { "Client" to it },
                                machine.text("serial_number").ifBlank { null }?.let { "Serial number" to it },
                                machine.text("machine_type").ifBlank { null }?.let { "Machine type" to it },
                                machine.text("refrigerant_type").ifBlank { null }?.let { "Refrigerant" to it },
                                machine.text("installation_date").ifBlank { null }?.let { "Installed" to it },
                                lastService?.text("service_date")?.ifBlank { null }?.let { "Last service" to it },
                                nextService?.text("next_service_due")?.ifBlank { null }?.let { "Next service due" to it }
                            ).forEach { (label, value) ->
                                Column {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                    if (user.hasPermission("machines.edit")) {
                        CapSecondaryButton(
                            text = "Edit",
                            onClick = { editDialog = true },
                            modifier = Modifier.padding(top = Spacing.sm)
                        )
                    }
                }
            }
            item {
                CapCard {
                    CapSectionHeader(title = "Service History (${services.size})")
                    if (sortedServices.isEmpty()) {
                        CapEmptyState("No service records for this machine yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            sortedServices.forEach { service ->
                                CapListItem(
                                    title = service.text("service_date").ifBlank { "Service record" },
                                    subtitle = listOfNotNull(
                                        service.text("technician_name").ifBlank { null },
                                        service.text("work_performed").ifBlank { null }
                                    ).joinToString(" · ")
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    if (editDialog) MachineDialog(clients, machine, machine.text("client_id"), { editDialog = false }) { fields -> save("machines", machine.id, fields, "Machine"); editDialog = false }
}

@Composable
private fun ServiceRecordDetailScreen(
    service: CapRecord,
    machine: CapRecord?,
    client: CapRecord?,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onBack: () -> Unit,
    onEdit: () -> Unit
) {
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                    Text("Back", style = MaterialTheme.typography.labelLarge)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        machineTitle(machine),
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    client?.text("company_name")?.ifBlank { null }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                service.text("service_date").ifBlank { null }?.let { "Service date" to it },
                                service.text("technician_name").ifBlank { null }?.let { "Technician" to it },
                                service.text("work_performed").ifBlank { null }?.let { "Work performed" to it },
                                service.text("next_service_due").ifBlank { null }?.let { "Next service due" to it }
                            ).forEach { (label, value) ->
                                Column {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                    if (user.hasPermission("services.edit")) {
                        CapSecondaryButton(
                            text = "Edit",
                            onClick = onEdit,
                            modifier = Modifier.padding(top = Spacing.sm)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Dedicated full-screen form for logging a new service record (distinct from the compact
 * [ServiceDialog] modal used for quick edits elsewhere). Reachable only via the Dashboard's
 * "Log New Service" quick action for now (Phase 9) — not part of bottom-nav/destinations.
 */
@Composable
private fun LogNewServiceScreen(
    clients: List<CapRecord>,
    machines: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    actionMessage: String?,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember { mutableStateOf(clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(clientId) { mutableStateOf(availableMachines.firstOrNull()?.id.orEmpty()) }
    var date by remember { mutableStateOf(today) }
    var technician by remember { mutableStateOf("") }
    var workPerformed by remember { mutableStateOf("") }
    var nextServiceDue by remember { mutableStateOf("") }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }

    // MainViewModel.save() is fire-and-forget: it sets actionMessage = null as the first
    // statement inside its viewModelScope.launch block, then assigns a non-null message
    // onSuccess/onFailure. viewModelScope dispatches on Dispatchers.Main.immediate, and this
    // onClick runs on the main thread, so that null-reset happens synchronously before save()
    // returns control here — meaning any stale actionMessage from an earlier action is already
    // cleared by the time we flip `submitting` to true. The later null -> non-null transition
    // is therefore a reliable "this save finished" signal, observable without changing
    // MainViewModel's signature. We compare against the exact success string (built from the
    // label we pass in) rather than pattern-matching the failure text, since a failure message
    // can be an arbitrary exception message that offers no fixed prefix to key off.
    val successMessage = "Service record saved and synchronized."
    LaunchedEffect(submitting, actionMessage) {
        if (submitting && actionMessage != null) {
            submitting = false
            if (actionMessage == successMessage) onSaved()
        }
    }

    val machineError = attemptedSubmit && machineId.isBlank()
    val dateError = attemptedSubmit && date.isBlank()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
            }
            Text("Back to dashboard", style = MaterialTheme.typography.labelLarge)
        }
        CapScreenHeader(title = "Log New Service", subtitle = "Record a completed or scheduled service")
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapDropdownField(
                    label = "Client",
                    options = clients.map { it.id to it.text("company_name") },
                    selectedKey = clientId,
                    onSelected = { selected ->
                        clientId = selected
                        machineId = machines.firstOrNull { sameRecordId(it.fields["client_id"], selected) }?.id.orEmpty()
                    },
                    required = true
                )
                CapDropdownField(
                    label = "Machine",
                    options = availableMachines.map { it.id to machineTitle(it) },
                    selectedKey = machineId,
                    onSelected = { machineId = it },
                    required = true
                )
                if (machineError) {
                    Text(
                        "Machine is required.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                CapDateField(
                    label = "Service date",
                    value = date,
                    onValueChange = { date = it },
                    required = true
                )
                if (dateError) {
                    Text(
                        "Service date is required.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                CapTextField(label = "Technician", value = technician, onValueChange = { technician = it })
                CapTextField(label = "Work performed", value = workPerformed, onValueChange = { workPerformed = it })
                CapTextField(label = "Next service due", value = nextServiceDue, onValueChange = { nextServiceDue = it })
            }
        }
        CapPrimaryButton(
            text = "Save Service Record",
            onClick = {
                attemptedSubmit = true
                if (machineId.isBlank() || date.isBlank()) return@CapPrimaryButton
                submitting = true
                save(
                    "service_records",
                    null,
                    mapOf(
                        "machine_id" to machineId,
                        "service_date" to date,
                        "technician_name" to technician.trim(),
                        "work_performed" to workPerformed.trim(),
                        "next_service_due" to nextServiceDue.trim()
                    ),
                    "Service record"
                )
            },
            enabled = !submitting && machineId.isNotBlank() && date.isNotBlank(),
            loading = submitting
        )
    }
}

@Composable
private fun BookInScreen(
    clients: List<CapRecord>,
    machines: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    actionMessage: String?,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember { mutableStateOf(clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(clientId) { mutableStateOf(availableMachines.firstOrNull()?.id.orEmpty()) }
    var date by remember { mutableStateOf(today) }
    var technician by remember { mutableStateOf("") }
    var fault by remember { mutableStateOf("") }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }

    // See LogNewServiceScreen for the rationale behind this actionMessage-transition pattern:
    // MainViewModel.save() resets actionMessage to null synchronously before assigning the
    // final success/failure message, so a null -> non-null transition observed while
    // `submitting` is true reliably signals this save's completion.
    val successMessage = "Job card saved and synchronized."
    LaunchedEffect(submitting, actionMessage) {
        if (submitting && actionMessage != null) {
            submitting = false
            if (actionMessage == successMessage) onSaved()
        }
    }

    val clientError = attemptedSubmit && clientId.isBlank()
    val machineError = attemptedSubmit && machineId.isBlank()
    val faultError = attemptedSubmit && fault.isBlank()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
            }
            Text("Back to dashboard", style = MaterialTheme.typography.labelLarge)
        }
        CapScreenHeader(title = "Book In Machine", subtitle = "Create a new job card for an incoming machine")
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapDropdownField(
                    label = "Client",
                    options = clients.map { it.id to it.text("company_name") },
                    selectedKey = clientId,
                    onSelected = { selected ->
                        clientId = selected
                        machineId = machines.firstOrNull { sameRecordId(it.fields["client_id"], selected) }?.id.orEmpty()
                    },
                    required = true
                )
                if (clientError) {
                    Text(
                        "Client is required.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                CapDropdownField(
                    label = "Machine",
                    options = availableMachines.map { it.id to machineTitle(it) },
                    selectedKey = machineId,
                    onSelected = { machineId = it },
                    required = true
                )
                if (machineError) {
                    Text(
                        "Machine is required.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                CapDateField(
                    label = "Date received",
                    value = date,
                    onValueChange = { date = it },
                    required = true
                )
                CapTextField(label = "Technician", value = technician, onValueChange = { technician = it })
                CapTextField(label = "Fault description", value = fault, onValueChange = { fault = it })
                if (faultError) {
                    Text(
                        "Fault description is required.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
        CapPrimaryButton(
            text = "Book In Machine",
            onClick = {
                attemptedSubmit = true
                if (clientId.isBlank() || machineId.isBlank() || fault.isBlank()) return@CapPrimaryButton
                submitting = true
                save(
                    "job_cards",
                    null,
                    mapOf(
                        "job_number" to "JOB-${System.currentTimeMillis().toString().takeLast(6)}",
                        "client_id" to clientId,
                        "machine_id" to machineId,
                        "status" to "Booked In",
                        "date_received" to date,
                        "fault_description" to fault.trim(),
                        "technician_name" to technician.trim()
                    ),
                    "Job card"
                )
            },
            enabled = !submitting && clientId.isNotBlank() && machineId.isNotBlank() && fault.isNotBlank(),
            loading = submitting
        )
    }
}

@Composable
private fun ServicesScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val machines = data.collection("machines")
    val machinesById = machines.associateBy { it.id }
    val clientsById = data.collection("clients").associateBy { it.id }
    val services = data.collection("service_records")
    var editing by remember { mutableStateOf<CapRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    var selectedService by remember { mutableStateOf<CapRecord?>(null) }
    var query by remember { mutableStateOf("") }

    val activeService = selectedService
    if (activeService != null) {
        val machine = machinesById[activeService.text("machine_id")]
        val client = clientsById[machine?.text("client_id")]
        ServiceRecordDetailScreen(
            service = activeService,
            machine = machine,
            client = client,
            user = user,
            save = save,
            onBack = { selectedService = null },
            onEdit = { editing = activeService }
        )
        if (editing != null) {
            val service = editing!!
            ServiceDialog(machines, service, { editing = null }) { fields ->
                save("service_records", service.id, fields, "Service record")
                editing = null
            }
        }
        return
    }

    val filteredServices = services.filter { service ->
        query.isBlank() ||
            machineTitle(machinesById[service.text("machine_id")]).contains(query, ignoreCase = true) ||
            service.text("technician_name").contains(query, ignoreCase = true) ||
            service.text("work_performed").contains(query, ignoreCase = true)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search machine, technician, or work performed",
                    modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
                )
            }
            if (filteredServices.isEmpty()) {
                item {
                    CapEmptyState(
                        if (services.isEmpty()) "No service records yet." else "No service records match your search.",
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }
            items(filteredServices.sortedByDescending { it.text("service_date") }, key = { it.id }) { service ->
                CapCard {
                    CapListItem(
                        title = machineTitle(machinesById[service.text("machine_id")]),
                        subtitle = listOfNotNull(
                            service.text("service_date").ifBlank { null },
                            service.text("technician_name").ifBlank { null }
                        ).joinToString(" · "),
                        showNavArrow = true,
                        onClick = { selectedService = service }
                    )
                }
            }
        }
        if (user.hasPermission("services.create") && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add service") }
    }
    if (creating) ServiceDialog(machines, null, { creating = false }) { save("service_records", null, it, "Service record"); creating = false }
}

private fun jobStatusTone(status: String): StatusTone = when (status) {
    "Booked In" -> StatusTone.Neutral
    "Open", "In Progress" -> StatusTone.Info
    "Completed" -> StatusTone.Success
    "Ready to Invoice" -> StatusTone.Warning
    else -> StatusTone.Neutral
}

@Composable
private fun JobsScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val jobs = data.collection("job_cards")
    var creating by remember { mutableStateOf(false) }
    var selectedJob by remember { mutableStateOf<CapRecord?>(null) }
    var query by remember { mutableStateOf("") }
    val clientNames = clients.associate { it.id to it.text("company_name") }

    val activeJob = selectedJob
    if (activeJob != null) {
        JobDetailScreen(
            job = activeJob,
            clients = clients,
            machines = machines,
            user = user,
            save = save,
            onBack = { selectedJob = null }
        )
        return
    }

    val filteredJobs = jobs.filter { job ->
        query.isBlank() ||
            job.text("job_number").contains(query, ignoreCase = true) ||
            clientNames[job.text("client_id")].orEmpty().contains(query, ignoreCase = true) ||
            job.text("fault_description").contains(query, ignoreCase = true)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search job number, client, or fault",
                    modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
                )
            }
            if (filteredJobs.isEmpty()) {
                item {
                    CapEmptyState(
                        if (jobs.isEmpty()) "No job cards yet. Add the first job." else "No job cards match your search.",
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }
            items(filteredJobs.sortedByDescending { it.text("date_received") }, key = { it.id }) { job ->
                CapCard {
                    CapListItem(
                        title = job.text("job_number").ifBlank { "Job card" },
                        subtitle = listOfNotNull(
                            clientNames[job.text("client_id")]?.ifBlank { null },
                            job.text("fault_description").ifBlank { null }
                        ).joinToString(" · "),
                        trailing = { CapStatusBadge(job.text("status").ifBlank { "Booked In" }, jobStatusTone(job.text("status"))) },
                        showNavArrow = true,
                        onClick = { selectedJob = job }
                    )
                }
            }
        }
        if (user.hasPermission("job_cards.create") && clients.isNotEmpty() && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add job") }
    }
    if (creating) JobDialog(clients, machines, null, { creating = false }) { save("job_cards", null, it, "Job card"); creating = false }
}

@Composable
private fun JobDetailScreen(
    job: CapRecord,
    clients: List<CapRecord>,
    machines: List<CapRecord>,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onBack: () -> Unit
) {
    var editDialog by remember { mutableStateOf(false) }
    val client = clients.firstOrNull { it.id == job.text("client_id") }
    val machine = machines.firstOrNull { it.id == job.text("machine_id") }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                    Text("Back to jobs", style = MaterialTheme.typography.labelLarge)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            job.text("job_number").ifBlank { "Job card" },
                            style = MaterialTheme.typography.headlineSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        CapStatusBadge(job.text("status").ifBlank { "Booked In" }, jobStatusTone(job.text("status")))
                    }
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                client?.text("company_name")?.ifBlank { null }?.let { "Client" to it },
                                machineTitle(machine).ifBlank { null }?.let { "Machine" to it },
                                job.text("date_received").ifBlank { null }?.let { "Date received" to it },
                                job.text("fault_description").ifBlank { null }?.let { "Fault description" to it },
                                job.text("technician_name").ifBlank { null }?.let { "Technician" to it }
                            ).forEach { (label, value) ->
                                Column {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                    if (user.hasPermission("job_cards.edit")) {
                        CapSecondaryButton(
                            text = "Edit",
                            onClick = { editDialog = true },
                            modifier = Modifier.padding(top = Spacing.sm)
                        )
                    }
                }
            }
        }
    }
    if (editDialog) JobDialog(clients, machines, job, { editDialog = false }) { fields -> save("job_cards", job.id, fields, "Job card"); editDialog = false }
}

@Composable
private fun CalendarScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val machines = data.collection("machines")
    val machinesById = machines.associateBy { it.id }
    val clientsById = data.collection("clients").associateBy { it.id }
    var query by remember { mutableStateOf("") }
    var selectedService by remember { mutableStateOf<CapRecord?>(null) }
    var editing by remember { mutableStateOf<CapRecord?>(null) }

    val activeService = selectedService
    if (activeService != null) {
        val machine = machinesById[activeService.text("machine_id")]
        val client = clientsById[machine?.text("client_id")]
        ServiceRecordDetailScreen(
            service = activeService,
            machine = machine,
            client = client,
            user = user,
            save = save,
            onBack = { selectedService = null },
            onEdit = { editing = activeService }
        )
        if (editing != null) {
            val service = editing!!
            ServiceDialog(machines, service, { editing = null }) { fields ->
                save("service_records", service.id, fields, "Service record")
                editing = null
            }
        }
        return
    }

    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    val soonThreshold = remember {
        val cal = java.util.Calendar.getInstance()
        cal.add(java.util.Calendar.DAY_OF_YEAR, 7)
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
    }

    val due = data.collection("service_records")
        .filter { it.text("next_service_due").isNotBlank() }
        .filter { service ->
            query.isBlank() ||
                machineTitle(machinesById[service.text("machine_id")]).contains(query, ignoreCase = true) ||
                clientsById[machinesById[service.text("machine_id")]?.text("client_id")]?.text("company_name").orEmpty().contains(query, ignoreCase = true)
        }
        .sortedBy { it.text("next_service_due") }
    val grouped = due.groupBy { it.text("next_service_due") }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
        item {
            CapSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search machine or client",
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
            )
        }
        if (due.isEmpty()) {
            item {
                CapEmptyState(
                    "No upcoming service dates.",
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        } else {
            grouped.forEach { (dueDate, servicesForDate) ->
                item(key = "header-$dueDate") { CapSectionHeader(title = "Due $dueDate") }
                items(servicesForDate, key = { it.id }) { service ->
                    val machine = machinesById[service.text("machine_id")]
                    val client = clientsById[machine?.text("client_id")]
                    val (badgeLabel, badgeTone) = when {
                        dueDate < today -> "Overdue" to StatusTone.Error
                        dueDate <= soonThreshold -> "Due soon" to StatusTone.Warning
                        else -> "Upcoming" to StatusTone.Info
                    }
                    CapCard {
                        CapListItem(
                            title = machineTitle(machine),
                            subtitle = listOfNotNull(
                                client?.text("company_name")?.ifBlank { null },
                                service.text("technician_name").ifBlank { null }
                            ).joinToString(" · "),
                            trailing = { CapStatusBadge(badgeLabel, badgeTone) },
                            showNavArrow = true,
                            onClick = { selectedService = service }
                        )
                    }
                }
            }
        }
    }
}

/** VAT rate mirrors the web app's InvoiceQueue.jsx (South Africa, 15%). */
private const val VAT_RATE = 0.15

private val randFormat = DecimalFormat("#,##0.00", DecimalFormatSymbols(Locale.US))

/** South African Rand formatting, e.g. "R 1,250.00" per the design spec. */
private fun formatRand(amount: Double): String = "R ${randFormat.format(amount)}"

private fun CapRecord.number(key: String): Double? = (fields[key] as? Number)?.toDouble()

@Composable
private fun InvoiceScreen(data: RecordsState) {
    val jobs = data.collection("job_cards").filter {
        it.text("status").contains("invoice", true) || it.text("status") == "Completed" || it.text("status") == "Collected"
    }
    val lines = data.collection("job_card_lines")
    val machines = data.collection("machines")
    val clients = data.collection("clients")
    val machinesById = machines.associateBy { it.id }
    val clientsById = clients.associateBy { it.id }

    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item { CapScreenHeader(title = "Invoice Queue", subtitle = "Completed jobs ready for billing") }
        if (jobs.isEmpty()) {
            item { CapEmptyState("No jobs are ready for invoicing.", modifier = Modifier.fillMaxWidth().wrapContentHeight()) }
        }
        items(jobs, key = { it.id }) { job ->
            val machine = machinesById[job.text("machine_id")]
            val client = clientsById[machine?.text("client_id")]
            val jobLines = relatedRecords(lines, "job_card_id", job.id)
            val subtotal = jobLines.sumOf { (it.number("quantity") ?: 1.0) * (it.number("unit_price") ?: 0.0) }

            CapCard {
                CapListItem(
                    title = job.text("job_number").ifBlank { "Job card" },
                    subtitle = listOfNotNull(
                        client?.text("company_name")?.ifBlank { null },
                        machineTitle(machine).ifBlank { null }
                    ).joinToString(" · "),
                    trailing = {
                        Column(horizontalAlignment = Alignment.End) {
                            if (jobLines.isNotEmpty()) {
                                Text(
                                    formatRand(subtotal * (1 + VAT_RATE)),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                            CapStatusBadge(job.text("status").ifBlank { "Unknown" }, jobStatusTone(job.text("status")))
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun stringList(value: Any?): List<String> = (value as? List<*>)?.filterIsInstance<String>() ?: emptyList()

private fun stringMap(value: Any?): List<Pair<String, String>> =
    (value as? Map<*, *>)?.entries?.mapNotNull { (key, mapValue) ->
        if (key is String) key to (mapValue?.toString().orEmpty()) else null
    } ?: emptyList()

@Composable
private fun KnowledgeBaseScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val machines = data.collection("knowledge_machines")
    val notes = data.collection("knowledge_notes")
    val media = data.collection("knowledge_media")
    val documents = data.collection("knowledge_documents")
    val serviceCodes = data.collection("knowledge_service_codes")
    var selectedMachine by remember { mutableStateOf<CapRecord?>(null) }
    var query by remember { mutableStateOf("") }

    val activeMachine = selectedMachine
    if (activeMachine != null) {
        KnowledgeBaseDetailScreen(
            machine = activeMachine,
            notes = relatedRecords(notes, "knowledge_machine_id", activeMachine.id),
            media = relatedRecords(media, "knowledge_machine_id", activeMachine.id),
            documents = relatedRecords(documents, "knowledge_machine_id", activeMachine.id),
            serviceCodes = relatedRecords(serviceCodes, "knowledge_machine_id", activeMachine.id),
            user = user,
            save = save,
            onBack = { selectedMachine = null }
        )
        return
    }

    val filteredMachines = machines.filter { machine ->
        query.isBlank() ||
            machine.text("manufacturer").contains(query, ignoreCase = true) ||
            machine.text("model_name").contains(query, ignoreCase = true) ||
            machine.text("variant").contains(query, ignoreCase = true) ||
            stringList(machine.fields["supported_refrigerants"]).any { it.contains(query, ignoreCase = true) }
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
        item {
            CapSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search knowledge base",
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
            )
        }
        if (filteredMachines.isEmpty()) {
            item {
                CapEmptyState(
                    if (machines.isEmpty()) "No knowledge-base machines yet." else "No machines match your search.",
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        }
        items(filteredMachines, key = { it.id }) { machine ->
            CapCard {
                CapListItem(
                    title = listOfNotNull(
                        machine.text("model_name").ifBlank { null },
                        machine.text("variant").ifBlank { null }
                    ).joinToString(" ").ifBlank { "Unnamed machine" },
                    subtitle = machine.text("product_code"),
                    leading = {
                        Text(
                            machine.text("manufacturer").ifBlank { "?" },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    showNavArrow = true,
                    onClick = { selectedMachine = machine }
                )
            }
        }
    }
}

@Composable
private fun KnowledgeBaseDetailScreen(
    machine: CapRecord,
    notes: List<CapRecord>,
    media: List<CapRecord>,
    documents: List<CapRecord>,
    serviceCodes: List<CapRecord>,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onBack: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val canManage = user.role != "accountant"
    var noteTitle by remember(machine.id) { mutableStateOf("") }
    var noteContent by remember(machine.id) { mutableStateOf("") }
    var revealedCodes by remember(machine.id) { mutableStateOf(setOf<String>()) }

    val refrigerants = stringList(machine.fields["supported_refrigerants"])
    val specifications = stringMap(machine.fields["technical_specifications"])
    val functions = stringList(machine.fields["main_functions"])

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                    Text("Back to knowledge base", style = MaterialTheme.typography.labelLarge)
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    machine.text("manufacturer").ifBlank { null }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(
                        listOfNotNull(
                            machine.text("model_name").ifBlank { null },
                            machine.text("variant").ifBlank { null }
                        ).joinToString(" ").ifBlank { "Unnamed machine" },
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                machine.text("product_code").ifBlank { null }?.let { "Product code" to it },
                                machine.text("category").ifBlank { null }?.let { "Category" to it },
                                machine.text("summary").ifBlank { null }?.let { "Summary" to it }
                            ).forEach { (label, value) ->
                                Column {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
            if (refrigerants.isNotEmpty()) {
                item {
                    CapSectionCard(title = "Supported Refrigerants") {
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            refrigerants.forEach { refrigerant -> CapStatusBadge(refrigerant, StatusTone.Info) }
                        }
                    }
                }
            }
            if (specifications.isNotEmpty()) {
                item {
                    CapSectionCard(title = "Technical Specifications") {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            specifications.forEach { (key, value) ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(key, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(value, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
            if (functions.isNotEmpty()) {
                item {
                    CapSectionCard(title = "Main Functions") {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            functions.forEach { function -> Text("• $function", style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                }
            }
            item {
                CapSectionCard(title = "Notes (${notes.size})") {
                    if (notes.isEmpty()) {
                        CapEmptyState("No notes yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            notes.forEach { note ->
                                CapListItem(
                                    title = note.text("title").ifBlank { "Note" },
                                    subtitle = note.text("content")
                                )
                            }
                        }
                    }
                    if (canManage) {
                        Column(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            CapTextField(label = "Title", value = noteTitle, onValueChange = { noteTitle = it })
                            CapTextField(label = "Content", value = noteContent, onValueChange = { noteContent = it }, singleLine = false)
                            CapSecondaryButton(
                                text = "Add Note",
                                enabled = noteTitle.isNotBlank() && noteContent.isNotBlank(),
                                onClick = {
                                    save(
                                        "knowledge_notes",
                                        null,
                                        mapOf(
                                            "knowledge_machine_id" to machine.id,
                                            "title" to noteTitle.trim(),
                                            "content" to noteContent.trim(),
                                            "note_type" to "troubleshooting"
                                        ),
                                        "Note"
                                    )
                                    noteTitle = ""
                                    noteContent = ""
                                }
                            )
                        }
                    }
                }
            }
            item {
                CapSectionCard(title = "Photos (${media.size})") {
                    if (media.isEmpty()) {
                        CapEmptyState("No photos yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            media.forEach { photo ->
                                val fileUrl = photo.text("file_url")
                                CapListItem(
                                    title = photo.text("caption").ifBlank { photo.text("original_filename").ifBlank { "Photo" } },
                                    subtitle = photo.text("original_filename"),
                                    showNavArrow = fileUrl.isNotBlank(),
                                    onClick = if (fileUrl.isNotBlank()) ({ uriHandler.openUri(fileUrl) }) else null
                                )
                            }
                        }
                    }
                }
            }
            if (canManage) {
                item {
                    CapSectionCard(title = "Service Codes (${serviceCodes.size})") {
                        if (serviceCodes.isEmpty()) {
                            CapEmptyState("No service codes yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                        } else {
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                serviceCodes.forEach { code ->
                                    val revealed = code.id in revealedCodes
                                    CapListItem(
                                        title = code.text("function_name").ifBlank { "Function" },
                                        subtitle = if (revealed) code.text("service_code") else "••••••••",
                                        trailing = {
                                            TextButton(onClick = {
                                                revealedCodes = if (revealed) revealedCodes - code.id else revealedCodes + code.id
                                            }) { Text(if (revealed) "Hide" else "Reveal") }
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
            item {
                CapSectionCard(title = "Documents (${documents.size})") {
                    if (documents.isEmpty()) {
                        CapEmptyState("No documents yet.", modifier = Modifier.fillMaxWidth().wrapContentHeight())
                    } else {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            documents.forEach { doc ->
                                val fileUrl = doc.text("file_url")
                                CapListItem(
                                    title = doc.text("title").ifBlank { doc.text("original_filename").ifBlank { "Document" } },
                                    subtitle = doc.text("original_filename"),
                                    showNavArrow = fileUrl.isNotBlank(),
                                    onClick = if (fileUrl.isNotBlank()) ({ uriHandler.openUri(fileUrl) }) else null
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SimpleRecordsScreen(collection: String, data: RecordsState, titleKey: String, subtitleKey: String, empty: String) {
    val records = data.collection(collection)
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (records.isEmpty()) item { EmptyCard(empty) }
        items(records, key = { it.id }) { RecordCard(it.text(titleKey).ifBlank { it.id }, listOf(it.text(subtitleKey)), Modifier) }
    }
}

@Composable
private fun RecordCard(title: String, details: List<String?>, modifier: Modifier) {
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title.ifBlank { "Untitled" }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            details.filterNotNull().filter { it.isNotBlank() }.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
private fun EmptyCard(message: String) = Card(Modifier.fillMaxWidth()) { Text(message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }

private fun machineTitle(machine: CapRecord?): String = machine?.let { "${it.text("brand")} ${it.text("model")}".trim().ifBlank { "Unnamed machine" } } ?: "Unknown machine"

@Composable
private fun ClientDialog(onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    var company by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    EditDialog("Add client", onDismiss, company.isNotBlank(), { onSave(mapOf("company_name" to company.trim(), "contact_person" to contact.trim(), "phone" to phone.trim(), "email" to email.trim())) }) {
        TextInput("Company name", company, { company = it }, true)
        TextInput("Contact person", contact, { contact = it })
        TextInput("Phone", phone, { phone = it }, keyboardType = KeyboardType.Phone)
        TextInput("Email", email, { email = it }, keyboardType = KeyboardType.Email)
    }
}

@Composable
private fun MachineDialog(clients: List<CapRecord>, initial: CapRecord?, initialClientId: String, onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    var clientId by remember(initial) { mutableStateOf(initial?.text("client_id")?.ifBlank { initialClientId } ?: initialClientId) }
    var brand by remember(initial) { mutableStateOf(initial?.text("brand").orEmpty()) }
    var model by remember(initial) { mutableStateOf(initial?.text("model").orEmpty()) }
    var serial by remember(initial) { mutableStateOf(initial?.text("serial_number").orEmpty()) }
    var type by remember(initial) { mutableStateOf(initial?.text("machine_type").orEmpty()) }
    var refrigerant by remember(initial) { mutableStateOf(initial?.text("refrigerant_type").orEmpty()) }
    EditDialog(if (initial == null) "Add machine" else "Edit machine", onDismiss, clientId.isNotBlank() && brand.isNotBlank() && model.isNotBlank(), {
        onSave(mapOf("client_id" to clientId, "brand" to brand.trim(), "model" to model.trim(), "serial_number" to serial.trim(), "machine_type" to type.trim(), "refrigerant_type" to refrigerant.trim()))
    }) {
        SelectInput("Client", clients.map { it.id to it.text("company_name") }, clientId) { clientId = it }
        TextInput("Brand", brand, { brand = it }, true)
        TextInput("Model", model, { model = it }, true)
        TextInput("Serial number", serial, { serial = it })
        TextInput("Machine type", type, { type = it })
        TextInput("Refrigerant", refrigerant, { refrigerant = it })
    }
}

@Composable
private fun ServiceDialog(machines: List<CapRecord>, initial: CapRecord?, onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var machineId by remember(initial) { mutableStateOf(initial?.text("machine_id") ?: machines.firstOrNull()?.id.orEmpty()) }
    var date by remember(initial) { mutableStateOf(initial?.text("service_date")?.ifBlank { today } ?: today) }
    var technician by remember(initial) { mutableStateOf(initial?.text("technician_name").orEmpty()) }
    var work by remember(initial) { mutableStateOf(initial?.text("work_performed").orEmpty()) }
    var nextDue by remember(initial) { mutableStateOf(initial?.text("next_service_due").orEmpty()) }
    EditDialog(if (initial == null) "Add service" else "Edit service", onDismiss, machineId.isNotBlank() && date.isNotBlank(), {
        onSave(mapOf("machine_id" to machineId, "service_date" to date, "technician_name" to technician.trim(), "work_performed" to work.trim(), "next_service_due" to nextDue.trim()))
    }) {
        SelectInput("Machine", machines.map { it.id to machineTitle(it) }, machineId) { machineId = it }
        TextInput("Service date (YYYY-MM-DD)", date, { date = it }, true)
        TextInput("Technician", technician, { technician = it })
        TextInput("Work performed", work, { work = it })
        TextInput("Next service due", nextDue, { nextDue = it })
    }
}

@Composable
private fun JobDialog(clients: List<CapRecord>, machines: List<CapRecord>, initial: CapRecord?, onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember(initial) { mutableStateOf(initial?.text("client_id") ?: clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(initial, clientId) { mutableStateOf(initial?.text("machine_id") ?: availableMachines.firstOrNull()?.id.orEmpty()) }
    var number by remember(initial) { mutableStateOf(initial?.text("job_number")?.ifBlank { "JOB-${System.currentTimeMillis().toString().takeLast(6)}" } ?: "JOB-${System.currentTimeMillis().toString().takeLast(6)}") }
    var fault by remember(initial) { mutableStateOf(initial?.text("fault_description").orEmpty()) }
    var technician by remember(initial) { mutableStateOf(initial?.text("technician_name").orEmpty()) }
    var status by remember(initial) { mutableStateOf(initial?.text("status")?.ifBlank { "Booked In" } ?: "Booked In") }
    EditDialog(if (initial == null) "Add job card" else "Edit job card", onDismiss, clientId.isNotBlank() && machineId.isNotBlank() && number.isNotBlank(), {
        onSave(mapOf("client_id" to clientId, "machine_id" to machineId, "job_number" to number.trim(), "status" to status, "date_received" to (initial?.text("date_received")?.ifBlank { today } ?: today), "fault_description" to fault.trim(), "technician_name" to technician.trim()))
    }) {
        SelectInput("Client", clients.map { it.id to it.text("company_name") }, clientId) { selected -> clientId = selected; machineId = machines.firstOrNull { sameRecordId(it.fields["client_id"], selected) }?.id.orEmpty() }
        SelectInput("Machine", machines.filter { sameRecordId(it.fields["client_id"], clientId) }.map { it.id to machineTitle(it) }, machineId) { machineId = it }
        TextInput("Job number", number, { number = it }, true)
        TextInput("Fault description", fault, { fault = it })
        TextInput("Technician", technician, { technician = it })
        SelectInput("Status", listOf("Booked In", "Open", "In Progress", "Completed", "Ready to Invoice").map { it to it }, status) { status = it }
    }
}

@Composable
private fun EditDialog(title: String, onDismiss: () -> Unit, valid: Boolean, onSave: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 500.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp), content = content) },
        confirmButton = { Button(onSave, enabled = valid) { Text("Save") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun TextInput(label: String, value: String, onValueChange: (String) -> Unit, required: Boolean = false, keyboardType: KeyboardType = KeyboardType.Text) {
    OutlinedTextField(value, onValueChange, Modifier.fillMaxWidth(), label = { Text(label + if (required) " *" else "") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = keyboardType))
}

@Composable
private fun SelectInput(label: String, options: List<Pair<String, String>>, selected: String, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton({ expanded = true }, Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selected }?.second?.ifBlank { label } ?: "Select $label", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Outlined.ArrowDropDown, null)
        }
        DropdownMenu(expanded, { expanded = false }) {
            options.forEach { option -> DropdownMenuItem(text = { Text(option.second.ifBlank { option.first }) }, onClick = { onSelected(option.first); expanded = false }) }
        }
    }
}

private fun connectionTone(connection: ConnectionStatus): StatusTone = when (connection) {
    ConnectionStatus.Connected -> StatusTone.Success
    ConnectionStatus.Checking -> StatusTone.Info
    ConnectionStatus.Offline -> StatusTone.Error
    ConnectionStatus.AuthRequired -> StatusTone.Warning
    ConnectionStatus.ServerError -> StatusTone.Error
    ConnectionStatus.DbUnavailable -> StatusTone.Error
    ConnectionStatus.SyncError -> StatusTone.Warning
}

@Composable
fun StatusScreen(vm: MainViewModel) {
    val status by vm.status.collectAsState()
    val fmt = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }
    val uriHandler = LocalUriHandler.current
    val user = vm.state.user
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        item {
            CapCard {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text("Connection Details", fontWeight = FontWeight.Bold)
                    StatusRowBadge("Internet / Live Service", status.connection.name, connectionTone(status.connection))
                    StatusRowBadge("Authentication", if (status.apiHealthy) "Connected" else "Not connected", if (status.apiHealthy) StatusTone.Success else StatusTone.Error)
                    StatusRowBadge("Firebase / Database Access", if (status.dbHealthy) "Connected" else "Not connected", if (status.dbHealthy) StatusTone.Success else StatusTone.Error)
                    StatusRow("Data Read", vm.recordsState.records.values.sumOf { it.size }.toString())
                    StatusRow("Latency", "${status.latency} ms")
                    StatusRow("Firebase Project", "capdatabasefb2")
                    StatusRow("Firestore Database", "capdashboard")
                    StatusRow("Environment", "Production")
                    StatusRow("Last Sync", if (status.lastSync > 0) fmt.format(Date(status.lastSync)) else "Never")
                    StatusRow("Pending Operations", status.pendingOperations.toString())
                    StatusRow("Failed Operations", status.failedOperations.toString())
                    status.lastError?.let { Text("Last Error: $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Button(vm::checkHealth, Modifier.weight(1f)) { Text("Test") }
                        Button(vm::sync, Modifier.weight(1f)) { Text("Sync") }
                    }
                    OutlinedButton({ uriHandler.openUri(BuildConfig.WEB_APP_URL) }, Modifier.fillMaxWidth()) { Text("Open Cloudflare Dashboard") }
                }
            }
        }
        item {
            CapCard {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text("Account", fontWeight = FontWeight.Bold)
                    StatusRow("Current Account", user?.email?.ifBlank { "Unknown" } ?: "Unknown")
                    StatusRow("User Role", user?.role?.ifBlank { "Unknown" } ?: "Unknown")
                    StatusRow("App Version", BuildConfig.VERSION_NAME)
                    StatusRow("Build Version", BuildConfig.VERSION_CODE.toString())
                }
            }
        }
        item {
            CapCard {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text("Connection Test", fontWeight = FontWeight.Bold)
                    Text(
                        "Runs a one-off, read-only check against Firestore, separate from the background status above.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedButton(vm::testConnection, Modifier.fillMaxWidth(), enabled = !vm.testingConnection) {
                        if (vm.testingConnection) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("Testing…")
                        } else {
                            Text("Test Connection")
                        }
                    }
                    vm.connectionTestResult?.let { result ->
                        val color = if (result.success) Color(0xFF67B58B) else MaterialTheme.colorScheme.error
                        val text = if (result.success) {
                            "Connected" + (result.latencyMs?.let { " — $it ms" } ?: "")
                        } else {
                            result.message
                        }
                        Text(text, color = color, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
        items(status.syncResults) { result ->
            CapCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(result.resource)
                    Text(if (result.error == null) "${result.count ?: 0} records" else "Error", color = if (result.error == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
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

@Composable
fun StatusRowBadge(label: String, value: String, tone: StatusTone) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        CapStatusBadge(value, tone)
    }
}
