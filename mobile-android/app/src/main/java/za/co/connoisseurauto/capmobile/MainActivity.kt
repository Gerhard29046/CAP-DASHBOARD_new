package com.CAPDATABASE.capdatabase

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
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

    val status = statusRepo.status
    private var recordsJob: Job? = null

    init {
        viewModelScope.launch {
            val restoredUser = auth.restore()
            state = AuthState(false, restoredUser)
            if (restoredUser != null) start(restoredUser)
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
            Triple("knowledge_machines", "knowledge_base.view", true),
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
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CapTheme { CapApp() } }
    }
}

private val Dark = darkColorScheme(
    primary = Color(0xFF67B58B),
    background = Color(0xFF0E1512),
    surface = Color(0xFF17201C)
)

@Composable
fun CapTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = Dark, content = content)

@Composable
fun CapApp(vm: MainViewModel = hiltViewModel()) {
    when {
        vm.state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        vm.state.user == null -> LoginScreen(vm.state.error, vm::login)
        else -> AdaptiveShell(vm)
    }
}

@Composable
fun LoginScreen(error: String?, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf(BuildConfig.DEFAULT_LOGIN_EMAIL) }
    var password by remember { mutableStateOf("") }
    LazyColumn(
        Modifier.fillMaxSize().imePadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        item {
            Card(Modifier.fillMaxWidth().widthIn(max = 460.dp)) {
                Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Icon(Icons.Outlined.Engineering, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("CAP Mobile", style = MaterialTheme.typography.headlineMedium)
                    Text("Connoisseur Automotive Products")
                    OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email Address") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                    OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, visualTransformation = PasswordVisualTransformation())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Button({ login(email.trim(), password) }, Modifier.fillMaxWidth(), enabled = email.isNotBlank() && password.isNotBlank()) { Text("Sign In") }
                    Text("Version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

data class Destination(val label: String, val permission: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

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
        ConnectionStatus.Checking, ConnectionStatus.SyncError -> Color(0xFFFFA500)
        ConnectionStatus.AuthRequired -> Color.Yellow
        else -> Color.Red
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(status.name, style = MaterialTheme.typography.labelSmall)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdaptiveShell(vm: MainViewModel) {
    val user = vm.state.user ?: return
    val status by vm.status.collectAsState()
    val visible = remember(user) { destinations.filter { it.label == "Status" || user.hasPermission(it.permission) } }
    var selected by remember { mutableStateOf(visible.firstOrNull()?.label ?: "Status") }
    var menuOpen by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(vm.actionMessage) {
        vm.actionMessage?.let { snackbar.showSnackbar(it); vm.clearMessage() }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val medium = maxWidth >= 600.dp
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                TopAppBar(
                    title = { Text(selected) },
                    actions = {
                        ServerStatusIndicator(status.connection)
                        Box {
                            IconButton({ menuOpen = true }) { Icon(Icons.Outlined.MoreVert, "Open navigation") }
                            DropdownMenu(menuOpen, { menuOpen = false }) {
                                visible.forEach { destination ->
                                    DropdownMenuItem(
                                        text = { Text(destination.label) },
                                        leadingIcon = { Icon(destination.icon, null) },
                                        onClick = { selected = destination.label; menuOpen = false }
                                    )
                                }
                                HorizontalDivider()
                                DropdownMenuItem(text = { Text("Logout") }, leadingIcon = { Icon(Icons.Outlined.Logout, null) }, onClick = vm::logout)
                            }
                        }
                    }
                )
            },
            bottomBar = {
                if (!medium) NavigationBar {
                    visible.take(4).forEach { destination ->
                        NavigationBarItem(
                            selected == destination.label,
                            { selected = destination.label },
                            icon = { Icon(destination.icon, destination.label) },
                            label = { Text(destination.label) }
                        )
                    }
                }
            }
        ) { padding ->
            Row(Modifier.fillMaxSize().padding(padding)) {
                if (medium) NavigationRail {
                    visible.forEach { destination ->
                        NavigationRailItem(selected == destination.label, { selected = destination.label }, icon = { Icon(destination.icon, destination.label) }, label = { Text(destination.label) })
                    }
                }
                Box(Modifier.weight(1f).fillMaxHeight().padding(horizontal = 16.dp, vertical = 12.dp)) {
                    ScreenContent(selected, vm, user)
                }
            }
        }
    }
}

@Composable
private fun ScreenContent(selected: String, vm: MainViewModel, user: CapUser) {
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
        "Dashboard" -> DashboardScreen(data)
        "Clients" -> ClientsScreen(data, user, vm::save)
        "Machines" -> MachinesScreen(data, user, vm::save)
        "Services" -> ServicesScreen(data, user, vm::save)
        "Jobs" -> JobsScreen(data, user, vm::save)
        "Calendar" -> CalendarScreen(data)
        "Knowledge Base" -> SimpleRecordsScreen("knowledge_machines", data, "manufacturer", "model_name", "No knowledge-base machines yet.")
        "Invoices" -> InvoiceScreen(data)
        "Users" -> SimpleRecordsScreen("users", data, "name", "email", "No users found.")
        "Status" -> StatusScreen(vm)
    }
}

@Composable
private fun DashboardScreen(data: RecordsState) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    val jobs = data.collection("job_cards")
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Live Firebase overview", style = MaterialTheme.typography.titleMedium) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CountCard("Clients", clients.size, Modifier.weight(1f))
                CountCard("Machines", machines.size, Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CountCard("Services", services.size, Modifier.weight(1f))
                CountCard("Jobs", jobs.size, Modifier.weight(1f))
            }
        }
        item { Text("Recent clients", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
        if (clients.isEmpty()) item { EmptyCard("No clients yet.") }
        items(clients.takeLast(5).reversed(), key = { it.id }) { ClientSummary(it, relatedRecords(machines, "client_id", it.id)) }
    }
}

@Composable
private fun CountCard(label: String, count: Int, modifier: Modifier = Modifier) {
    Card(modifier) { Column(Modifier.padding(16.dp)) { Text(count.toString(), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary); Text(label) } }
}

@Composable
private fun ClientsScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    var clientDialog by remember { mutableStateOf(false) }
    var machineClient by remember { mutableStateOf<CapRecord?>(null) }
    var editMachine by remember { mutableStateOf<CapRecord?>(null) }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 84.dp)) {
            if (clients.isEmpty()) item { EmptyCard("No clients yet. Add the first client.") }
            items(clients, key = { it.id }) { client ->
                val clientMachines = relatedRecords(machines, "client_id", client.id)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ClientSummary(client, clientMachines)
                        clientMachines.forEach { machine ->
                            Surface(
                                Modifier.fillMaxWidth().clickable { if (user.hasPermission("machines.edit")) editMachine = machine },
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = MaterialTheme.shapes.medium
                            ) {
                                Column(Modifier.padding(10.dp)) {
                                    Text(machineTitle(machine), fontWeight = FontWeight.Medium)
                                    Text(machine.text("serial_number").ifBlank { "No serial number" }, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        if (user.hasPermission("machines.create")) TextButton({ machineClient = client }) { Icon(Icons.Outlined.Add, null); Text("Add machine") }
                    }
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
private fun MachinesScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    var editing by remember { mutableStateOf<CapRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    val clientNames = clients.associate { it.id to it.text("company_name") }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 84.dp)) {
            if (machines.isEmpty()) item { EmptyCard("No machines yet.") }
            items(machines, key = { it.id }) { machine ->
                RecordCard(machineTitle(machine), listOf(clientNames[machine.text("client_id")].orEmpty(), machine.text("serial_number")), if (user.hasPermission("machines.edit")) Modifier.clickable { editing = machine } else Modifier)
            }
        }
        if (user.hasPermission("machines.create") && clients.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add machine") }
    }
    if (creating) MachineDialog(clients, null, clients.firstOrNull()?.id.orEmpty(), { creating = false }) { save("machines", null, it, "Machine"); creating = false }
    editing?.let { machine -> MachineDialog(clients, machine, machine.text("client_id"), { editing = null }) { save("machines", machine.id, it, "Machine"); editing = null } }
}

@Composable
private fun ServicesScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    var editing by remember { mutableStateOf<CapRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    val machineNames = machines.associate { it.id to machineTitle(it) }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 84.dp)) {
            if (services.isEmpty()) item { EmptyCard("No service records yet.") }
            items(services.sortedByDescending { it.text("service_date") }, key = { it.id }) { service ->
                RecordCard(machineNames[service.text("machine_id")].orEmpty().ifBlank { "Unknown machine" }, listOf(service.text("service_date"), service.text("work_performed")), if (user.hasPermission("services.edit")) Modifier.clickable { editing = service } else Modifier)
            }
        }
        if (user.hasPermission("services.create") && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add service") }
    }
    if (creating) ServiceDialog(machines, null, { creating = false }) { save("service_records", null, it, "Service record"); creating = false }
    editing?.let { service -> ServiceDialog(machines, service, { editing = null }) { save("service_records", service.id, it, "Service record"); editing = null } }
}

@Composable
private fun JobsScreen(data: RecordsState, user: CapUser, save: (String, String?, Map<String, Any?>, String) -> Unit) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val jobs = data.collection("job_cards")
    var editing by remember { mutableStateOf<CapRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    val clientNames = clients.associate { it.id to it.text("company_name") }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 84.dp)) {
            if (jobs.isEmpty()) item { EmptyCard("No job cards yet.") }
            items(jobs.sortedByDescending { it.text("date_received") }, key = { it.id }) { job ->
                RecordCard(job.text("job_number").ifBlank { "Job card" }, listOf(clientNames[job.text("client_id")].orEmpty(), job.text("status"), job.text("fault_description")), if (user.hasPermission("job_cards.edit")) Modifier.clickable { editing = job } else Modifier)
            }
        }
        if (user.hasPermission("job_cards.create") && clients.isNotEmpty() && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { Icon(Icons.Outlined.Add, "Add job") }
    }
    if (creating) JobDialog(clients, machines, null, { creating = false }) { save("job_cards", null, it, "Job card"); creating = false }
    editing?.let { job -> JobDialog(clients, machines, job, { editing = null }) { save("job_cards", job.id, it, "Job card"); editing = null } }
}

@Composable
private fun CalendarScreen(data: RecordsState) {
    val machines = data.collection("machines").associateBy { it.id }
    val due = data.collection("service_records").filter { it.text("next_service_due").isNotBlank() }.sortedBy { it.text("next_service_due") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (due.isEmpty()) item { EmptyCard("No upcoming service dates.") }
        items(due, key = { it.id }) { service -> RecordCard(service.text("next_service_due"), listOf(machineTitle(machines[service.text("machine_id")])), Modifier) }
    }
}

@Composable
private fun InvoiceScreen(data: RecordsState) {
    val jobs = data.collection("job_cards").filter { it.text("status").contains("invoice", true) || it.text("status") == "Completed" }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (jobs.isEmpty()) item { EmptyCard("No jobs are ready for invoicing.") }
        items(jobs, key = { it.id }) { RecordCard(it.text("job_number"), listOf(it.text("status"), it.text("fault_description")), Modifier) }
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

@Composable
fun StatusScreen(vm: MainViewModel) {
    val status by vm.status.collectAsState()
    val fmt = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }
    val uriHandler = LocalUriHandler.current
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Connection Details", fontWeight = FontWeight.Bold)
                    StatusRow("Status", status.connection.name)
                    StatusRow("Firebase Auth", if (status.apiHealthy) "Connected" else "Not connected")
                    StatusRow("Cloud Firestore", if (status.dbHealthy) "Connected" else "Not connected")
                    StatusRow("Live records", vm.recordsState.records.values.sumOf { it.size }.toString())
                    StatusRow("Latency", "${status.latency} ms")
                    StatusRow("Firebase Project", "capdatabasefb2")
                    StatusRow("Firestore Database", "capdashboard")
                    StatusRow("Last Sync", if (status.lastSync > 0) fmt.format(Date(status.lastSync)) else "Never")
                    status.lastError?.let { Text("Last Error: $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(vm::checkHealth, Modifier.weight(1f)) { Text("Test") }
                        Button(vm::sync, Modifier.weight(1f)) { Text("Sync") }
                    }
                    OutlinedButton({ uriHandler.openUri(BuildConfig.WEB_APP_URL) }, Modifier.fillMaxWidth()) { Text("Open Cloudflare Dashboard") }
                }
            }
        }
        items(status.syncResults) { result ->
            Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(result.resource); Text(if (result.error == null) "${result.count ?: 0} records" else "Error", color = if (result.error == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) } }
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
