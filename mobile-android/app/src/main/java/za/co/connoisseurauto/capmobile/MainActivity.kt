package com.CAPDATABASE.capdatabase

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import com.CAPDATABASE.capdatabase.ui.components.CapBackRow
import com.CAPDATABASE.capdatabase.ui.components.CapCard
import com.CAPDATABASE.capdatabase.ui.components.CapConfirmDialog
import com.CAPDATABASE.capdatabase.ui.components.CapDateField
import com.CAPDATABASE.capdatabase.ui.components.CapDestructiveButton
import com.CAPDATABASE.capdatabase.ui.components.CapDetailField
import com.CAPDATABASE.capdatabase.ui.components.CapDropdownField
import com.CAPDATABASE.capdatabase.ui.components.CapEmptyState
import com.CAPDATABASE.capdatabase.ui.components.CapErrorState
import com.CAPDATABASE.capdatabase.ui.components.CapInlineError
import com.CAPDATABASE.capdatabase.ui.components.CapKeyValueRow
import com.CAPDATABASE.capdatabase.ui.components.CapListItem
import com.CAPDATABASE.capdatabase.ui.components.CapLoadingState
import com.CAPDATABASE.capdatabase.ui.components.CapOutlinedButton
import com.CAPDATABASE.capdatabase.ui.components.CapPasswordField
import com.CAPDATABASE.capdatabase.ui.components.CapPrimaryButton
import com.CAPDATABASE.capdatabase.ui.components.CapQuickActionCard
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
import com.CAPDATABASE.capdatabase.ui.components.capToneColor
import com.CAPDATABASE.capdatabase.ui.navigation.CapAppScaffold
import com.CAPDATABASE.capdatabase.ui.navigation.CapBottomNavigation
import com.CAPDATABASE.capdatabase.ui.navigation.CapNavDestination
import com.CAPDATABASE.capdatabase.ui.navigation.CapNavRoute
import com.CAPDATABASE.capdatabase.ui.navigation.CapTopAppBar
import com.CAPDATABASE.capdatabase.ui.theme.CapNoteBlue
import com.CAPDATABASE.capdatabase.ui.theme.CapNoteGreen
import com.CAPDATABASE.capdatabase.ui.theme.CapNotePink
import com.CAPDATABASE.capdatabase.ui.theme.CapNoteYellow
import com.CAPDATABASE.capdatabase.ui.theme.CapTheme
import com.CAPDATABASE.capdatabase.ui.theme.CapThemeMode
import com.CAPDATABASE.capdatabase.ui.theme.CapThemePreferences
import com.CAPDATABASE.capdatabase.ui.theme.LocalCapThemeController
import com.CAPDATABASE.capdatabase.ui.theme.Spacing
import com.CAPDATABASE.capdatabase.ui.theme.rememberCapThemeController
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
    private val recordsRepository: RecordsRepository,
    private val storageRepository: SupabaseStorageRepository,
    private val avatarRepository: SupabaseAvatarRepository
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
            Triple("users", "users.view", true),
            // The permission catalog and the role -> permission defaults behind the Users
            // screen's permission matrix. Read-only here, and RLS grants select on both to any
            // active profile (0002_rls_policies.sql), so gating them on the same "users.view"
            // key that already gates the Users list is both correct and the narrowest fit.
            Triple("permissions", "users.view", true),
            Triple("role_permissions", "users.view", true),
            // Global read for any signed-in user (RLS-enforced, see Core.kt's dashboard_notes
            // KDoc) -- the web client shows StickyNotes.jsx on the Dashboard for every user
            // unconditionally, with no permission check of its own. "dashboard.view" is the
            // closest real equivalent to "no gate" in this permission-keyed list: every real
            // account already has it, since it's what shows the Dashboard tab at all.
            Triple("dashboard_notes", "dashboard.view", true),
            // Cross-platform parity Phase 9 (Settings). The catalogue behind Settings > Products
            // & Services (migration 0018). RLS lets any active profile SELECT it, but only
            // `settings.access` may write, and Settings is the only screen that reads it here --
            // so gating the subscription on `settings.access` is the narrowest correct fit.
            Triple("products_services", "settings.access", true),
            // The job_card_settings singleton row (migration 0018 + 0021). Was deliberately left
            // unregistered by android-ui-bee (Phase 9) pending a data-layer fix -- fetchAll()
            // hardcoded `order=created_at.desc` for every table, and this table has no
            // `created_at` column, which would 400 on cold start and (via observeCollections()'s
            // combine()) take every other screen's data down with it. Fixed by supabase-android-bee
            // (SupabaseData.kt's TABLES_WITHOUT_CREATED_AT), independently confirmed by Queen Bee
            // by reading the applied diff before adding this line.
            Triple("job_card_settings", "settings.access", true)
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

    /**
     * Same contract as [delete], plus an [onSuccess] callback run only when the delete actually
     * succeeds -- for detail screens (Client/Job/Knowledge Base, cross-platform parity 2026-08-16:
     * "make sure i can delete clients... delete clients and jobs that is booked in, knowledge
     * base") that need to navigate back to the list afterward, matching the web app's own
     * delete-then-navigate behavior. A separate method rather than adding a parameter to [delete]:
     * [delete] is already used as a bare method reference (`vm::delete`) by DashboardScreen's
     * notes, which requires an exact `(String, String, String) -> Unit` shape a defaulted 4th
     * parameter cannot be reference-assigned to.
     */
    fun deleteThenRun(collection: String, id: String, label: String, onSuccess: () -> Unit) = viewModelScope.launch {
        actionMessage = null
        runCatching { recordsRepository.delete(collection, id) }
            .onSuccess { actionMessage = "$label deleted."; onSuccess() }
            .onFailure { actionMessage = it.message ?: "Unable to delete $label." }
    }

    /**
     * E2 Photo Upload (service_records.photos / job_cards.arrival_photos, record-scoped
     * permanent Storage paths per migration 0024). Creates a record immediately and returns its
     * id -- used by the Log New Service / Book In screens to establish a real service_records/
     * job_cards row before any photo can be uploaded (a photo's Storage path is scoped under
     * the record's own id). Unlike [save], this is a direct suspend call rather than
     * fire-and-forget, so the caller can use the returned id right away; the caller is
     * responsible for catching failures (matches [uploadRecordPhoto]/[createPhotoSignedUrl]/
     * [deleteRecordPhoto] below -- these are thin, propagating wrappers, not another
     * fire-and-forget layer).
     */
    suspend fun createRecordNow(collection: String, fields: Map<String, Any?>): String =
        recordsRepository.create(collection, fields)

    /** Sibling of [createRecordNow] for the incremental photos/arrival_photos array update
     *  after each upload -- a direct suspend call, deliberately NOT routed through [save], so
     *  it doesn't touch [actionMessage]/trigger a stray "saved" toast on every single photo
     *  add. The screen's own final submit still uses [save] for its existing success-message
     *  UX, now as an update (non-null id) instead of a create. */
    suspend fun updateRecordNow(collection: String, id: String, fields: Map<String, Any?>) =
        recordsRepository.update(collection, id, fields)

    /** Uploads a photo to a record-scoped Storage path and returns the PERMANENT path. The
     *  caller must persist this path into the record's photos/arrival_photos array via [save]
     *  (as an update) -- never persist the result of [createPhotoSignedUrl]. */
    suspend fun uploadRecordPhoto(namespace: String, recordId: String, bytes: ByteArray, contentType: String, fileName: String): String =
        storageRepository.uploadPhoto(namespace, recordId, bytes, contentType, fileName)

    /** Fresh signed URL for displaying an already-stored path -- never persist the result, it
     *  expires; the stored path does not. */
    suspend fun createPhotoSignedUrl(path: String): String = storageRepository.createSignedUrl(path)

    /** Best-effort Storage delete. Callers must remove the path from the record's array via
     *  [save] regardless of whether this succeeds. */
    suspend fun deleteRecordPhoto(path: String) = storageRepository.deletePhoto(path)

    /** Uploads (overwriting any previous avatar) and returns the permanent path. The caller
     *  persists this into `public.users.photo_path` via [save] (`"users"`, the signed-in user's
     *  own id) -- never persist the result of [createAvatarSignedUrl]. */
    suspend fun uploadAvatar(userId: String, bytes: ByteArray, contentType: String): String =
        avatarRepository.uploadAvatar(userId, bytes, contentType)

    /** Fresh signed URL for displaying an already-stored avatar path -- never persist the
     *  result, it expires; the stored path does not. */
    suspend fun createAvatarSignedUrl(path: String): String = avatarRepository.createAvatarSignedUrl(path)

    /** Best-effort Storage delete for "remove my photo". Callers must clear
     *  `public.users.photo_path` via [save] regardless of whether this succeeds. */
    suspend fun deleteAvatar(path: String) = avatarRepository.deleteAvatar(path)

    /**
     * Saves the signed-in user's own editable profile fields (`full_name`/`photo_path`) and
     * replaces [state]'s in-memory [CapUser] with the row the server actually returned -- so the
     * saved value is what's shown, not what was submitted, and it is visible immediately rather
     * than only after the next restore. Suspending and propagating like the upload wrappers
     * above, so the calling screen owns its own loading/error state instead of this going
     * through [actionMessage].
     */
    suspend fun updateProfile(userId: String, fields: Map<String, String?>): CapUser {
        val updated = auth.updateProfile(userId, fields)
        state = state.copy(user = updated)
        return updated
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
        // Read the saved Appearance choice BEFORE the first composition, so the first frame is
        // already drawn in the right colour scheme rather than flashing the previous default.
        val savedThemeMode = CapThemePreferences.load(this)
        setContent {
            CapTheme(rememberCapThemeController(savedThemeMode)) { CapApp() }
        }
    }
}

@Composable
fun CapApp(vm: MainViewModel = hiltViewModel()) {
    when {
        !vm.sessionRestored -> SessionRestoreScreen()
        vm.state.user == null -> LoginScreen(vm.state.error, vm.state.loading, vm::login)
        else -> AdaptiveShell(vm)
    }
}

/**
 * Cold-start state, shown while the stored session is restored. That restore can include a
 * token refresh, so it is not reliably instant — carrying the app mark means the first frame
 * identifies the product instead of showing an anonymous spinner on an empty screen.
 */
@Composable
private fun SessionRestoreScreen() {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .padding(Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CapIdentityMark()
        Text(
            "CAP Mobile",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.md)
        )
        CircularProgressIndicator(Modifier.padding(top = Spacing.lg))
    }
}

@Composable
fun LoginScreen(error: String?, loading: Boolean, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf(BuildConfig.DEFAULT_LOGIN_EMAIL) }
    var password by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val canSubmit = !loading && email.isNotBlank() && password.isNotBlank()
    // Clearing focus also dismisses the keyboard, so the button-press and the keyboard's own
    // "Done" action both leave the screen in the same state while the request is in flight.
    val submit: () -> Unit = {
        if (canSubmit) {
            focusManager.clearFocus()
            login(email.trim(), password)
        }
    }
    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .imePadding()
            .padding(Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        item {
            CapCard(
                Modifier.widthIn(max = 460.dp),
            ) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = Spacing.sm),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    LoginIdentity()
                    CapTextField(
                        label = "Email Address",
                        value = email,
                        onValueChange = { email = it },
                        enabled = !loading,
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                    )
                    CapPasswordField(
                        value = password,
                        onValueChange = { password = it },
                        enabled = !loading,
                        imeAction = ImeAction.Done,
                        keyboardActions = KeyboardActions(onDone = { submit() })
                    )
                    error?.let { CapInlineError(it) }
                    CapPrimaryButton(
                        text = "Sign In",
                        onClick = submit,
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

/**
 * The app mark: the product icon in a Primary-tinted container, the same low-alpha treatment
 * [CapQuickActionCard] and [CapStatusBadge] use. Shared by the sign-in lockup and the
 * cold-start screen so both pre-login moments read as one product.
 */
@Composable
private fun CapIdentityMark(containerSize: Dp = 72.dp, iconSize: Dp = 36.dp) {
    Box(
        Modifier
            .size(containerSize)
            .background(
                MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                MaterialTheme.shapes.extraLarge
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Outlined.Engineering,
            contentDescription = null,
            modifier = Modifier.size(iconSize),
            tint = MaterialTheme.colorScheme.primary
        )
    }
}

/**
 * The sign-in identity lockup: the app mark, the product name, then the company name. Grouped
 * in its own tighter-spaced column so the three parts read as one mark rather than three
 * evenly spaced items.
 */
@Composable
private fun LoginIdentity() {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        CapIdentityMark()
        Text(
            "CAP Mobile",
            style = MaterialTheme.typography.headlineLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm)
        )
        Text(
            "Connoisseur Automotive Products",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
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
    Destination("Jobs", "job_cards.view", Icons.AutoMirrored.Outlined.Assignment),
    Destination("Calendar", "calendar.view", Icons.Outlined.CalendarMonth),
    Destination("Knowledge Base", "knowledge_base.view", Icons.AutoMirrored.Outlined.LibraryBooks),
    Destination("Invoices", "invoices.queue.view", Icons.AutoMirrored.Outlined.ReceiptLong),
    Destination("Users", "users.view", Icons.Outlined.AdminPanelSettings),
    Destination("Status", "", Icons.Outlined.CloudSync)
)

private fun permissionFor(label: String) = destinations.first { it.label == label }.permission

/**
 * Job-card statuses that mean the job is finished. Shared by every "open jobs" reading in the app
 * (the Dashboard tile's count, the Client-detail list, and the Jobs screen's Open filter) so a tile
 * and the list it opens can never disagree about what "open" means.
 */
private val closedJobStatuses = setOf("Completed", "Collected")

/** Up to two initials from a display name, for [CapUserAvatar]. */
private fun initialsOf(name: String): String = name.trim().split(Regex("\\s+"))
    .filter { it.isNotBlank() }
    .take(2)
    .mapNotNull { it.firstOrNull()?.toString() }
    .joinToString("")
    .ifBlank { "?" }

/**
 * Time-of-day greeting. Deliberately mirrors the web dashboard's `greeting()`
 * (frontend/src/pages/Dashboard.jsx) so both clients use identical wording and cut-off hours.
 */
private fun greetingFor(now: Date): String {
    val hour = java.util.Calendar.getInstance().apply { time = now }.get(java.util.Calendar.HOUR_OF_DAY)
    return when {
        hour >= 5 && hour < 12 -> "Good morning"
        hour >= 12 && hour < 18 -> "Good afternoon"
        else -> "Good evening"
    }
}

/** First name (or email local part) for the greeting — same fallback chain as the web dashboard. */
private fun firstNameOf(user: CapUser): String =
    user.name.ifBlank { user.email }.trim().split(Regex("[\\s@]")).firstOrNull().orEmpty()

/** Human-readable label for a connection state — the raw enum name is not user-facing copy. */
private fun connectionLabel(status: ConnectionStatus): String = when (status) {
    ConnectionStatus.Connected -> "Connected"
    ConnectionStatus.Checking -> "Checking"
    ConnectionStatus.Offline -> "Offline"
    ConnectionStatus.AuthRequired -> "Sign-in required"
    ConnectionStatus.ServerError -> "Server error"
    ConnectionStatus.DbUnavailable -> "Database unavailable"
    ConnectionStatus.SyncError -> "Sync error"
}

/**
 * Compact top-bar connection indicator: a tinted dot, plus its label whenever the connection is
 * anything other than healthy. Both are driven by the same [connectionTone] mapping the Status
 * screen's badges use, so the two never disagree visually.
 *
 * The healthy state is deliberately dot-only — a green dot already reads as "fine", and dropping
 * the redundant "Connected" word gives the screen title the top-bar width it needs on a phone.
 * Every non-healthy state still spells itself out, and the dot carries the state as its
 * accessibility label when the text is hidden.
 */
@Composable
fun ServerStatusIndicator(status: ConnectionStatus) {
    // Resolved through the same scheme-aware helper CapStatusBadge uses, so the dot and the
    // Status screen's badges can never disagree — and both stay legible in the light scheme.
    val color = capToneColor(connectionTone(status))
    val label = connectionLabel(status)
    val showLabel = status != ConnectionStatus.Connected
    Row(
        modifier = Modifier.padding(end = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Box(
            Modifier
                .size(8.dp)
                .background(color, CircleShape)
                .then(if (showLabel) Modifier else Modifier.semantics { contentDescription = label })
        )
        if (showLabel) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
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
    if (user.hasPermission(permissionFor("Jobs"))) add(CapNavDestination("Jobs", "Jobs", Icons.AutoMirrored.Outlined.Assignment))
    add(CapNavDestination("More", "More", Icons.Outlined.MoreHoriz))
}

/**
 * Adapter between this app's existing screen-label strings (unchanged since before Phase B --
 * still what `destinations`/`permissionFor`/`MoreScreen`/every `onNavigate("SomeLabel")` call
 * site throughout this file use) and the space-free [CapNavRoute] ids Navigation-Compose's
 * `NavController`/`NavHost` require. Only [AdaptiveShell] (the NavHost wiring itself) needs to
 * know this translation exists -- every screen composable, permission check, and title still
 * works purely in terms of labels, exactly as before.
 */
private fun routeIdForLabel(label: String): String = when (label) {
    "Dashboard" -> CapNavRoute.Home.route
    "Clients" -> CapNavRoute.Clients.route
    "Machines" -> CapNavRoute.Machines.route
    "Services" -> CapNavRoute.Services.route
    // Jobs' route template carries an optional `?filter=` argument, so the argument-free base is
    // what a plain label-driven navigation must target.
    "Jobs" -> CapNavRoute.Jobs.BASE
    "Calendar" -> CapNavRoute.Calendar.route
    "Knowledge Base" -> CapNavRoute.KnowledgeBase.route
    "Invoices" -> CapNavRoute.Invoices.route
    "Users" -> CapNavRoute.Users.route
    "Status" -> CapNavRoute.Status.route
    "More" -> CapNavRoute.More.route
    "Account" -> CapNavRoute.Account.route
    "LogNewService" -> CapNavRoute.LogNewService.route
    "BookIn" -> CapNavRoute.BookIn.route
    "Settings" -> CapNavRoute.Settings.route
    CapNavRoute.SettingsJobCards.label -> CapNavRoute.SettingsJobCards.route
    CapNavRoute.SettingsCatalogue.label -> CapNavRoute.SettingsCatalogue.route
    CapNavRoute.AppSettings.label -> CapNavRoute.AppSettings.route
    else -> CapNavRoute.Home.route
}

private fun labelForRouteId(routeId: String?): String = when (routeId) {
    // Detail routes are matched against their *template* -- `NavDestination.route` is always the
    // uninterpolated "client_detail/{clientId}" form, never the filled-in one.
    CapNavRoute.ClientDetail.route -> CapNavRoute.ClientDetail.label
    CapNavRoute.MachineDetail.route -> CapNavRoute.MachineDetail.label
    CapNavRoute.JobDetail.route -> CapNavRoute.JobDetail.label
    CapNavRoute.ServiceRecordDetail.route -> CapNavRoute.ServiceRecordDetail.label
    CapNavRoute.KnowledgeBaseDetail.route -> CapNavRoute.KnowledgeBaseDetail.label
    CapNavRoute.UserDetail.route -> CapNavRoute.UserDetail.label
    CapNavRoute.Home.route -> "Dashboard"
    CapNavRoute.Clients.route -> "Clients"
    CapNavRoute.Machines.route -> "Machines"
    CapNavRoute.Services.route -> "Services"
    CapNavRoute.Jobs.route -> "Jobs"
    CapNavRoute.Calendar.route -> "Calendar"
    CapNavRoute.KnowledgeBase.route -> "Knowledge Base"
    CapNavRoute.Invoices.route -> "Invoices"
    CapNavRoute.Users.route -> "Users"
    CapNavRoute.Status.route -> "Status"
    CapNavRoute.More.route -> "More"
    CapNavRoute.Account.route -> "Account"
    CapNavRoute.LogNewService.route -> "LogNewService"
    CapNavRoute.BookIn.route -> "BookIn"
    CapNavRoute.Settings.route -> "Settings"
    CapNavRoute.SettingsJobCards.route -> CapNavRoute.SettingsJobCards.label
    CapNavRoute.SettingsCatalogue.route -> CapNavRoute.SettingsCatalogue.label
    CapNavRoute.AppSettings.route -> CapNavRoute.AppSettings.label
    else -> "Dashboard"
}

/**
 * Which bottom-nav tab stays highlighted for a given screen label. A detail destination keeps its
 * parent tab lit, which is what it did implicitly back when it was rendered *inside* that tab's
 * list screen -- the other three detail screens are reached from "More", which has never had a
 * highlight of its own for those drill-ins, so they keep the same (unhighlighted) treatment.
 */
private fun bottomNavSelectionFor(label: String): String = when (label) {
    CapNavRoute.ClientDetail.label -> "Clients"
    CapNavRoute.JobDetail.label -> "Jobs"
    else -> label
}

/** The 4 bottom-nav tabs get the standard Google-recommended save/restore back-stack treatment
 *  (each tab keeps its own state when switching away and back). Every other destination
 *  (drill-ins from Dashboard/More) is a normal push so the system back button returns to
 *  wherever the user actually came from -- real behavior this app never had before Phase B. */
private val bottomNavLabels = setOf("Dashboard", "Clients", "Jobs", "More")

@Composable
fun AdaptiveShell(vm: MainViewModel) {
    val user = vm.state.user ?: return
    val status by vm.status.collectAsState()
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val selected = labelForRouteId(backStackEntry?.destination?.route)
    val snackbar = remember { SnackbarHostState() }
    val bottomDestinations = remember(user) { bottomNavDestinations(user) }

    LaunchedEffect(vm.actionMessage) {
        vm.actionMessage?.let { snackbar.showSnackbar(it); vm.clearMessage() }
    }

    // "Calendar" is an internal route label that appears nowhere in the UI: MoreScreen's row says
    // "Upcoming Services", and unlike Invoices/Status this screen has no in-screen header to
    // resolve the mismatch — so the top bar was the only location cue and it named a different
    // screen from the one the user tapped.
    val title = when (selected) {
        "Dashboard" -> "Home"
        "LogNewService" -> "Log New Service"
        "BookIn" -> "Book In"
        "Calendar" -> "Upcoming Services"
        // The route labels are spelled out for uniqueness; the top bar only needs the section.
        CapNavRoute.SettingsJobCards.label -> "Job Cards"
        CapNavRoute.SettingsCatalogue.label -> "Products & Services"
        CapNavRoute.ClientDetail.label -> "Client"
        CapNavRoute.MachineDetail.label -> "Machine"
        CapNavRoute.JobDetail.label -> "Job Card"
        CapNavRoute.ServiceRecordDetail.label -> "Service Record"
        CapNavRoute.KnowledgeBaseDetail.label -> "Knowledge Base"
        CapNavRoute.UserDetail.label -> "User"
        else -> destinations.firstOrNull { it.label == selected }?.label ?: selected
    }

    val navigate: (String) -> Unit = { label ->
        navController.navigate(routeIdForLabel(label)) {
            launchSingleTop = true
            if (label in bottomNavLabels) {
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                restoreState = true
            }
        }
    }

    /**
     * Destinations addressed by an already-built route string rather than by label: the record-id
     * detail screens, and the Jobs list when it carries a status filter.
     */
    val openRoute: (String) -> Unit = { route ->
        navController.navigate(route) { launchSingleTop = true }
    }

    // One central rule instead of a per-screen decision: the 4 bottom-nav tabs are root
    // destinations and never show a back arrow; everything else is something the user drilled
    // into, so it does. The back-stack check keeps the arrow honest -- it is only offered when
    // there is genuinely somewhere to pop to.
    val canGoBack = selected !in bottomNavLabels && navController.previousBackStackEntry != null
    val onTopBarBack: (() -> Unit)? = if (canGoBack) {
        { navController.popBackStack() }
    } else {
        null
    }

    CapAppScaffold(
        topBar = {
            CapTopAppBar(
                title = title,
                onBack = onTopBarBack,
                actions = { ServerStatusIndicator(status.connection) }
            )
        },
        bottomBar = {
            CapBottomNavigation(bottomDestinations, bottomNavSelectionFor(selected), onSelect = navigate)
        },
        snackbarHostState = snackbar
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).padding(horizontal = Spacing.md, vertical = Spacing.sm)) {
            NavHost(navController = navController, startDestination = CapNavRoute.Home.route) {
                composable(CapNavRoute.Home.route) { ScreenContent("Dashboard", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Clients.route) { ScreenContent("Clients", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Machines.route) { ScreenContent("Machines", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Services.route) { ScreenContent("Services", vm, user, navigate, openRoute) }
                composable(
                    route = CapNavRoute.Jobs.route,
                    arguments = listOf(
                        navArgument(CapNavRoute.Jobs.ARG) { type = NavType.StringType; defaultValue = "" }
                    )
                ) { entry ->
                    ScreenContent(
                        "Jobs", vm, user, navigate, openRoute,
                        jobsFilter = entry.arguments?.getString(CapNavRoute.Jobs.ARG).orEmpty()
                    )
                }
                composable(CapNavRoute.Calendar.route) { ScreenContent("Calendar", vm, user, navigate, openRoute) }
                composable(CapNavRoute.KnowledgeBase.route) { ScreenContent("Knowledge Base", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Invoices.route) { ScreenContent("Invoices", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Users.route) { ScreenContent("Users", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Status.route) { ScreenContent("Status", vm, user, navigate, openRoute) }
                composable(CapNavRoute.More.route) { ScreenContent("More", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Account.route) { ScreenContent("Account", vm, user, navigate, openRoute) }
                composable(CapNavRoute.LogNewService.route) { ScreenContent("LogNewService", vm, user, navigate, openRoute) }
                composable(CapNavRoute.BookIn.route) { ScreenContent("BookIn", vm, user, navigate, openRoute) }
                composable(CapNavRoute.Settings.route) { ScreenContent("Settings", vm, user, navigate, openRoute) }
                composable(CapNavRoute.SettingsJobCards.route) {
                    ScreenContent(CapNavRoute.SettingsJobCards.label, vm, user, navigate, openRoute)
                }
                composable(CapNavRoute.SettingsCatalogue.route) {
                    ScreenContent(CapNavRoute.SettingsCatalogue.label, vm, user, navigate, openRoute)
                }
                composable(CapNavRoute.AppSettings.route) {
                    ScreenContent(CapNavRoute.AppSettings.label, vm, user, navigate, openRoute)
                }

                composable(CapNavRoute.ClientDetail.route) { entry ->
                    DetailContent(CapNavRoute.ClientDetail, entry.arguments?.getString(CapNavRoute.ClientDetail.ARG), vm, user, openRoute, onBack = { navController.popBackStack() })
                }
                composable(CapNavRoute.MachineDetail.route) { entry ->
                    DetailContent(CapNavRoute.MachineDetail, entry.arguments?.getString(CapNavRoute.MachineDetail.ARG), vm, user, openRoute)
                }
                composable(CapNavRoute.JobDetail.route) { entry ->
                    DetailContent(CapNavRoute.JobDetail, entry.arguments?.getString(CapNavRoute.JobDetail.ARG), vm, user, openRoute, onBack = { navController.popBackStack() })
                }
                composable(CapNavRoute.ServiceRecordDetail.route) { entry ->
                    DetailContent(CapNavRoute.ServiceRecordDetail, entry.arguments?.getString(CapNavRoute.ServiceRecordDetail.ARG), vm, user, openRoute)
                }
                composable(CapNavRoute.KnowledgeBaseDetail.route) { entry ->
                    DetailContent(CapNavRoute.KnowledgeBaseDetail, entry.arguments?.getString(CapNavRoute.KnowledgeBaseDetail.ARG), vm, user, openRoute, onBack = { navController.popBackStack() })
                }
                composable(CapNavRoute.UserDetail.route) { entry ->
                    DetailContent(CapNavRoute.UserDetail, entry.arguments?.getString(CapNavRoute.UserDetail.ARG), vm, user, openRoute)
                }
            }
        }
    }
}

@Composable
private fun ScreenContent(
    selected: String,
    vm: MainViewModel,
    user: CapUser,
    onNavigate: (String) -> Unit,
    onOpen: (String) -> Unit,
    jobsFilter: String = ""
) {
    val data = vm.recordsState

    // App Settings reads no record collection at all (theme preference + two deep links into
    // Android's own settings), so it is dispatched BEFORE the shared loading/error gate below.
    // Otherwise a cold start or a backend outage would hide this device's own theme and
    // notification controls behind a spinner or an error state they have nothing to do with.
    if (selected == CapNavRoute.AppSettings.label) {
        AppSettingsScreen()
        return
    }

    if (data.loading) {
        CapLoadingState()
        return
    }
    data.error?.let { message ->
        CapErrorState(message = message, onRetry = { vm.checkHealth() })
        return
    }
    when (selected) {
        "Dashboard" -> DashboardScreen(data, user, onNavigate, onOpen, vm::save, vm::delete)
        "Clients" -> ClientsScreen(data, user, vm::save, onOpen)
        "Machines" -> MachinesScreen(data, user, vm::save, onOpen)
        "Services" -> ServicesScreen(data, user, vm::save, onOpen)
        "Jobs" -> JobsScreen(data, user, vm::save, onOpen, jobsFilter)
        "Calendar" -> CalendarScreen(data, onOpen)
        "Knowledge Base" -> KnowledgeBaseScreen(data, onOpen)
        "Invoices" -> InvoiceScreen(data)
        "Users" -> UsersScreen(data, onOpen)
        "Status" -> StatusScreen(vm)
        "More" -> MoreScreen(user, onNavigate, vm::logout)
        "Account" -> AccountScreen(user, vm, vm::logout)
        // Every Settings destination is gated on `settings.access` at the ROUTE level, matching
        // the web app exactly (App.jsx's RoleGuard around `/settings`) -- there is no read-only
        // mode, because on the web a user without the permission never reaches the page at all.
        // The row in "More" is hidden without it too; this check is what makes a deep link or a
        // restored back stack behave the same way.
        "Settings" -> RequireSettingsAccess(user) { SettingsScreen(user, onNavigate) }
        CapNavRoute.SettingsJobCards.label -> RequireSettingsAccess(user) {
            JobCardSettingsScreen(data.collection("job_card_settings").firstOrNull(), vm::save)
        }
        CapNavRoute.SettingsCatalogue.label -> RequireSettingsAccess(user) {
            ProductsServicesScreen(data.collection("products_services"), vm::save)
        }
        // CapNavRoute.AppSettings is handled above, before the loading/error gate — and
        // deliberately NOT wrapped in RequireSettingsAccess: it holds per-device preferences and
        // deep links into Android's own settings, none of which touch business data, so gating it
        // on `settings.access` would lock most users out of their own phone's theme and
        // notification controls for no security benefit.
        "LogNewService" -> LogNewServiceScreen(data.collection("clients"), data.collection("machines"), vm::save, vm.actionMessage, vm, { onNavigate("Dashboard") }) { onNavigate("Dashboard") }
        "BookIn" -> BookInScreen(data.collection("clients"), data.collection("machines"), data.collection("job_cards"), vm::save, vm.actionMessage, vm, onOpen, { onNavigate("Dashboard") }) { onNavigate("Dashboard") }
    }
}

/**
 * Detail-destination counterpart to [ScreenContent]. A detail route carries only a record id, so
 * the record is looked up in the live collection on every recomposition: it may still be loading
 * (the destination can be restored before data arrives, e.g. after process death), and it can
 * legitimately disappear if it was deleted elsewhere while the screen was open — neither case may
 * crash, so both get a real state instead of a `!!`.
 */
@Composable
private fun DetailContent(
    route: CapNavRoute,
    recordId: String?,
    vm: MainViewModel,
    user: CapUser,
    onOpen: (String) -> Unit,
    onBack: () -> Unit = {}
) {
    val data = vm.recordsState
    if (data.loading) {
        CapLoadingState()
        return
    }
    data.error?.let { message ->
        CapErrorState(message = message, onRetry = { vm.checkHealth() })
        return
    }

    val collection = when (route) {
        CapNavRoute.ClientDetail -> "clients"
        CapNavRoute.MachineDetail -> "machines"
        CapNavRoute.JobDetail -> "job_cards"
        CapNavRoute.ServiceRecordDetail -> "service_records"
        CapNavRoute.KnowledgeBaseDetail -> "knowledge_machines"
        CapNavRoute.UserDetail -> "users"
        else -> return
    }
    val record = recordId?.let { id -> data.collection(collection).firstOrNull { it.id == id } }
    if (record == null) {
        CapEmptyState("This record is no longer available.")
        return
    }

    when (route) {
        CapNavRoute.ClientDetail -> {
            val clientMachines = relatedRecords(data.collection("machines"), "client_id", record.id)
            val clientMachineIds = clientMachines.map { it.id }.toSet()
            ClientDetailScreen(
                client = record,
                machines = clientMachines,
                services = data.collection("service_records").filter { it.text("machine_id") in clientMachineIds },
                jobs = relatedRecords(data.collection("job_cards"), "client_id", record.id),
                user = user,
                clients = data.collection("clients"),
                save = vm::save,
                onDelete = { vm.deleteThenRun("clients", record.id, "Client", onBack) }
            )
        }

        CapNavRoute.MachineDetail -> MachineDetailScreen(
            machine = record,
            clients = data.collection("clients"),
            services = relatedRecords(data.collection("service_records"), "machine_id", record.id),
            user = user,
            save = vm::save
        )

        CapNavRoute.JobDetail -> JobDetailScreen(
            job = record,
            clients = data.collection("clients"),
            machines = data.collection("machines"),
            user = user,
            save = vm::save,
            vm = vm,
            onDelete = { vm.deleteThenRun("job_cards", record.id, "Job card", onBack) }
        )

        CapNavRoute.ServiceRecordDetail -> {
            val machines = data.collection("machines")
            val machine = machines.firstOrNull { it.id == record.text("machine_id") }
            val client = data.collection("clients").firstOrNull { it.id == machine?.text("client_id") }
            var editing by remember(record.id) { mutableStateOf(false) }
            ServiceRecordDetailScreen(
                service = record,
                machine = machine,
                client = client,
                user = user,
                vm = vm,
                onOpen = onOpen,
                onEdit = { editing = true }
            )
            if (editing) {
                ServiceDialog(machines, record, { editing = false }) { fields ->
                    vm.save("service_records", record.id, fields, "Service record")
                    editing = false
                }
            }
        }

        CapNavRoute.KnowledgeBaseDetail -> KnowledgeBaseDetailScreen(
            machine = record,
            notes = relatedRecords(data.collection("knowledge_notes"), "knowledge_machine_id", record.id),
            media = relatedRecords(data.collection("knowledge_media"), "knowledge_machine_id", record.id),
            documents = relatedRecords(data.collection("knowledge_documents"), "knowledge_machine_id", record.id),
            serviceCodes = relatedRecords(data.collection("knowledge_service_codes"), "knowledge_machine_id", record.id),
            user = user,
            save = vm::save,
            onDelete = { vm.deleteThenRun("knowledge_machines", record.id, "Knowledge base entry", onBack) }
        )

        CapNavRoute.UserDetail -> UserDetailScreen(
            profile = record,
            permissions = data.collection("permissions"),
            rolePermissions = data.collection("role_permissions"),
            save = vm::save
        )

        else -> Unit
    }
}

/**
 * The "More" hub: everything that used to live in the old dropdown-menu / NavigationRail, still
 * gated by the exact same permission keys `destinations` has always used. "Upcoming Services" is
 * the existing due-services screen restyled in Phase 6 (route "Calendar") — there is no separate
 * literal calendar-grid view in this app, so this is intentionally a single row, not a duplicate
 * of some other calendar feature.
 *
 * Structure, revised: a screen header, then a tappable profile summary, then named sections
 * ("Operations" / "Resources" / "App" / no header for the sign-out card). The section headers sit
 * *inside* each card via [CapSectionHeader] rather than floating above it, so a card is never
 * separated from its own label by the column's spacing, and a hidden section takes its header with
 * it automatically.
 *
 * Two deliberate calls worth recording:
 *  - The old standalone "Account" row is gone. The profile summary card at the top navigates to
 *    exactly the same destination ("Account"), and two rows that open one screen is more confusing
 *    than discoverable — the whole point of the summary card is that it is the obvious entry point.
 *  - The business Settings row is *labelled* "Business Settings" while still navigating to the
 *    unchanged "Settings" label, purely so it reads distinctly from the new device-level "App
 *    Settings" row directly beneath it. No route, permission, or call site changed.
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
        CapScreenHeader(
            title = "More",
            subtitle = "Your profile, the rest of the workshop screens, and app settings."
        )

        MoreProfileCard(user = user, onClick = { onNavigate("Account") })

        if (showOperations) {
            CapCard {
                CapSectionHeader("Operations")
                if (user.hasPermission(permissionFor("Machines"))) {
                    CapListItem(
                        "Machines",
                        subtitle = "Every machine on record",
                        leading = { Icon(Icons.Outlined.PrecisionManufacturing, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Machines") }
                    )
                }
                if (user.hasPermission(permissionFor("Calendar"))) {
                    CapListItem(
                        "Upcoming Services",
                        subtitle = "What is due, by week or month",
                        leading = { Icon(Icons.Outlined.CalendarMonth, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Calendar") }
                    )
                }
                if (user.hasPermission(permissionFor("Services"))) {
                    CapListItem(
                        "Service Records",
                        subtitle = "Work already logged",
                        leading = { Icon(Icons.Outlined.Build, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Services") }
                    )
                }
                if (user.hasPermission("job_cards.create")) {
                    CapListItem(
                        "Book In",
                        subtitle = "Start a new job card",
                        leading = { Icon(Icons.Outlined.EventAvailable, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("BookIn") }
                    )
                }
            }
        }

        if (showResources) {
            CapCard {
                CapSectionHeader("Resources")
                if (user.hasPermission(permissionFor("Knowledge Base"))) {
                    CapListItem(
                        "Machine Knowledge Base",
                        subtitle = "Specs, notes, media, and service codes",
                        leading = { Icon(Icons.AutoMirrored.Outlined.LibraryBooks, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Knowledge Base") }
                    )
                }
                if (user.hasPermission(permissionFor("Invoices"))) {
                    CapListItem(
                        "Invoice Queue",
                        subtitle = "Job cards ready to be invoiced",
                        leading = { Icon(Icons.AutoMirrored.Outlined.ReceiptLong, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Invoices") }
                    )
                }
                if (user.hasPermission(permissionFor("Users"))) {
                    CapListItem(
                        "Users",
                        subtitle = "Accounts, roles, and permissions",
                        leading = { Icon(Icons.Outlined.AdminPanelSettings, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Users") }
                    )
                }
            }
        }

        // "App" group: how the app is configured, as opposed to the record-browsing destinations
        // above. Three deliberately different things live here and are worded so they cannot be
        // mistaken for each other — business configuration (permission-gated, shared with the
        // website), this device's own preferences (never gated), and the live backend connection.
        CapCard {
            CapSectionHeader("App")
            if (user.hasPermission("settings.access")) {
                CapListItem(
                    "Business Settings",
                    subtitle = "Job cards, products & services",
                    leading = { Icon(Icons.Outlined.Settings, null) },
                    showNavArrow = true,
                    // Unchanged destination label — only the visible wording differs.
                    onClick = { onNavigate("Settings") }
                )
            }
            CapListItem(
                "App Settings",
                subtitle = "Appearance, notifications, about",
                leading = { Icon(Icons.Outlined.PhoneAndroid, null) },
                showNavArrow = true,
                onClick = { onNavigate(CapNavRoute.AppSettings.label) }
            )
            CapListItem(
                "Connection and Sync Status",
                subtitle = "Live backend health and connection test",
                leading = { Icon(Icons.Outlined.CloudSync, null) },
                showNavArrow = true,
                onClick = { onNavigate("Status") }
            )
        }

        CapCard {
            CapListItem(
                "Logout",
                subtitle = "Sign out of ${user.email.ifBlank { "this account" }}",
                leading = { Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = MaterialTheme.colorScheme.error) },
                onClick = { confirmLogout = true }
            )
        }

        // Breathing room under the last card so it never sits flush against the bottom nav bar.
        Spacer(Modifier.height(Spacing.lg))
    }

    if (confirmLogout) {
        LogoutConfirmDialog(onDismiss = { confirmLogout = false }) {
            confirmLogout = false
            onLogout()
        }
    }
}

/**
 * The profile summary at the top of "More": avatar, name, role badge, email — the whole card is one
 * tap target onto the existing [AccountScreen]. This exists to make the profile page findable, not
 * to duplicate it; nothing here is editable and nothing here is a second copy of account state.
 *
 * Every field is defended against blank data ([CapUser] fields are plain strings that can legally
 * be empty on a freshly provisioned account) and the name/email are single-line-ellipsised so a
 * long address can never push the badge or the nav arrow off a small phone.
 */
@Composable
private fun MoreProfileCard(user: CapUser, onClick: () -> Unit) {
    CapCard(Modifier.clickable(onClick = onClick)) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            CapUserAvatar(initialsOf(user.name))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Text(
                    user.name.ifBlank { "Signed-in user" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (user.email.isNotBlank()) {
                    Text(
                        user.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                CapStatusBadge(user.role.ifBlank { "User" }, StatusTone.Info)
            }
            Icon(
                Icons.AutoMirrored.Outlined.ArrowForwardIos,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            "View and edit your profile",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = Spacing.sm)
        )
    }
}

/**
 * Device-level app settings — the counterpart to, and deliberately separate from, the business
 * [SettingsScreen]. Nothing on this screen is business configuration, so it carries no permission
 * gate; everything on it is real.
 *
 * Notifications and storage/permissions are deep links into Android's own settings rather than
 * in-app controls. That is the honest option, not a shortcut: this app has no notification system
 * and no cache manager of its own, so an in-app toggle or "Clear cache" button would be a control
 * that does nothing. The OS screens are the real ones and they are always present from API 26.
 */
@Composable
private fun AppSettingsScreen() {
    val context = LocalContext.current

    // Both intents target settings screens the platform guarantees exist, so a failure here is a
    // genuinely exceptional OEM edge case rather than an expected branch — caught so that it can
    // never take the app down, and left visible via the surfaced message rather than swallowed.
    var launchError by remember { mutableStateOf<String?>(null) }
    fun open(intent: Intent) {
        launchError = null
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            launchError = "This device does not expose that Android settings screen."
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapScreenHeader(
                title = "App Settings",
                subtitle = "Personalize CAP Mobile on this device. These settings are not shared with your account or the website."
            )
        }

        // Moved here from the business Settings hub: how the app looks on one handset is a device
        // preference, not a business configuration, and it should not sit behind `settings.access`.
        item { AppearanceSettingsCard() }

        item {
            CapCard {
                CapSectionHeader("Device")
                CapListItem(
                    "Notifications",
                    subtitle = "Opens Android's notification settings for CAP Mobile",
                    leading = { Icon(Icons.Outlined.Notifications, null) },
                    showNavArrow = true,
                    onClick = {
                        open(
                            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        )
                    }
                )
                CapListItem(
                    "App info & storage",
                    subtitle = "Opens Android's App info screen — permissions, storage, and cache",
                    leading = { Icon(Icons.Outlined.Storage, null) },
                    showNavArrow = true,
                    onClick = {
                        open(
                            Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", context.packageName, null)
                            )
                        )
                    }
                )
                launchError?.let { CapInlineError(it) }
                Text(
                    "CAP Mobile does not send notifications yet, so there is nothing to switch on in the app itself — " +
                        "the Android screen above is where any future notifications would be controlled.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = Spacing.sm, vertical = Spacing.xs)
                )
            }
        }

        item {
            CapCard {
                CapSectionHeader("About")
                CapListItem(
                    "${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                    subtitle = "App version",
                    leading = { Icon(Icons.Outlined.Info, null) }
                )
                CapListItem(
                    "Supabase",
                    subtitle = "Data and sign-in provider",
                    leading = { Icon(Icons.Outlined.Security, null) }
                )
            }
        }
    }
}

/**
 * Account screen: editable identity (profile photo + display name), read-only account facts, app
 * build, and logout with confirmation.
 *
 * Cross-platform parity Phase 7 made the photo and name editable. Both writes go through
 * [MainViewModel.updateProfile], which replaces the in-memory [CapUser] with the row the server
 * returned — so this screen re-renders from saved state rather than from what it submitted.
 *
 * Known live constraint, surfaced honestly rather than hidden: migration 0026 (which adds
 * `public.users.photo_path` and fixes the `profile-images` bucket's RLS) is not applied to
 * production yet. Until it is, [CapUser.photoPath] is always null and a real save attempt fails
 * server-side. That failure is shown as a normal inline error — nothing here fakes success or
 * disables the controls to paper over it.
 */
@Composable
private fun AccountScreen(user: CapUser, vm: MainViewModel, onLogout: () -> Unit) {
    var confirmLogout by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Signed URL for display only, re-resolved whenever the stored permanent path changes.
    // Never persisted — the path is the durable value, the URL expires.
    var photoUrl by remember(user.photoPath) { mutableStateOf<String?>(null) }
    var resolvingPhoto by remember(user.photoPath) { mutableStateOf(user.photoPath != null) }
    var uploadingPhoto by remember { mutableStateOf(false) }
    var photoError by remember { mutableStateOf<String?>(null) }

    var editingName by remember(user.name) { mutableStateOf(false) }
    var nameDraft by remember(user.name) { mutableStateOf(user.name) }
    var savingName by remember { mutableStateOf(false) }
    var nameError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(user.photoPath) {
        val path = user.photoPath
        if (path == null) {
            photoUrl = null
            resolvingPhoto = false
            return@LaunchedEffect
        }
        resolvingPhoto = true
        photoUrl = runCatching { vm.createAvatarSignedUrl(path) }.getOrNull()
        resolvingPhoto = false
    }

    suspend fun uploadPickedAvatar(uri: Uri) {
        uploadingPhoto = true
        photoError = null
        try {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalStateException("Could not read the selected photo.")
            val contentType = context.contentResolver.getType(uri) ?: "image/jpeg"
            val path = vm.uploadAvatar(user.id, bytes, contentType)
            // Two-step, same as record photos: Storage first, then persist the permanent path.
            vm.updateProfile(user.id, mapOf("photo_path" to path))
        } catch (error: Exception) {
            photoError = error.message ?: "Could not update your profile photo. Please try again."
        }
        uploadingPhoto = false
    }

    val pickPhotoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { uploadPickedAvatar(uri) }
    }

    fun saveName() {
        val trimmed = nameDraft.trim()
        if (trimmed.isBlank()) {
            nameError = "Name cannot be empty."
            return
        }
        scope.launch {
            savingName = true
            nameError = null
            try {
                vm.updateProfile(user.id, mapOf("full_name" to trimmed))
                editingName = false
            } catch (error: Exception) {
                nameError = error.message ?: "Could not save your name. Please try again."
            }
            savingName = false
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        CapCard {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                AccountAvatar(
                    initials = initialsOf(user.name),
                    url = photoUrl,
                    resolving = resolvingPhoto,
                    uploading = uploadingPhoto,
                    hasPhoto = user.photoPath != null,
                    onClick = {
                        photoError = null
                        pickPhotoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    }
                )
                Text(
                    user.name.ifBlank { "Signed-in user" },
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    user.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                CapStatusBadge(user.role.ifBlank { "User" }, StatusTone.Info)
                photoError?.let { CapInlineError(it) }
            }
        }

        CapCard {
            if (editingName) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapTextField(
                        label = "Name",
                        value = nameDraft,
                        onValueChange = { nameDraft = it; nameError = null },
                        enabled = !savingName,
                        imeAction = ImeAction.Done,
                        keyboardActions = KeyboardActions(onDone = { saveName() }),
                        errorMessage = nameError
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Box(Modifier.weight(1f)) {
                            CapSecondaryButton(
                                text = "Cancel",
                                onClick = {
                                    nameDraft = user.name
                                    nameError = null
                                    editingName = false
                                },
                                enabled = !savingName
                            )
                        }
                        Box(Modifier.weight(1f)) {
                            CapPrimaryButton(text = "Save", onClick = { saveName() }, loading = savingName)
                        }
                    }
                }
            } else {
                CapListItem(
                    user.name.ifBlank { "Not set" },
                    subtitle = "Name",
                    leading = { Icon(Icons.Outlined.Person, null) },
                    trailing = {
                        Icon(
                            Icons.Outlined.Edit,
                            "Edit name",
                            Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    },
                    onClick = {
                        nameDraft = user.name
                        nameError = null
                        editingName = true
                    }
                )
            }
            CapListItem(user.email.ifBlank { "Not set" }, subtitle = "Email", leading = { Icon(Icons.Outlined.Email, null) })
            CapListItem(user.role.ifBlank { "Not set" }, subtitle = "Role", leading = { Icon(Icons.Outlined.Badge, null) })
            CapListItem("Supabase", subtitle = "Authentication provider", leading = { Icon(Icons.Outlined.Security, null) })
            Text(
                "Your email address and role are managed by an administrator and can't be changed here.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = Spacing.sm, vertical = Spacing.xs)
            )
        }

        CapCard {
            CapListItem(
                "${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                subtitle = "App version",
                leading = { Icon(Icons.Outlined.Info, null) }
            )
        }

        CapDestructiveButton(text = "Logout", onClick = { confirmLogout = true })
    }

    if (confirmLogout) {
        LogoutConfirmDialog(onDismiss = { confirmLogout = false }) {
            confirmLogout = false
            onLogout()
        }
    }
}

/**
 * The account header's profile photo: the user's uploaded image when one exists, otherwise the
 * same Primary-tinted identity treatment [CapIdentityMark] and [CapUserAvatar] use, so a
 * photo-less account still reads as part of the product rather than as a broken image. [url] is a
 * signed URL the caller resolved from the permanent path — never persisted.
 *
 * The camera badge is decorative and carries no click handler of its own, so it can't shadow the
 * avatar's own tap target; the whole circle is one 96dp target, comfortably above Material's
 * minimum on a small phone.
 */
@Composable
private fun AccountAvatar(
    initials: String,
    url: String?,
    resolving: Boolean,
    uploading: Boolean,
    hasPhoto: Boolean,
    onClick: () -> Unit
) {
    var failed by remember(url) { mutableStateOf(false) }
    val label = if (hasPhoto) "Profile photo. Tap to change it." else "No profile photo. Tap to add one."
    Box(
        Modifier
            .size(96.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f))
            .clickable(enabled = !uploading, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        when {
            uploading || resolving -> CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            url != null && !failed -> AsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                onState = { state -> if (state is AsyncImagePainter.State.Error) failed = true }
            )
            hasPhoto -> Icon(
                Icons.Outlined.BrokenImage,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            else -> Text(
                initials.take(2).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary
            )
        }
        if (!uploading) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Outlined.PhotoCamera,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

/** Shared logout confirmation, delegating to the reusable [CapConfirmDialog]. */
@Composable
private fun LogoutConfirmDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    CapConfirmDialog(
        title = "Log out?",
        message = "You'll need to sign in again to view CAP data on this device.",
        confirmLabel = "Logout",
        onConfirm = onConfirm,
        onDismiss = onDismiss
    )
}

/** One dashboard quick-action tile, paired with the permission key that gates it. */
private data class QuickAction(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val label: String,
    val route: String
)

@Composable
private fun DashboardScreen(
    data: RecordsState,
    user: CapUser,
    onNavigate: (String) -> Unit,
    onOpen: (String) -> Unit,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    delete: (String, String, String) -> Unit
) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val services = data.collection("service_records")
    val jobs = data.collection("job_cards")
    val machinesById = machines.associateBy { it.id }
    val clientsById = clients.associateBy { it.id }

    val openJobs = jobs.count { it.text("status") !in closedJobStatuses }
    val dueServices = services.filter { it.text("next_service_due").isNotBlank() }.sortedBy { it.text("next_service_due") }

    // Each summary tile drills into the screen its number came from, gated on the same permission
    // that gates that screen — a user who cannot open the screen gets the plain, non-interactive
    // tile (`onClick = null`) instead of a tap that leads nowhere.
    val openClients: (() -> Unit)? =
        if (user.hasPermission(permissionFor("Clients"))) fun() { onNavigate("Clients") } else null
    val openMachines: (() -> Unit)? =
        if (user.hasPermission(permissionFor("Machines"))) fun() { onNavigate("Machines") } else null
    // Opens the Jobs list already narrowed to the same jobs this tile counted.
    val openJobsRoute = CapNavRoute.Jobs.of(CapNavRoute.Jobs.FILTER_OPEN)
    val openOpenJobs: (() -> Unit)? =
        if (user.hasPermission(permissionFor("Jobs"))) fun() { onOpen(openJobsRoute) } else null
    // "Calendar" is this app's Upcoming Services screen — the same target the "Upcoming Services"
    // section's "View all" link below already uses.
    val openDueServices: (() -> Unit)? =
        if (user.hasPermission(permissionFor("Calendar"))) fun() { onNavigate("Calendar") } else null

    val initials = initialsOf(user.name)
    val quickActions = buildList {
        if (user.hasPermission("services.create")) add(QuickAction(Icons.Outlined.Build, "Log New Service", "LogNewService"))
        if (user.hasPermission("job_cards.create")) add(QuickAction(Icons.Outlined.PrecisionManufacturing, "Book In Machine", "BookIn"))
        if (user.hasPermission(permissionFor("Jobs"))) add(QuickAction(Icons.AutoMirrored.Outlined.Assignment, "View Jobs", "Jobs"))
        if (user.hasPermission(permissionFor("Clients"))) add(QuickAction(Icons.Outlined.Groups, "View Clients", "Clients"))
    }

    // Live clock, matching the web dashboard's ticking date/time line. Re-reading the clock on a
    // timer (rather than once per composition) keeps the greeting honest when this tab is left
    // open — the bottom-nav back stack keeps this screen alive across tab switches.
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = Date()
        }
    }
    val isoFormat = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US) }
    val dateFormat = remember { SimpleDateFormat("EEEE, d MMMM yyyy", Locale.US) }
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.US) }
    val todayIso = isoFormat.format(now)
    val next30Iso = isoFormat.format(
        java.util.Calendar.getInstance().apply { time = now; add(java.util.Calendar.DAY_OF_YEAR, 30) }.time
    )
    // Same window the web dashboard's greeting line uses: due on or after today, within 30 days.
    // ISO yyyy-MM-dd sorts lexicographically, so plain string comparison is correct here.
    val dueNext30 = dueServices.count { service ->
        val dueDate = service.text("next_service_due")
        dueDate >= todayIso && dueDate <= next30Iso
    }
    val greetingName = firstNameOf(user)
    val greeting = greetingFor(now).let { if (greetingName.isBlank()) it else "$it, $greetingName" }
    val contextLine = if (dueNext30 > 0) {
        "$dueNext30 service${if (dueNext30 == 1) "" else "s"} due in the next 30 days."
    } else {
        "Here's what needs attention today."
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        item {
            CapCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapUserAvatar(initials)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(greeting, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            Text(
                                "${dateFormat.format(now)} · ${timeFormat.format(now)}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            CapStatusBadge(user.role.ifBlank { "User" }, StatusTone.Info)
                        }
                    }
                }
                Text(
                    contextLine,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)
                )
            }
        }
        item {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapStatCard(
                        Icons.Outlined.Groups, "Clients", clients.size.toString(), Modifier.weight(1f),
                        "Active client accounts", openClients
                    )
                    CapStatCard(
                        Icons.Outlined.Build, "Machines", machines.size.toString(), Modifier.weight(1f),
                        "Machines on record", openMachines
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapStatCard(
                        Icons.AutoMirrored.Outlined.Assignment, "Open Jobs", openJobs.toString(), Modifier.weight(1f),
                        "Not yet completed", openOpenJobs
                    )
                    CapStatCard(
                        Icons.Outlined.Event, "Due Services", dueServices.size.toString(), Modifier.weight(1f),
                        "With a next-due date", openDueServices
                    )
                }
            }
        }
        if (quickActions.isNotEmpty()) {
            item {
                // 2 per row rather than 4-across: four tiles on one phone-width row left each
                // label truncated and each target under the comfortable touch size. Each tile is
                // gated on the same permission key that gates the screen it opens, so a user
                // never taps through to a screen they cannot use (MoreScreen already did this;
                // the dashboard did not).
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapSectionHeader(title = "Quick actions")
                    quickActions.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            row.forEach { action ->
                                CapQuickActionCard(action.icon, action.label, { onNavigate(action.route) }, Modifier.weight(1f))
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        item {
            CapCard {
                CapSectionHeader(
                    title = "Upcoming Services",
                    // "Calendar" is this app's Upcoming Services screen (see MoreScreen), and the
                    // link is gated on exactly the permission that gates it there.
                    action = {
                        if (user.hasPermission(permissionFor("Calendar"))) {
                            TextButton(onClick = { onNavigate("Calendar") }) {
                                Text("View all", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                )
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
        item {
            DashboardNotesSection(
                notes = data.collection("dashboard_notes"),
                clients = clients,
                user = user,
                save = save,
                delete = delete,
                onOpen = onOpen
            )
        }
    }
}

/** Server-side `dashboard_notes_content_length` CHECK (migration 0023) — validated here too so
 *  an over-long note is caught in the form instead of failing the insert. */
private const val NOTE_CONTENT_MAX_LENGTH = 2000

/** The only values `dashboard_notes_color_valid` (migration 0023) accepts. Order matters: a new
 *  note takes `noteColorKeys[noteCount % 4]`, the same round-robin the web client uses so
 *  consecutive notes don't all come out the same colour. */
private val noteColorKeys = listOf("yellow", "blue", "green", "pink")

private fun noteAccentColor(colorKey: String): Color = when (colorKey) {
    "blue" -> CapNoteBlue
    "green" -> CapNoteGreen
    "pink" -> CapNotePink
    // Also the fallback for a blank/unrecognised value, matching the web client's `|| COLORS.yellow`.
    else -> CapNoteYellow
}

/** `created_at` arrives as an ISO-8601 timestamp; only its date part is shown, and anything
 *  unparseable (or a row that has never been written back from the server) shows nothing at all
 *  rather than a raw string. */
private fun shortNoteDate(raw: String): String? {
    val isoDate = raw.take(10)
    if (isoDate.length < 10) return null
    return runCatching {
        val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(isoDate) ?: return null
        SimpleDateFormat("d MMM", Locale.US).format(parsed)
    }.getOrNull()
}

/**
 * Dashboard sticky notes, matching the web client's `StickyNotes.jsx` — embedded at the bottom of
 * the Dashboard rather than given its own destination, exactly where the web renders it.
 *
 * Every signed-in user sees every note; only the note's creator or an admin may edit or delete
 * one. [canManage] below is a UX hint only — the real gate is Postgres RLS
 * (`supabase/migrations/0023_dashboard_notes_direct_rls.sql`), which also pins `created_by_name`
 * server-side, so that field is only ever read back from the record, never assumed from the
 * local user.
 */
@Composable
private fun DashboardNotesSection(
    notes: List<CapRecord>,
    clients: List<CapRecord>,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    delete: (String, String, String) -> Unit,
    onOpen: (String) -> Unit
) {
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CapRecord?>(null) }
    var deleting by remember { mutableStateOf<CapRecord?>(null) }
    val clientsById = clients.associateBy { it.id }
    val nextColor = noteColorKeys[notes.size % noteColorKeys.size]

    CapCard {
        CapSectionHeader(
            title = "Notes",
            action = {
                TextButton(onClick = { adding = true }) {
                    Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(Spacing.xs))
                    Text("Add note", style = MaterialTheme.typography.labelMedium)
                }
            }
        )
        if (notes.isEmpty()) {
            CapEmptyState(
                "No notes yet. Add a quick reminder — visible to the whole team.",
                modifier = Modifier.fillMaxWidth().wrapContentHeight()
            )
        } else {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                notes.forEach { note ->
                    DashboardNoteCard(
                        note = note,
                        client = clientsById[note.text("client_id")],
                        canManage = sameRecordId(note.fields["created_by"], user.id) ||
                            user.role.equals("admin", ignoreCase = true),
                        onEdit = { editing = note },
                        onDelete = { deleting = note },
                        onOpenClient = { clientId -> onOpen(CapNavRoute.ClientDetail.of(clientId)) }
                    )
                }
            }
        }
    }

    if (adding) {
        NoteDialog(initial = null, clients = clients, onDismiss = { adding = false }) { content, clientId ->
            // `created_by` must be sent explicitly: the insert policy is
            // `with check (created_by = auth.uid())`, not a server-side default.
            save(
                "dashboard_notes",
                null,
                mapOf(
                    "created_by" to user.id,
                    "content" to content,
                    "color" to nextColor,
                    "client_id" to clientId
                ),
                "Note"
            )
            adding = false
        }
    }
    editing?.let { note ->
        NoteDialog(initial = note, clients = clients, onDismiss = { editing = null }) { content, _ ->
            // Content only, matching the web client — `color`/`client_id`/`created_by_name` are
            // never re-sent on an edit.
            save("dashboard_notes", note.id, mapOf("content" to content), "Note")
            editing = null
        }
    }
    deleting?.let { note ->
        CapConfirmDialog(
            title = "Delete note?",
            message = "This note will be removed for everyone on the team.",
            confirmLabel = "Delete",
            onConfirm = { delete("dashboard_notes", note.id, "Note"); deleting = null },
            onDismiss = { deleting = null }
        )
    }
}

@Composable
private fun DashboardNoteCard(
    note: CapRecord,
    client: CapRecord?,
    canManage: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onOpenClient: (String) -> Unit
) {
    val accent = noteAccentColor(note.text("color"))
    val author = note.text("created_by_name").ifBlank { "Someone" }
    val date = shortNoteDate(note.text("created_at"))

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.14f)),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.45f))
    ) {
        Column(Modifier.fillMaxWidth().padding(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(
                note.text("content").ifBlank { "Empty note" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 8,
                overflow = TextOverflow.Ellipsis
            )
            if (client != null) {
                NoteClientBadge(
                    name = client.text("company_name").ifBlank { "Linked client" },
                    onClick = { onOpenClient(client.id) }
                )
            }
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Text(
                    listOfNotNull(author, date).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (canManage) {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Outlined.Edit, "Edit note", Modifier.size(20.dp))
                    }
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Outlined.DeleteOutline,
                            "Delete note",
                            Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

/** The "linked to a client" chip. Uses the Primary tint rather than the note's own colour so it
 *  stays legible on all four note backgrounds, matching the web client's decision. */
@Composable
private fun NoteClientBadge(name: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Row(
        modifier = modifier
            .clip(MaterialTheme.shapes.small)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Icon(
            Icons.Outlined.Business,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Text(
            name,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/**
 * Add/edit form for a note. On edit only the content is offered, because the update path sends
 * nothing else — showing a client picker there would imply a change that would never be saved.
 */
@Composable
private fun NoteDialog(
    initial: CapRecord?,
    clients: List<CapRecord>,
    onDismiss: () -> Unit,
    onSave: (content: String, clientId: String?) -> Unit
) {
    var content by remember(initial) { mutableStateOf(initial?.text("content").orEmpty()) }
    var linkedClientId by remember(initial) { mutableStateOf("") }
    var picking by remember(initial) { mutableStateOf(false) }
    var clientQuery by remember(initial) { mutableStateOf("") }

    val trimmed = content.trim()
    val tooLong = content.length > NOTE_CONTENT_MAX_LENGTH
    val linkedClient = clients.firstOrNull { it.id == linkedClientId }
    val matches = clients
        .filter { clientQuery.isBlank() || it.text("company_name").contains(clientQuery, ignoreCase = true) }
        .take(6)

    EditDialog(
        title = if (initial == null) "Add note" else "Edit note",
        onDismiss = onDismiss,
        valid = trimmed.isNotEmpty() && !tooLong,
        onSave = { onSave(trimmed, linkedClientId.ifBlank { null }) }
    ) {
        CapTextField(
            label = "Note",
            value = content,
            onValueChange = { content = it },
            placeholder = "Type a note…",
            required = true,
            singleLine = false,
            errorMessage = if (tooLong) {
                "Notes are limited to $NOTE_CONTENT_MAX_LENGTH characters (currently ${content.length})."
            } else {
                null
            }
        )

        if (initial == null) {
            when {
                linkedClient != null -> Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    NoteClientBadge(
                        name = linkedClient.text("company_name").ifBlank { "Linked client" },
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    TextButton(onClick = { linkedClientId = "" }) { Text("Remove") }
                }

                picking -> {
                    CapTextField(
                        label = "Search clients",
                        value = clientQuery,
                        onValueChange = { clientQuery = it }
                    )
                    if (matches.isEmpty()) {
                        Text(
                            if (clients.isEmpty()) "No clients available to link." else "No clients match your search.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        // A plain Column, not a LazyColumn: this sits inside EditDialog's own
                        // vertical scroll, and the match list is capped at 6.
                        Column(Modifier.fillMaxWidth()) {
                            matches.forEach { client ->
                                CapListItem(
                                    title = client.text("company_name").ifBlank { "Unnamed client" },
                                    onClick = {
                                        linkedClientId = client.id
                                        picking = false
                                        clientQuery = ""
                                    }
                                )
                            }
                        }
                    }
                    TextButton(onClick = { picking = false; clientQuery = "" }) { Text("Cancel") }
                }

                else -> CapSecondaryButton(text = "Link a client (optional)", onClick = { picking = true })
            }
        }
    }
}

@Composable
private fun ClientsScreen(
    data: RecordsState,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onOpen: (String) -> Unit
) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    var clientDialog by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }

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
                        onClick = { onOpen(CapNavRoute.ClientDetail.of(client.id)) }
                    )
                }
            }
        }
        if (user.hasPermission("clients.create")) FloatingActionButton({ clientDialog = true }, Modifier.align(Alignment.BottomEnd).padding(Spacing.md)) { Icon(Icons.Outlined.PersonAdd, "Add client") }
    }
    if (clientDialog) ClientDialog({ clientDialog = false }) { fields -> save("clients", null, fields, "Client"); clientDialog = false }
}

@Composable
private fun ClientSummary(client: CapRecord, machines: List<CapRecord>) {
    CapListItem(
        title = client.text("company_name").ifBlank { "Unnamed client" },
        subtitle = client.text("contact_person").ifBlank { "No contact person" },
        trailing = {
            CapStatusBadge(
                "${machines.size} ${if (machines.size == 1) "machine" else "machines"}",
                StatusTone.Neutral
            )
        }
    )
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
    onDelete: () -> Unit
) {
    var machineDialog by remember { mutableStateOf(false) }
    var editMachine by remember { mutableStateOf<CapRecord?>(null) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val openJobs = jobs.filter { it.text("status") !in closedJobStatuses }
    val recentServices = services.sortedByDescending { it.text("service_date") }.take(5)
    val machinesById = machines.associateBy { it.id }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            client.text("company_name").ifBlank { "Unnamed client" },
                            style = MaterialTheme.typography.headlineSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        if (user.hasPermission("clients.delete")) {
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(
                                    Icons.Outlined.DeleteOutline,
                                    "Delete client",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                client.text("contact_person").ifBlank { null }?.let { "Contact" to it },
                                client.text("phone").ifBlank { null }?.let { "Phone" to it },
                                client.text("email").ifBlank { null }?.let { "Email" to it },
                                client.text("address").ifBlank { null }?.let { "Address" to it },
                                client.text("notes").ifBlank { null }?.let { "Notes" to it }
                            ).forEach { (label, value) -> CapDetailField(label, value) }
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
                                    ).joinToString(" · ").ifBlank { null }
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
                                    ).joinToString(" · ").ifBlank { null }
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
    if (showDeleteConfirm) {
        CapConfirmDialog(
            title = "Delete client?",
            message = "This will permanently delete ${client.text("company_name").ifBlank { "this client" }} and all its machines.",
            confirmLabel = "Delete",
            onConfirm = { showDeleteConfirm = false; onDelete() },
            onDismiss = { showDeleteConfirm = false }
        )
    }
}

@Composable
private fun MachinesScreen(
    data: RecordsState,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onOpen: (String) -> Unit
) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    var creating by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val clientNames = clients.associate { it.id to it.text("company_name") }

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
                    // The add-machine FAB is hidden until a client exists (a machine must belong
                    // to one), so the empty state has to say why rather than leave a dead end.
                    CapEmptyState(
                        when {
                            machines.isNotEmpty() -> "No machines match your search."
                            clients.isEmpty() -> "No clients yet. Add a client before adding machines."
                            else -> "No machines yet. Add the first machine."
                        },
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
                        onClick = { onOpen(CapNavRoute.MachineDetail.of(machine.id)) }
                    )
                }
            }
        }
        if (user.hasPermission("machines.create") && clients.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(Spacing.md)) { Icon(Icons.Outlined.Add, "Add machine") }
    }
    if (creating) MachineDialog(clients, null, clients.firstOrNull()?.id.orEmpty(), { creating = false }) { save("machines", null, it, "Machine"); creating = false }
}

@Composable
private fun MachineDetailScreen(
    machine: CapRecord,
    clients: List<CapRecord>,
    services: List<CapRecord>,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit
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
                            ).forEach { (label, value) -> CapDetailField(label, value) }
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
                                    ).joinToString(" · ").ifBlank { null }
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
    vm: MainViewModel,
    onOpen: (String) -> Unit,
    onEdit: () -> Unit
) {
    // Same due-state badge the Calendar row showed, so the state cannot silently change meaning
    // between the agenda list and the record it opened.
    val (today, weekEnd, monthEnd) = remember { dueDateBounds() }
    val dueDate = service.text("next_service_due")
    val dueState = dueDate.ifBlank { null }?.let {
        dueBadge(
            dueBucketOf(
                dueDate = it,
                completed = service.text("status").equals("completed", ignoreCase = true),
                today = today,
                weekEnd = weekEnd,
                monthEnd = monthEnd
            )
        )
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Text(
                            machineTitle(machine),
                            style = MaterialTheme.typography.headlineSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        dueState?.let { (label, tone) -> CapStatusBadge(label, tone) }
                    }
                    client?.text("company_name")?.ifBlank { null }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                service.text("status").ifBlank { null }?.let { "Status" to it },
                                machine?.text("serial_number")?.ifBlank { null }?.let { "Serial number" to it },
                                machine?.text("refrigerant_type")?.ifBlank { null }?.let { "Refrigerant" to it },
                                service.text("service_date").ifBlank { null }?.let { "Service date" to it },
                                service.text("technician_name").ifBlank { null }?.let { "Technician" to it },
                                service.text("work_performed").ifBlank { null }?.let { "Work performed" to it },
                                service.text("findings").ifBlank { null }?.let { "Findings" to it },
                                service.text("notes").ifBlank { null }?.let { "Notes" to it },
                                service.text("next_service_due").ifBlank { null }?.let { "Next service due" to it }
                            ).forEach { (label, value) -> CapDetailField(label, value) }
                        }
                    }
                    val photos = stringList(service.fields["photos"])
                    if (photos.isNotEmpty()) {
                        CapCard {
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                CapSectionHeader("Photos")
                                SignedPhotoStrip(photos, vm)
                            }
                        }
                    }
                    Column(
                        Modifier.fillMaxWidth().padding(top = Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        if (machine != null && user.hasPermission(permissionFor("Machines"))) {
                            CapSecondaryButton(text = "View machine", onClick = { onOpen(CapNavRoute.MachineDetail.of(machine.id)) })
                        }
                        if (client != null && user.hasPermission(permissionFor("Clients"))) {
                            CapSecondaryButton(text = "View client", onClick = { onOpen(CapNavRoute.ClientDetail.of(client.id)) })
                        }
                        if (user.hasPermission("services.edit")) {
                            CapSecondaryButton(text = "Edit", onClick = onEdit)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Read-only display of already-uploaded record photos (E2 Photo Upload): [paths] are PERMANENT
 * Storage paths (service_records.photos / job_cards.arrival_photos), never a signed URL. A
 * fresh signed URL is resolved per path on composition and held only in memory for display --
 * never persisted back into the record. Shared by [ServiceRecordDetailScreen]/[JobDetailScreen]
 * rather than duplicated.
 */
@Composable
private fun SignedPhotoStrip(paths: List<String>, vm: MainViewModel) {
    var urls by remember(paths) { mutableStateOf<Map<String, String>>(emptyMap()) }
    var resolving by remember(paths) { mutableStateOf(true) }
    var viewerUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(paths) {
        resolving = true
        val resolved = mutableMapOf<String, String>()
        paths.forEach { path ->
            runCatching { vm.createPhotoSignedUrl(path) }.getOrNull()?.let { resolved[path] = it }
        }
        urls = resolved
        resolving = false
    }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        paths.forEachIndexed { index, path ->
            PhotoThumbnail(
                url = urls[path],
                resolving = resolving,
                contentDescription = "Photo ${index + 1} of ${paths.size}. Tap to view full screen.",
                onClick = { urls[path]?.let { viewerUrl = it } }
            )
        }
    }
    viewerUrl?.let { url -> CapPhotoViewerDialog(url) { viewerUrl = null } }
}

/**
 * One square record-photo thumbnail. [url] is a signed URL the caller has already resolved --
 * null while [resolving] is true, or null afterwards when signing failed. Both the
 * still-resolving and the failed case are shown explicitly rather than left as a silent blank
 * tile, and a loaded photo opens full screen in [CapPhotoViewerDialog] on tap.
 */
@Composable
private fun PhotoThumbnail(
    url: String?,
    resolving: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
    size: Dp = 88.dp,
    trailing: @Composable BoxScope.() -> Unit = {}
) {
    var failed by remember(url) { mutableStateOf(false) }
    val openable = url != null && !failed
    Box(
        Modifier
            .size(size)
            .clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .then(if (openable) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        when {
            url == null && resolving -> CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            url == null || failed -> Icon(
                Icons.Outlined.BrokenImage,
                contentDescription = "Photo unavailable",
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            else -> AsyncImage(
                model = url,
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                onState = { state -> if (state is AsyncImagePainter.State.Error) failed = true }
            )
        }
        if (openable) ViewPhotoHint()
        trailing()
    }
}

/**
 * Corner glyph marking a loaded thumbnail as openable — without it a loaded photo looks exactly
 * like a decorative image. Deliberately bottom-start: [RemovePhotoButton] occupies the top-end
 * corner on upload previews, so the two affordances never sit on top of each other. The dark
 * scrim is what keeps it legible over an arbitrary photo, same reasoning as the remove button.
 */
@Composable
private fun BoxScope.ViewPhotoHint() {
    Box(
        Modifier
            .align(Alignment.BottomStart)
            .padding(Spacing.xs)
            .size(22.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f)),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Outlined.ZoomIn,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(14.dp)
        )
    }
}

/**
 * Remove affordance overlaid on an upload-preview thumbnail. The dark scrim behind it is what
 * keeps it visible over an arbitrary photo — the previous untinted icon disappeared entirely on
 * light images. The tappable area is a 48dp circle (Material's minimum touch target) while the
 * visible scrim stays 32dp, so the target is reachable without the button covering the photo.
 */
@Composable
private fun BoxScope.RemovePhotoButton(onRemove: () -> Unit) {
    Box(
        Modifier
            .align(Alignment.TopEnd)
            .size(48.dp)
            .clip(CircleShape)
            .clickable(onClick = onRemove),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.55f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = "Remove photo",
                tint = Color.White,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/**
 * In-app full-screen photo viewer. Deliberately stays inside the app (no browser/external
 * intent) -- [url] is a short-lived signed Storage URL that must never be handed to another
 * app. Dismissed by the close button, a tap anywhere on the backdrop, or the system back
 * gesture.
 */
@Composable
private fun CapPhotoViewerDialog(url: String, onDismiss: () -> Unit) {
    var failed by remember(url) { mutableStateOf(false) }
    var loading by remember(url) { mutableStateOf(true) }
    val backdropInteraction = remember { MutableInteractionSource() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.94f))
                .clickable(interactionSource = backdropInteraction, indication = null, onClick = onDismiss),
            contentAlignment = Alignment.Center
        ) {
            if (failed) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Icon(Icons.Outlined.BrokenImage, contentDescription = null, Modifier.size(40.dp), tint = Color.White)
                    Text(
                        "This photo could not be loaded.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White
                    )
                }
            } else {
                AsyncImage(
                    model = url,
                    contentDescription = "Photo, full screen",
                    modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(Spacing.md),
                    contentScale = ContentScale.Fit,
                    onState = { state ->
                        loading = state is AsyncImagePainter.State.Loading
                        failed = state is AsyncImagePainter.State.Error
                    }
                )
                if (loading) CircularProgressIndicator(color = Color.White)
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.TopEnd).safeDrawingPadding().padding(Spacing.sm)
            ) {
                Icon(Icons.Outlined.Close, contentDescription = "Close photo", tint = Color.White)
            }
        }
    }
}

/** The fixed "Work performed" checklist that replaced the free-text field, matching the web list
 *  in `frontend/src/lib/serviceWorkItems.js` exactly — both clients store the ticked items as one
 *  comma-joined string in `service_records.work_performed`, which stays a plain text column.
 *  Anything else the technician did belongs in the record's findings/notes fields, which the
 *  service detail view already displays — note that neither Android service form currently offers
 *  an input for them (a web-parity gap, deliberately not addressed here). */
private val SERVICE_WORK_ITEMS = listOf(
    "Replaced Filter Dryer",
    "Replaced Vacuum Pump Oil",
    "Calibrated Pressure Sensor",
    "Calibrated Scales",
    "Cleaned Machine"
)

/** Joins in [SERVICE_WORK_ITEMS] order, so the stored string is canonical no matter what order
 *  the boxes were ticked in. */
private fun joinWorkPerformed(selected: Map<String, Boolean>): String =
    SERVICE_WORK_ITEMS.filter { selected[it] == true }.joinToString(", ")

/**
 * Seeds the checklist from a stored value. Only an exact combination of known items is recognised
 * (the same rule as the web helper): free text written before the checklist existed parses to an
 * empty selection, so editing such a record starts with nothing ticked. The old text is left in
 * the database untouched unless the user saves over it.
 */
private fun parseWorkPerformed(value: String?): Map<String, Boolean> {
    if (value.isNullOrBlank()) return emptyMap()
    val parts = value.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    val allKnown = parts.isNotEmpty() && parts.all { it in SERVICE_WORK_ITEMS }
    return if (allKnown) parts.associateWith { true } else emptyMap()
}

/**
 * The tick boxes themselves, shared by [LogNewServiceScreen] and [ServiceDialog]. The toggle lives
 * on the row rather than the [Checkbox] so the whole row is a single 48dp accessible target — the
 * same idiom as [PermissionRow].
 */
@Composable
private fun WorkPerformedChecklist(
    selected: Map<String, Boolean>,
    onSelectedChange: (Map<String, Boolean>) -> Unit
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text("Work performed", style = MaterialTheme.typography.titleSmall)
        SERVICE_WORK_ITEMS.forEach { item ->
            val checked = selected[item] == true
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .toggleable(
                        value = checked,
                        role = Role.Checkbox,
                        onValueChange = { onSelectedChange(selected + (item to it)) }
                    )
                    .defaultMinSize(minHeight = 48.dp)
                    .padding(vertical = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Checkbox(checked = checked, onCheckedChange = null)
                Text(
                    item,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
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
    vm: MainViewModel,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember { mutableStateOf(clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(clientId) { mutableStateOf(availableMachines.firstOrNull()?.id.orEmpty()) }
    var date by remember { mutableStateOf(today) }
    var technician by remember { mutableStateOf("") }
    var workItems by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var nextServiceDue by remember { mutableStateOf("") }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }

    // E2 Photo Upload (service_records.photos, record-scoped permanent Storage paths per
    // migration 0024 -- see SupabaseStorage.kt). `recordId` is created lazily, the first time
    // the technician actually adds a photo (not proactively on machine selection, unlike the
    // web stepper modal -- this screen has no distinct "steps" to hook a create into, so the
    // photo action itself is the natural trigger). `photos` holds PERMANENT Storage PATHS,
    // never a signed URL; `photoUrls` holds freshly-generated signed URLs purely for on-screen
    // preview, resolved once per upload and never persisted.
    var recordId by remember { mutableStateOf<String?>(null) }
    var photos by remember { mutableStateOf<List<String>>(emptyList()) }
    var photoUrls by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var uploadingPhoto by remember { mutableStateOf(false) }
    var photoError by remember { mutableStateOf<String?>(null) }
    var viewerUrl by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun uploadPickedPhoto(uri: Uri) {
        if (machineId.isBlank()) {
            photoError = "Please select a machine before adding photos."
            return
        }
        uploadingPhoto = true
        photoError = null
        try {
            val id = recordId ?: vm.createRecordNow("service_records", mapOf("machine_id" to machineId)).also { recordId = it }
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalStateException("Could not read the selected photo.")
            val contentType = context.contentResolver.getType(uri) ?: "image/jpeg"
            val fileName = "photo-${System.currentTimeMillis()}.${contentType.substringAfterLast('/', "jpg")}"
            val path = vm.uploadRecordPhoto(RecordPhotoNamespace.SERVICE_RECORD, id, bytes, contentType, fileName)
            val next = photos + path
            vm.updateRecordNow("service_records", id, mapOf("photos" to next))
            photos = next
            val signedUrl = runCatching { vm.createPhotoSignedUrl(path) }.getOrNull()
            if (signedUrl != null) photoUrls = photoUrls + (path to signedUrl)
        } catch (error: Exception) {
            photoError = error.message ?: "Photo upload failed. Please try again."
        }
        uploadingPhoto = false
    }

    fun removePickedPhoto(path: String) {
        val id = recordId ?: return
        val next = photos.filter { it != path }
        scope.launch {
            try {
                vm.updateRecordNow("service_records", id, mapOf("photos" to next))
                photos = next
            } catch (error: Exception) {
                photoError = error.message ?: "Could not remove that photo. Please try again."
                return@launch
            }
            runCatching { vm.deleteRecordPhoto(path) } // best-effort, must not undo the DB update above
        }
    }

    val pickPhotoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { uploadPickedPhoto(uri) }
    }

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
        CapBackRow("Back to dashboard", onBack)
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
                    required = true,
                    errorMessage = if (machineError) "Machine is required." else null
                )
                CapDateField(
                    label = "Service date",
                    value = date,
                    onValueChange = { date = it },
                    required = true,
                    errorMessage = if (dateError) "Service date is required." else null
                )
                CapTextField(label = "Technician", value = technician, onValueChange = { technician = it })
                WorkPerformedChecklist(selected = workItems, onSelectedChange = { workItems = it })
                CapDateField(label = "Next service due", value = nextServiceDue, onValueChange = { nextServiceDue = it })
            }
        }
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Photos")
                photoError?.let { CapInlineError(it) }
                if (photos.isEmpty()) {
                    Text(
                        if (machineId.isBlank()) "Select a machine to start adding photos."
                        else "No photos added yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        photos.forEachIndexed { index, path ->
                            PhotoThumbnail(
                                url = photoUrls[path],
                                resolving = false,
                                contentDescription = "Photo ${index + 1} of ${photos.size}. Tap to view full screen.",
                                onClick = { photoUrls[path]?.let { viewerUrl = it } },
                                size = 80.dp,
                                trailing = { RemovePhotoButton { removePickedPhoto(path) } }
                            )
                        }
                    }
                }
                // Deliberately outside the horizontally scrolling strip above: inside it, the
                // primary "Add Photo" action scrolled off-screen once a few photos existed.
                CapOutlinedButton(
                    text = "Add Photo",
                    onClick = { pickPhotoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = machineId.isNotBlank(),
                    loading = uploadingPhoto
                )
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
                    recordId,
                    mapOf(
                        "machine_id" to machineId,
                        "service_date" to date,
                        "technician_name" to technician.trim(),
                        "work_performed" to joinWorkPerformed(workItems),
                        "next_service_due" to nextServiceDue.trim()
                    ),
                    "Service record"
                )
            },
            enabled = !submitting && machineId.isNotBlank() && date.isNotBlank(),
            loading = submitting
        )
    }
    viewerUrl?.let { url -> CapPhotoViewerDialog(url) { viewerUrl = null } }
}

@Composable
private fun BookInScreen(
    clients: List<CapRecord>,
    machines: List<CapRecord>,
    jobs: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    actionMessage: String?,
    vm: MainViewModel,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember { mutableStateOf(clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(clientId) { mutableStateOf(availableMachines.firstOrNull()?.id.orEmpty()) }
    var jobNumber by remember { mutableStateOf(newJobNumber()) }
    var date by remember { mutableStateOf(today) }
    var technician by remember { mutableStateOf("") }
    var machineType by remember { mutableStateOf("") }
    var fault by remember { mutableStateOf("") }
    var accessories by remember { mutableStateOf("") }
    var arrivalCondition by remember { mutableStateOf("") }
    var conditionNotes by remember { mutableStateOf("") }
    var attemptedSubmit by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }

    // E2 Photo Upload (job_cards.arrival_photos) -- see LogNewServiceScreen for the identical
    // rationale. `recordId` is created lazily the first time the technician adds an arrival
    // photo, requiring both client and machine to already be selected.
    var recordId by remember { mutableStateOf<String?>(null) }
    var photos by remember { mutableStateOf<List<String>>(emptyList()) }
    var photoUrls by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var uploadingPhoto by remember { mutableStateOf(false) }
    var photoError by remember { mutableStateOf<String?>(null) }
    var viewerUrl by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun uploadPickedPhoto(uri: Uri) {
        if (clientId.isBlank() || machineId.isBlank()) {
            photoError = "Please select a client and machine before adding photos."
            return
        }
        uploadingPhoto = true
        photoError = null
        try {
            val id = recordId ?: vm.createRecordNow(
                "job_cards",
                mapOf("client_id" to clientId, "machine_id" to machineId)
            ).also { recordId = it }
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalStateException("Could not read the selected photo.")
            val contentType = context.contentResolver.getType(uri) ?: "image/jpeg"
            val fileName = "arrival-${System.currentTimeMillis()}.${contentType.substringAfterLast('/', "jpg")}"
            val path = vm.uploadRecordPhoto(RecordPhotoNamespace.JOB_CARD, id, bytes, contentType, fileName)
            val next = photos + path
            vm.updateRecordNow("job_cards", id, mapOf("arrival_photos" to next))
            photos = next
            val signedUrl = runCatching { vm.createPhotoSignedUrl(path) }.getOrNull()
            if (signedUrl != null) photoUrls = photoUrls + (path to signedUrl)
        } catch (error: Exception) {
            photoError = error.message ?: "Photo upload failed. Please try again."
        }
        uploadingPhoto = false
    }

    fun removePickedPhoto(path: String) {
        val id = recordId ?: return
        val next = photos.filter { it != path }
        scope.launch {
            try {
                vm.updateRecordNow("job_cards", id, mapOf("arrival_photos" to next))
                photos = next
            } catch (error: Exception) {
                photoError = error.message ?: "Could not remove that photo. Please try again."
                return@launch
            }
            runCatching { vm.deleteRecordPhoto(path) }
        }
    }

    val pickPhotoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { uploadPickedPhoto(uri) }
    }

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

    // `recordId` is excluded because the draft job card this screen may have already created for
    // photo uploads carries the same machine_id — it is the job being booked in, not a previous one.
    val previousJobs = if (machineId.isBlank()) emptyList<CapRecord>() else jobs
        .filter { sameRecordId(it.fields["machine_id"], machineId) && it.id != recordId }
        .sortedByDescending { it.text("date_received") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        CapBackRow("Back to dashboard", onBack)
        CapScreenHeader(title = "Book In Machine", subtitle = "Create a new job card for an incoming machine")
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Job Information")
                CapDropdownField(
                    label = "Client",
                    options = clients.map { it.id to it.text("company_name") },
                    selectedKey = clientId,
                    onSelected = { selected ->
                        clientId = selected
                        machineId = machines.firstOrNull { sameRecordId(it.fields["client_id"], selected) }?.id.orEmpty()
                    },
                    required = true,
                    errorMessage = if (clientError) "Client is required." else null
                )
                CapDropdownField(
                    label = "Machine",
                    options = availableMachines.map { it.id to machineTitle(it) },
                    selectedKey = machineId,
                    onSelected = { machineId = it },
                    required = true,
                    errorMessage = if (machineError) "Machine is required." else null
                )
                CapTextField(label = "Job number", value = jobNumber, onValueChange = { jobNumber = it })
                CapDateField(
                    label = "Date received",
                    value = date,
                    onValueChange = { date = it },
                    required = true
                )
                CapTextField(label = "Technician", value = technician, onValueChange = { technician = it })
                CapTextField(
                    label = "Machine type",
                    value = machineType,
                    onValueChange = { machineType = it },
                    placeholder = "e.g. Wigam, Ecotechnics, Texa"
                )
            }
        }
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Problem Report")
                CapTextField(
                    label = "Fault description",
                    value = fault,
                    onValueChange = { fault = it },
                    required = true,
                    singleLine = false,
                    errorMessage = if (faultError) "Fault description is required." else null
                )
                CapTextField(
                    label = "Accessories / items received",
                    value = accessories,
                    onValueChange = { accessories = it },
                    placeholder = "e.g. Remote control, power cable, manual",
                    singleLine = false
                )
            }
        }
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Machine Condition on Arrival")
                CapDropdownField(
                    label = "Condition",
                    options = arrivalConditions.map { it to it },
                    selectedKey = arrivalCondition,
                    onSelected = { arrivalCondition = it }
                )
                CapTextField(
                    label = "Condition notes",
                    value = conditionNotes,
                    onValueChange = { conditionNotes = it },
                    placeholder = "Any visible damage or notes",
                    singleLine = false
                )
            }
        }
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Arrival Photos")
                photoError?.let { CapInlineError(it) }
                if (photos.isEmpty()) {
                    Text(
                        if (clientId.isBlank() || machineId.isBlank()) "Select a client and machine to start adding photos."
                        else "No arrival photos added yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        photos.forEachIndexed { index, path ->
                            PhotoThumbnail(
                                url = photoUrls[path],
                                resolving = false,
                                contentDescription = "Arrival photo ${index + 1} of ${photos.size}. Tap to view full screen.",
                                onClick = { photoUrls[path]?.let { viewerUrl = it } },
                                size = 80.dp,
                                trailing = { RemovePhotoButton { removePickedPhoto(path) } }
                            )
                        }
                    }
                }
                // See LogNewServiceScreen: the action stays outside the scrolling strip so it
                // cannot scroll off-screen once several photos have been added.
                CapOutlinedButton(
                    text = "Add Photo",
                    onClick = { pickPhotoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = clientId.isNotBlank() && machineId.isNotBlank(),
                    loading = uploadingPhoto
                )
            }
        }
        CapCard {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                CapSectionHeader("Previous Jobs for This Machine")
                if (previousJobs.isEmpty()) {
                    Text(
                        if (machineId.isBlank()) "Select a machine to see its job history."
                        else "No previous job cards for this machine.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    previousJobs.forEach { job ->
                        CapListItem(
                            title = job.text("job_number").ifBlank { "Job card" },
                            subtitle = listOfNotNull(
                                job.text("date_received").ifBlank { null },
                                job.text("technician_name").ifBlank { null },
                                job.text("fault_description").ifBlank { null }
                            ).joinToString(" · ").ifBlank { null },
                            trailing = { CapStatusBadge(job.text("status").ifBlank { "Booked In" }, jobStatusTone(job.text("status"))) },
                            showNavArrow = true,
                            onClick = { onOpen(CapNavRoute.JobDetail.of(job.id)) }
                        )
                    }
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
                    recordId,
                    mapOf(
                        "job_number" to jobNumber.trim().ifBlank { newJobNumber() },
                        "client_id" to clientId,
                        "machine_id" to machineId,
                        "status" to "Booked In",
                        "date_received" to date,
                        "machine_type" to machineType.trim(),
                        "fault_description" to fault.trim(),
                        "accessories_received" to accessories.trim(),
                        "arrival_condition" to arrivalCondition,
                        "arrival_condition_notes" to conditionNotes.trim(),
                        "technician_name" to technician.trim()
                    ),
                    "Job card"
                )
            },
            enabled = !submitting && clientId.isNotBlank() && machineId.isNotBlank() && fault.isNotBlank(),
            loading = submitting
        )
    }
    viewerUrl?.let { url -> CapPhotoViewerDialog(url) { viewerUrl = null } }
}

@Composable
private fun ServicesScreen(
    data: RecordsState,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onOpen: (String) -> Unit
) {
    val machines = data.collection("machines")
    val machinesById = machines.associateBy { it.id }
    val services = data.collection("service_records")
    var creating by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }

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
                        when {
                            services.isNotEmpty() -> "No service records match your search."
                            machines.isEmpty() -> "No machines yet. Add a machine before logging a service."
                            else -> "No service records yet."
                        },
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
                        ).joinToString(" · ").ifBlank { null },
                        showNavArrow = true,
                        onClick = { onOpen(CapNavRoute.ServiceRecordDetail.of(service.id)) }
                    )
                }
            }
        }
        if (user.hasPermission("services.create") && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(Spacing.md)) { Icon(Icons.Outlined.Add, "Add service") }
    }
    if (creating) ServiceDialog(machines, null, { creating = false }) { save("service_records", null, it, "Service record"); creating = false }
}

/** Matches BookIn.jsx's `CONDITIONS` verbatim — the web writes these exact strings to `arrival_condition`. */
private val arrivalConditions = listOf("Good", "Fair", "Poor", "Damaged")

private fun newJobNumber(): String = "JOB-${System.currentTimeMillis().toString().takeLast(6)}"

private fun jobStatusTone(status: String): StatusTone = when (status) {
    "Booked In" -> StatusTone.Neutral
    "Open", "In Progress" -> StatusTone.Info
    "Completed" -> StatusTone.Success
    "Ready to Invoice" -> StatusTone.Warning
    else -> StatusTone.Neutral
}

@Composable
private fun JobsScreen(
    data: RecordsState,
    user: CapUser,
    save: (String, String?, Map<String, Any?>, String) -> Unit,
    onOpen: (String) -> Unit,
    initialFilter: String = ""
) {
    val clients = data.collection("clients")
    val machines = data.collection("machines")
    val jobs = data.collection("job_cards")
    var creating by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    // Seeded from the route argument (the Dashboard's "Open Jobs" tile arrives with it set), but
    // still fully user-controllable from the chips below — an arrived-at filter is never a trap.
    var openOnly by remember(initialFilter) { mutableStateOf(initialFilter == CapNavRoute.Jobs.FILTER_OPEN) }
    val clientNames = clients.associate { it.id to it.text("company_name") }

    val filteredJobs = jobs.filter { job ->
        val matchesStatus = !openOnly || job.text("status") !in closedJobStatuses
        val matchesQuery = query.isBlank() ||
            job.text("job_number").contains(query, ignoreCase = true) ||
            clientNames[job.text("client_id")].orEmpty().contains(query, ignoreCase = true) ||
            job.text("fault_description").contains(query, ignoreCase = true)
        matchesStatus && matchesQuery
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search job number, client, or fault",
                    modifier = Modifier.fillMaxWidth()
                )
            }
            item {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = Spacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    FilterChip(
                        selected = !openOnly,
                        onClick = { openOnly = false },
                        label = { Text("All jobs", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    )
                    FilterChip(
                        selected = openOnly,
                        onClick = { openOnly = true },
                        label = { Text("Open only", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    )
                }
            }
            if (filteredJobs.isEmpty()) {
                item {
                    CapEmptyState(
                        when {
                            jobs.isNotEmpty() && openOnly && query.isBlank() -> "No open job cards — everything is completed or collected."
                            jobs.isNotEmpty() -> "No job cards match your search."
                            clients.isEmpty() || machines.isEmpty() -> "No job cards yet. Add a client and a machine first."
                            else -> "No job cards yet. Add the first job."
                        },
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
                        ).joinToString(" · ").ifBlank { null },
                        trailing = { CapStatusBadge(job.text("status").ifBlank { "Booked In" }, jobStatusTone(job.text("status"))) },
                        showNavArrow = true,
                        onClick = { onOpen(CapNavRoute.JobDetail.of(job.id)) }
                    )
                }
            }
        }
        if (user.hasPermission("job_cards.create") && clients.isNotEmpty() && machines.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(Spacing.md)) { Icon(Icons.Outlined.Add, "Add job") }
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
    vm: MainViewModel,
    onDelete: () -> Unit
) {
    var editDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val client = clients.firstOrNull { it.id == job.text("client_id") }
    val machine = machines.firstOrNull { it.id == job.text("machine_id") }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
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
                                job.text("machine_type").ifBlank { null }?.let { "Machine type" to it },
                                job.text("date_received").ifBlank { null }?.let { "Date received" to it },
                                job.text("fault_description").ifBlank { null }?.let { "Fault description" to it },
                                job.text("accessories_received").ifBlank { null }?.let { "Accessories received" to it },
                                job.text("arrival_condition").ifBlank { null }?.let { "Condition on arrival" to it },
                                job.text("arrival_condition_notes").ifBlank { null }?.let { "Condition notes" to it },
                                job.text("technician_name").ifBlank { null }?.let { "Technician" to it }
                            ).forEach { (label, value) -> CapDetailField(label, value) }
                        }
                    }
                    val arrivalPhotos = stringList(job.fields["arrival_photos"])
                    if (arrivalPhotos.isNotEmpty()) {
                        CapCard {
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                CapSectionHeader("Arrival Photos")
                                SignedPhotoStrip(arrivalPhotos, vm)
                            }
                        }
                    }
                    Row(Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        if (user.hasPermission("job_cards.edit")) {
                            Box(Modifier.weight(1f)) {
                                CapSecondaryButton(text = "Edit", onClick = { editDialog = true })
                            }
                        }
                        if (user.hasPermission("job_cards.delete")) {
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(
                                    Icons.Outlined.DeleteOutline,
                                    "Delete job card",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    if (editDialog) JobDialog(clients, machines, job, { editDialog = false }) { fields -> save("job_cards", job.id, fields, "Job card"); editDialog = false }
    if (showDeleteConfirm) {
        CapConfirmDialog(
            title = "Delete job card?",
            message = "This will permanently delete job card ${job.text("job_number").ifBlank { "this job card" }} and all its line items.",
            confirmLabel = "Delete",
            onConfirm = { showDeleteConfirm = false; onDelete() },
            onDismiss = { showDeleteConfirm = false }
        )
    }
}

/**
 * Range narrowing for [CalendarScreen] — the phone-shaped equivalent of the web calendar's
 * week/month view switcher (the web itself drops to a plain agenda list under 640px, so there is
 * no month grid to match here). Each range is an inclusive upper bound on `next_service_due`;
 * anything already overdue falls under every bound, so it never disappears behind a filter.
 */
private enum class DueRange(val label: String) { Week("This week"), Month("This month"), All("All") }

/** Agenda sections, rendered in declaration order. */
private enum class DueBucket(val title: String) {
    Overdue("Overdue"),
    Today("Today"),
    ThisWeek("This week"),
    ThisMonth("Later this month"),
    Later("Later"),
    Completed("Completed")
}

/**
 * `today`, end of the current week, and end of the current month as `yyyy-MM-dd` — the same
 * format `next_service_due` is stored in, so every comparison below is a plain string compare.
 * The month bound is held at or after the week bound so that widening from [DueRange.Week] to
 * [DueRange.Month] can never show fewer services (a week straddling a month boundary otherwise
 * ends after the month does).
 */
private fun dueDateBounds(): Triple<String, String, String> {
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val today = format.format(Date())
    val weekEnd = format.format(
        java.util.Calendar.getInstance().apply {
            val dayIndex = (get(java.util.Calendar.DAY_OF_WEEK) - firstDayOfWeek + 7) % 7
            add(java.util.Calendar.DAY_OF_YEAR, 6 - dayIndex)
        }.time
    )
    val monthEnd = format.format(
        java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.DAY_OF_MONTH, getActualMaximum(java.util.Calendar.DAY_OF_MONTH))
        }.time
    )
    return Triple(today, weekEnd, maxOf(monthEnd, weekEnd))
}

/**
 * Mirrors the web calendar's `eventClass`: a service already marked completed is never presented
 * as overdue, however far in the past its due date is.
 */
private fun dueBucketOf(dueDate: String, completed: Boolean, today: String, weekEnd: String, monthEnd: String): DueBucket = when {
    completed && dueDate <= today -> DueBucket.Completed
    dueDate < today -> DueBucket.Overdue
    dueDate == today -> DueBucket.Today
    dueDate <= weekEnd -> DueBucket.ThisWeek
    dueDate <= monthEnd -> DueBucket.ThisMonth
    else -> DueBucket.Later
}

private fun dueBadge(bucket: DueBucket): Pair<String, StatusTone> = when (bucket) {
    DueBucket.Completed -> "Completed" to StatusTone.Success
    DueBucket.Overdue -> "Overdue" to StatusTone.Error
    DueBucket.Today -> "Due today" to StatusTone.Warning
    DueBucket.ThisWeek -> "Due soon" to StatusTone.Warning
    DueBucket.ThisMonth, DueBucket.Later -> "Upcoming" to StatusTone.Info
}

@Composable
private fun CalendarScreen(data: RecordsState, onOpen: (String) -> Unit) {
    val machinesById = data.collection("machines").associateBy { it.id }
    val clientsById = data.collection("clients").associateBy { it.id }
    var query by remember { mutableStateOf("") }
    var range by remember { mutableStateOf(DueRange.Month) }

    val (today, weekEnd, monthEnd) = remember { dueDateBounds() }
    val rangeEnd = when (range) {
        DueRange.Week -> weekEnd
        DueRange.Month -> monthEnd
        DueRange.All -> null
    }

    val scheduled = data.collection("service_records").filter { it.text("next_service_due").isNotBlank() }
    val due = scheduled
        .filter { service -> rangeEnd == null || service.text("next_service_due") <= rangeEnd }
        .filter { service ->
            query.isBlank() ||
                machineTitle(machinesById[service.text("machine_id")]).contains(query, ignoreCase = true) ||
                clientsById[machinesById[service.text("machine_id")]?.text("client_id")]?.text("company_name").orEmpty().contains(query, ignoreCase = true)
        }
        .sortedBy { it.text("next_service_due") }

    val grouped = due.groupBy { service ->
        dueBucketOf(
            dueDate = service.text("next_service_due"),
            completed = service.text("status").equals("completed", ignoreCase = true),
            today = today,
            weekEnd = weekEnd,
            monthEnd = monthEnd
        )
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.sm), contentPadding = PaddingValues(bottom = 84.dp)) {
        item {
            CapSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search machine or client",
                modifier = Modifier.fillMaxWidth()
            )
        }
        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.xs)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                DueRange.entries.forEach { option ->
                    FilterChip(
                        selected = range == option,
                        onClick = { range = option },
                        label = { Text(option.label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    )
                }
            }
        }
        if (due.isEmpty()) {
            item {
                CapEmptyState(
                    when {
                        scheduled.isEmpty() -> "No upcoming service dates."
                        query.isNotBlank() -> "No services match your search."
                        else -> "No services due in this range. Try \"All\"."
                    },
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        } else {
            DueBucket.entries.forEach { bucket ->
                val servicesInBucket = grouped[bucket].orEmpty()
                if (servicesInBucket.isEmpty()) return@forEach
                item(key = "header-${bucket.name}") {
                    CapSectionHeader(title = "${bucket.title} (${servicesInBucket.size})")
                }
                items(servicesInBucket, key = { it.id }) { service ->
                    val machine = machinesById[service.text("machine_id")]
                    val client = clientsById[machine?.text("client_id")]
                    val (badgeLabel, badgeTone) = dueBadge(bucket)
                    CapCard {
                        CapListItem(
                            title = machineTitle(machine),
                            subtitle = listOfNotNull(
                                "Due ${service.text("next_service_due")}",
                                client?.text("company_name")?.ifBlank { null },
                                service.text("technician_name").ifBlank { null }
                            ).joinToString(" · "),
                            trailing = { CapStatusBadge(badgeLabel, badgeTone) },
                            showNavArrow = true,
                            onClick = { onOpen(CapNavRoute.ServiceRecordDetail.of(service.id)) }
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
    var query by remember { mutableStateOf("") }
    val jobs = data.collection("job_cards").filter {
        it.text("status").contains("invoice", true) || it.text("status") == "Completed" || it.text("status") == "Collected"
    }.filter {
        query.isBlank() || it.text("job_number").contains(query, ignoreCase = true)
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
        item {
            CapScreenHeader(
                title = "Invoice Queue",
                subtitle = if (jobs.isEmpty()) "No jobs pending" else "${jobs.size} jobs ready for billing"
            )
        }
        item {
            CapSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search by job number",
                modifier = Modifier.padding(bottom = Spacing.xs)
            )
        }
        if (jobs.isEmpty()) {
            item { CapEmptyState(if (query.isBlank()) "No jobs are ready for invoicing." else "No invoices match your search.", modifier = Modifier.fillMaxWidth().wrapContentHeight()) }
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
private fun KnowledgeBaseScreen(data: RecordsState, onOpen: (String) -> Unit) {
    val machines = data.collection("knowledge_machines")
    var query by remember { mutableStateOf("") }

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
            val summary = machine.text("summary").ifBlank { null }
            val cardRefrigerants = stringList(machine.fields["supported_refrigerants"])
            // The whole card is the tap target (not just the CapListItem row) so the summary and
            // refrigerant preview below are part of the same drill-in, matching the web card.
            CapCard(Modifier.clickable { onOpen(CapNavRoute.KnowledgeBaseDetail.of(machine.id)) }) {
                CapListItem(
                    title = listOfNotNull(
                        machine.text("model_name").ifBlank { null },
                        machine.text("variant").ifBlank { null }
                    ).joinToString(" ").ifBlank { "Unnamed machine" },
                    subtitle = machine.text("product_code").ifBlank { null },
                    leading = {
                        Text(
                            machine.text("manufacturer").ifBlank { "?" },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 80.dp)
                        )
                    },
                    showNavArrow = true
                )
                if (summary != null || cardRefrigerants.isNotEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = Spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        if (summary != null) {
                            Text(
                                summary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        if (cardRefrigerants.isNotEmpty()) {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                cardRefrigerants.forEach { refrigerant -> CapStatusBadge(refrigerant, StatusTone.Info) }
                            }
                        }
                    }
                }
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
    onDelete: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val canManage = user.role != "accountant"
    var viewerUrl by remember(machine.id) { mutableStateOf<String?>(null) }
    var noteTitle by remember(machine.id) { mutableStateOf("") }
    var noteContent by remember(machine.id) { mutableStateOf("") }
    var revealedCodes by remember(machine.id) { mutableStateOf(setOf<String>()) }
    var showDeleteConfirm by remember(machine.id) { mutableStateOf(false) }

    val refrigerants = stringList(machine.fields["supported_refrigerants"])
    val specifications = stringMap(machine.fields["technical_specifications"])
    val functions = stringList(machine.fields["main_functions"])

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(Spacing.md), contentPadding = PaddingValues(bottom = 84.dp)) {
            item {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    machine.text("manufacturer").ifBlank { null }?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            listOfNotNull(
                                machine.text("model_name").ifBlank { null },
                                machine.text("variant").ifBlank { null }
                            ).joinToString(" ").ifBlank { "Unnamed machine" },
                            style = MaterialTheme.typography.headlineSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        if (user.hasPermission("knowledge_base.delete")) {
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(
                                    Icons.Outlined.DeleteOutline,
                                    "Delete knowledge base entry",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                    CapCard {
                        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            listOfNotNull(
                                machine.text("product_code").ifBlank { null }?.let { "Product code" to it },
                                machine.text("category").ifBlank { null }?.let { "Category" to it },
                                machine.text("summary").ifBlank { null }?.let { "Summary" to it }
                            ).forEach { (label, value) -> CapDetailField(label, value) }
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
                            specifications.forEach { (key, value) -> CapKeyValueRow(key, value) }
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
                                    subtitle = note.text("content").ifBlank { null }
                                )
                            }
                        }
                    }
                    if (canManage) {
                        Column(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            CapTextField(label = "Title", value = noteTitle, onValueChange = { noteTitle = it }, required = true)
                            CapTextField(label = "Content", value = noteContent, onValueChange = { noteContent = it }, required = true, singleLine = false)
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
                        // Reuses the app's existing PhotoThumbnail + CapPhotoViewerDialog pair
                        // (same as SignedPhotoStrip) rather than a second photo pattern. Unlike
                        // service/job photos, knowledge_media.file_url is stored as a complete
                        // signed URL by the web uploader (frontend/src/api/supabaseApiClient.js's
                        // integrations.Core.UploadFile), not a Storage path -- so it is loaded
                        // directly and there is nothing here to sign. An expired URL simply fails
                        // to load and PhotoThumbnail shows its "unavailable" state.
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            media.forEachIndexed { index, photo ->
                                val fileUrl = photo.text("file_url").ifBlank { null }
                                val label = photo.text("caption")
                                    .ifBlank { photo.text("original_filename") }
                                    .ifBlank { "Photo ${index + 1}" }
                                Column(
                                    Modifier.width(88.dp),
                                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                                ) {
                                    PhotoThumbnail(
                                        url = fileUrl,
                                        resolving = false,
                                        contentDescription = "$label. Photo ${index + 1} of ${media.size}. Tap to view full screen.",
                                        onClick = { fileUrl?.let { viewerUrl = it } }
                                    )
                                    Text(
                                        label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
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
                                    subtitle = doc.text("original_filename").ifBlank { null },
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
    viewerUrl?.let { url -> CapPhotoViewerDialog(url) { viewerUrl = null } }
    if (showDeleteConfirm) {
        CapConfirmDialog(
            title = "Delete knowledge base entry?",
            message = "This will permanently delete ${
                listOfNotNull(machine.text("model_name").ifBlank { null }, machine.text("variant").ifBlank { null })
                    .joinToString(" ").ifBlank { "this entry" }
            } and all its notes, service codes, photos, and documents.",
            confirmLabel = "Delete",
            onConfirm = { showDeleteConfirm = false; onDelete() },
            onDismiss = { showDeleteConfirm = false }
        )
    }
}

/** Display name for a `public.users.role` value. The set of roles offered anywhere in this app is
 *  always derived from real `role_permissions` rows — this only decides how a role reads on
 *  screen, and falls back to the raw value for any role it doesn't recognise. */
private fun roleLabel(role: String): String = when (role.lowercase(Locale.US)) {
    "admin" -> "Administrator"
    "technician" -> "Technician"
    "accountant" -> "Accountant"
    "staff" -> "Staff"
    "custom" -> "Custom"
    else -> role.ifBlank { "No role" }.replaceFirstChar { it.uppercase() }
}

private fun permissionName(permission: CapRecord): String =
    permission.text("name").ifBlank { permission.text("key") }

/**
 * How a permission's current state relates to its role default — the same four states the web
 * User Management page shows (frontend/src/pages/UserAdmin.jsx), so an admin reading one screen
 * can read the other.
 */
private fun permissionStateBadge(effective: Boolean, roleDefault: Boolean): Pair<String, StatusTone> = when {
    effective && roleDefault -> "Role default" to StatusTone.Success
    !effective && !roleDefault -> "Not included" to StatusTone.Neutral
    effective -> "Added for this user" to StatusTone.Info
    else -> "Removed for this user" to StatusTone.Warning
}

/**
 * Users list. Only accounts the signed-in user is allowed to read appear here: `users_select`
 * (0002_rls_policies.sql) returns the caller's own row plus, for an admin, everyone else's — so a
 * non-admin legitimately sees a one-row list rather than an error.
 */
@Composable
private fun UsersScreen(data: RecordsState, onOpen: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    val users = data.collection("users")
    val filtered = users.filter { profile ->
        query.isBlank() ||
            profile.text("full_name").contains(query, ignoreCase = true) ||
            profile.text("email").contains(query, ignoreCase = true) ||
            roleLabel(profile.text("role")).contains(query, ignoreCase = true)
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search name, email, or role",
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs)
            )
        }
        if (filtered.isEmpty()) {
            item {
                CapEmptyState(
                    if (users.isEmpty()) "No users found." else "No users match your search.",
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        }
        items(filtered.sortedBy { it.text("full_name").ifBlank { it.text("email") }.lowercase(Locale.US) }, key = { it.id }) { profile ->
            val name = profile.text("full_name").ifBlank { profile.text("email") }.ifBlank { "Unnamed user" }
            val active = profile.fields["is_active"] as? Boolean ?: true
            val permissionCount = stringList(profile.fields["effective_permissions"]).size
            CapCard {
                CapListItem(
                    title = name,
                    subtitle = listOfNotNull(
                        profile.text("email").ifBlank { null },
                        "$permissionCount permissions"
                    ).joinToString(" · "),
                    leading = { CapUserAvatar(initialsOf(name)) },
                    trailing = {
                        Column(
                            horizontalAlignment = Alignment.End,
                            verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            CapStatusBadge(roleLabel(profile.text("role")), StatusTone.Info)
                            if (!active) CapStatusBadge("Disabled", StatusTone.Neutral)
                        }
                    },
                    showNavArrow = true,
                    onClick = { onOpen(CapNavRoute.UserDetail.of(profile.id)) }
                )
            }
        }
    }
}

/**
 * Editing one account's profile, role, active status, and permission matrix — the Android
 * counterpart of the web User Management editor.
 *
 * Deliberately a full detail destination rather than a dialog: the matrix is one row per row of
 * `public.permissions` (dozens), which no phone-sized dialog can show without becoming a scroll
 * trap. It also means the back arrow and the system back button both already work through the
 * app's normal back stack, with no screen-local back handling.
 *
 * Edit-only, exactly like the web page: `public.users.id` is a foreign key to `auth.users(id)`,
 * populated by a trigger when someone signs up, so an account cannot be created from a client at
 * all — and there is no password column here to reset (Supabase Auth owns credentials).
 *
 * Authorization is the server's: `users_update_admin` plus `restrict_self_user_update_trigger`
 * (0002_rls_policies.sql) reject a non-admin changing role/is_active/effective_permissions/email,
 * and that rejection surfaces through the shared [MainViewModel.actionMessage] snackbar. Nothing
 * here hides a control to "enforce" that, because hiding a control is not enforcement.
 */
@Composable
private fun UserDetailScreen(
    profile: CapRecord,
    permissions: List<CapRecord>,
    rolePermissions: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit
) {
    val savedName = profile.text("full_name")
    val savedEmail = profile.text("email")
    val savedRole = profile.text("role")
    val savedActive = profile.fields["is_active"] as? Boolean ?: true
    val savedGranted = stringList(profile.fields["effective_permissions"]).toSet()

    var name by remember(profile.id) { mutableStateOf(savedName) }
    var email by remember(profile.id) { mutableStateOf(savedEmail) }
    var role by remember(profile.id) { mutableStateOf(savedRole) }
    var active by remember(profile.id) { mutableStateOf(savedActive) }
    var granted by remember(profile.id) { mutableStateOf(savedGranted) }
    var query by remember(profile.id) { mutableStateOf("") }
    var roleChanged by remember(profile.id) { mutableStateOf(false) }

    // "Role default" is defined by real role_permissions rows, never by a hardcoded list. The
    // account's own saved role is kept as an option even if no role_permissions row mentions it
    // (e.g. the schema's 'staff' default), so selecting another role is never a one-way door.
    val roleDefaults = rolePermissions.filter { it.text("role") == role }.map { it.text("permission_key") }.toSet()
    val roleOptions = (rolePermissions.map { it.text("role") } + savedRole)
        .filter { it.isNotBlank() }
        .distinct()
        .sorted()
        .map { it to roleLabel(it) }

    val visiblePermissions = permissions.filter { permission ->
        query.isBlank() ||
            permissionName(permission).contains(query, ignoreCase = true) ||
            permission.text("description").contains(query, ignoreCase = true) ||
            permission.text("key").contains(query, ignoreCase = true)
    }
    val grouped = visiblePermissions
        .sortedWith(
            compareBy<CapRecord> { it.text("group").lowercase(Locale.US) }
                .thenBy { permissionName(it).lowercase(Locale.US) }
        )
        .groupBy { it.text("group").ifBlank { "Other" } }

    val enabled = permissions.count { it.text("key") in granted }
    val inherited = permissions.count { it.text("key") in granted && it.text("key") in roleDefaults }
    val added = enabled - inherited
    val removed = permissions.count { it.text("key") !in granted && it.text("key") in roleDefaults }

    val valid = name.trim().isNotBlank() && email.trim().isNotBlank()
    val dirty = name.trim() != savedName ||
        email.trim() != savedEmail ||
        role != savedRole ||
        active != savedActive ||
        granted != savedGranted

    LazyColumn(
        Modifier.fillMaxSize().imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapCard {
                Column(
                    Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    CapUserAvatar(initialsOf(savedName.ifBlank { savedEmail }))
                    Text(
                        savedName.ifBlank { savedEmail }.ifBlank { "Unnamed user" },
                        style = MaterialTheme.typography.titleLarge,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (savedEmail.isNotBlank()) {
                        Text(
                            savedEmail,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        CapStatusBadge(roleLabel(savedRole), StatusTone.Info)
                        CapStatusBadge(
                            if (savedActive) "Active" else "Disabled",
                            if (savedActive) StatusTone.Success else StatusTone.Neutral
                        )
                    }
                }
            }
        }

        item {
            CapSectionCard(title = "Account details") {
                CapTextField(
                    label = "Full name",
                    value = name,
                    onValueChange = { name = it },
                    required = true,
                    errorMessage = if (name.isBlank()) "Full name cannot be empty." else null
                )
                CapTextField(
                    label = "Email",
                    value = email,
                    onValueChange = { email = it },
                    required = true,
                    keyboardType = KeyboardType.Email
                )
                CapDropdownField(
                    label = "Primary role",
                    options = roleOptions,
                    selectedKey = role,
                    onSelected = { selected ->
                        if (selected != role) {
                            role = selected
                            // Same behaviour as the web editor: picking a role loads that role's
                            // recommended permissions, which the admin can then customise.
                            granted = rolePermissions
                                .filter { it.text("role") == selected }
                                .map { it.text("permission_key") }
                                .toSet()
                            roleChanged = true
                        }
                    },
                    required = true
                )
                ToggleRow(
                    label = "Active account",
                    description = "A disabled account keeps its data but cannot sign in.",
                    checked = active,
                    onCheckedChange = { active = it }
                )
                if (roleChanged) {
                    Text(
                        "The selected role has loaded its recommended permissions. Customise them below if this person needs something different.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    "Role, permissions, email, and account status can only be changed by an administrator — the server rejects anyone else, and the result is shown after saving.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        item {
            CapSectionHeader(
                title = "Permissions ($enabled)",
                action = {
                    TextButton(
                        onClick = { granted = roleDefaults },
                        enabled = granted != roleDefaults
                    ) { Text("Reset to role defaults") }
                }
            )
        }

        if (permissions.isEmpty()) {
            item {
                CapEmptyState(
                    "No permissions are defined yet, so there is nothing to assign.",
                    modifier = Modifier.fillMaxWidth().wrapContentHeight()
                )
            }
        } else {
            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search permissions"
                )
            }
            if (grouped.isEmpty()) {
                item {
                    CapEmptyState(
                        "No permissions match your search.",
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }
            grouped.forEach { (group, groupPermissions) ->
                item(key = "permission_group_$group") {
                    val keys = groupPermissions.map { it.text("key") }
                    val allSelected = keys.all { it in granted }
                    CapCard {
                        CapSectionHeader(
                            title = group,
                            action = {
                                TextButton(onClick = {
                                    granted = if (allSelected) granted - keys else granted + keys
                                }) { Text(if (allSelected) "Clear group" else "Select group") }
                            }
                        )
                        groupPermissions.forEach { permission ->
                            val key = permission.text("key")
                            val effective = key in granted
                            val (stateLabel, stateTone) = permissionStateBadge(effective, key in roleDefaults)
                            PermissionRow(
                                name = permissionName(permission),
                                description = permission.text("description"),
                                stateLabel = stateLabel,
                                stateTone = stateTone,
                                checked = effective,
                                onCheckedChange = { checked ->
                                    granted = if (checked) granted + key else granted - key
                                }
                            )
                        }
                    }
                }
            }
        }

        item {
            CapCard {
                Text(
                    "$enabled enabled · $inherited from role · $added added · $removed removed",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(
                    Modifier.fillMaxWidth().padding(top = Spacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Box(Modifier.weight(1f)) {
                        CapSecondaryButton(
                            text = "Discard",
                            onClick = {
                                name = savedName
                                email = savedEmail
                                role = savedRole
                                active = savedActive
                                granted = savedGranted
                                roleChanged = false
                            },
                            enabled = dirty
                        )
                    }
                    Box(Modifier.weight(1f)) {
                        CapPrimaryButton(
                            text = "Save changes",
                            onClick = {
                                save(
                                    "users",
                                    profile.id,
                                    mapOf(
                                        "full_name" to name.trim(),
                                        "email" to email.trim(),
                                        "role" to role,
                                        "is_active" to active,
                                        "effective_permissions" to granted.toList().sorted()
                                    ),
                                    "User"
                                )
                                roleChanged = false
                            },
                            enabled = valid && dirty
                        )
                    }
                }
            }
        }
    }
}

/**
 * Label + supporting text with a trailing switch. The whole row is one toggleable node (the
 * switch itself takes no separate click handler), so a screen reader announces one control rather
 * than a label and an unrelated switch, and the tap target is the full row rather than the switch.
 */
@Composable
private fun ToggleRow(
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange)
            .defaultMinSize(minHeight = 48.dp)
            .padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

/**
 * One permission in the matrix. The state badge sits under the name rather than beside it: badge
 * text such as "Added for this user" would otherwise squeeze the permission name to an ellipsis on
 * a small phone.
 */
@Composable
private fun PermissionRow(
    name: String,
    description: String,
    stateLabel: String,
    stateTone: StatusTone,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange)
            .defaultMinSize(minHeight = 48.dp)
            .padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Text(name, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (description.isNotBlank()) {
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            CapStatusBadge(stateLabel, stateTone)
        }
    }
}

// =================================================================================================
// Settings — cross-platform parity Phase 9 (the Android counterpart of frontend/src/pages/
// Settings.jsx and its two sub-panels). This is BUSINESS configuration only; the Android-only
// Appearance section it once also carried now lives on the device-level "App Settings" screen,
// which is reached from "More" and carries no permission gate.
//
// Structural divergence from the web reference, deliberate: the web page is a horizontal
// TabsList of six tabs. Six tabs do not fit across a phone, and Material's own guidance is that
// settings belong in a scrolling list. So the hub is a scrollable column of cards, the two
// sections with real content (Job Cards, Products & Services) are their own destinations reached
// by a list row — which also gives each its own back-stack entry and top-bar title — and the
// three sections that are currently just honest copy stay inline on the hub.
//
// Ordering also diverges: the web order leads with "General", which is an empty-state paragraph.
// Leading a phone screen with that would bury every working control below the fold, so the
// interactive sections come first and the informational ones sit at the bottom. The copy itself
// is unchanged from the web.
// =================================================================================================

/** Numeric CapRecord field, tolerating a value PostgREST may hand back either as a JSON number
 *  or (for some numeric columns) as a string. Returns null rather than guessing when neither. */
private fun CapRecord.decimal(key: String): Double? =
    (fields[key] as? Number)?.toDouble() ?: text(key).toDoubleOrNull()

/** A number formatted for a text input: 1.0 -> "1", 12.5 -> "12.5" — never "1.0". */
private fun decimalText(value: Double?): String = when {
    value == null -> ""
    value % 1.0 == 0.0 -> value.toLong().toString()
    else -> value.toString()
}

/**
 * Whole-screen permission gate for every Settings destination.
 *
 * The web app gates its entire `/settings` route on `settings.access` (App.jsx's RoleGuard), so a
 * user without it never sees the page at all — there is no read-only mode there and there is none
 * here. The "More" row is hidden without the permission too; this exists so a restored back stack
 * behaves identically. It is presentation only: the real authorization is the RLS policy on
 * `job_card_settings`/`products_services` (migration 0018), which rejects the write regardless.
 */
@Composable
private fun RequireSettingsAccess(user: CapUser, content: @Composable () -> Unit) {
    if (user.hasPermission("settings.access")) {
        content()
    } else {
        CapEmptyState(
            "You do not have permission to open Settings. An administrator can grant you the \"Access Settings\" permission.",
            icon = Icons.Outlined.Lock
        )
    }
}

@Composable
private fun SettingsScreen(user: CapUser, onNavigate: (String) -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapScreenHeader(
                title = "Settings",
                subtitle = "Configure how CAP Dashboard works for your team."
            )
        }

        // Appearance used to sit here. It moved to the device-level "App Settings" screen (reached
        // from "More"): a theme choice is saved on one handset, is not shared with the website or
        // the account, and should not require `settings.access` — which this whole hub does.
        item {
            CapCard {
                CapSectionHeader("Configuration")
                CapListItem(
                    "Job Cards",
                    subtitle = "Numbering, defaults, statuses, and line item types",
                    leading = { Icon(Icons.AutoMirrored.Outlined.Assignment, null) },
                    showNavArrow = true,
                    onClick = { onNavigate(CapNavRoute.SettingsJobCards.label) }
                )
                CapListItem(
                    "Products & Services",
                    subtitle = "The catalogue that job card line items are added from",
                    leading = { Icon(Icons.Outlined.Inventory2, null) },
                    showNavArrow = true,
                    onClick = { onNavigate(CapNavRoute.SettingsCatalogue.label) }
                )
                // Link-out rather than a duplicate editor, exactly like the web tab's link to
                // /admin/users. Hidden without users.view, since the destination itself is gated.
                if (user.hasPermission(permissionFor("Users"))) {
                    CapListItem(
                        "Users & Roles",
                        subtitle = "Accounts, roles, and permissions",
                        leading = { Icon(Icons.Outlined.AdminPanelSettings, null) },
                        showNavArrow = true,
                        onClick = { onNavigate("Users") }
                    )
                }
            }
        }

        // Deliberately NOT a control: importing a spreadsheet needs a file picker and a CSV
        // parser, which is new behaviour rather than a port of an existing screen, so nothing
        // here pretends to offer it.
        item {
            SettingsNoteCard(
                icon = Icons.Outlined.CloudUpload,
                title = "Data Management",
                body = "Import customers from a spreadsheet on the website (Settings > Data Management). " +
                    "There is no import on mobile yet."
            )
        }

        item {
            SettingsNoteCard(
                icon = Icons.Outlined.Tune,
                title = "General",
                body = "No general application-wide settings are wired up yet. This section will grow as " +
                    "real, working settings are identified — nothing is added here just to fill space."
            )
        }

        item {
            SettingsNoteCard(
                icon = Icons.Outlined.Info,
                title = "System",
                body = "No system-level settings are wired up yet."
            )
        }
    }
}

/** An informational Settings section: a titled card of honest copy, with no fake control in it. */
@Composable
private fun SettingsNoteCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String
) {
    CapCard {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, style = MaterialTheme.typography.titleMedium)
        }
        Text(
            body,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.sm)
        )
    }
}

/**
 * Appearance — Android only, and genuinely new behaviour rather than a port: the web app has no
 * theme switcher. Writes straight through [LocalCapThemeController], which applies the scheme
 * immediately and persists the choice locally (see ui/theme/CapThemePreferences.kt).
 *
 * Rendered by [AppSettingsScreen], not by [SettingsScreen] — it is a per-device preference rather
 * than business configuration, so it must not sit behind `settings.access`.
 *
 * Radio rows rather than a segmented control: "Follow system" does not fit alongside two other
 * chips on a small phone without truncating, and each row here is a full-width 48dp target that
 * cannot collide with its neighbours.
 */
@Composable
private fun AppearanceSettingsCard() {
    val controller = LocalCapThemeController.current
    CapCard {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Icon(Icons.Outlined.Palette, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Appearance", style = MaterialTheme.typography.titleMedium)
        }
        Text(
            "Saved on this device only — it is not part of your account, and it does not change how the website looks.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.xs, bottom = Spacing.xs)
        )
        CapThemeMode.entries.forEach { mode ->
            val selected = controller.mode == mode
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .selectable(
                        selected = selected,
                        role = Role.RadioButton,
                        onClick = { controller.select(mode) }
                    )
                    .defaultMinSize(minHeight = 48.dp)
                    .padding(vertical = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                RadioButton(selected = selected, onClick = null)
                Column(Modifier.weight(1f)) {
                    Text(mode.label, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        mode.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

/** Fallbacks that match the web panel's hardcoded lists exactly, used only when the stored
 *  jsonb list is missing or empty — the same defaults migration 0021 seeds the columns with. */
private val defaultJobStatuses = listOf(
    "Open", "Booked In", "In Progress", "Waiting for Parts",
    "Ready for Collection", "Completed", "Collected"
)
private val defaultJobLineTypes = listOf("Labour", "Part / Product", "Diagnosis", "Other")

/**
 * Settings > Job Cards — the Android counterpart of JobCardSettingsPanel.jsx, over the same
 * `public.job_card_settings` singleton row (migrations 0018 + 0021). Every field here is read by
 * real application code on the web (Book In uses `numbering_prefix`/`default_status`; the job
 * card detail screen uses the rest), so nothing on this screen is decorative.
 *
 * [settings] is null only if the row genuinely hasn't loaded yet (offline cold start, or a
 * permission edge case) — `job_card_settings` is registered in [MainViewModel]'s
 * `permittedCollections` (a data-layer fix in `SupabaseData.kt`'s `TABLES_WITHOUT_CREATED_AT`
 * was needed first, since this is the one table with no `created_at` column; see that file). This
 * screen never fakes values for a null row — it says so plainly instead.
 */
@Composable
private fun JobCardSettingsScreen(
    settings: CapRecord?,
    save: (String, String?, Map<String, Any?>, String) -> Unit
) {
    if (settings == null) {
        CapEmptyState(
            "Job Card settings haven't loaded yet. Check your connection and reopen this screen " +
                "— they can also be changed on the website under Settings > Job Cards.",
            icon = Icons.AutoMirrored.Outlined.Assignment
        )
        return
    }

    val savedPrefix = settings.text("numbering_prefix").ifBlank { "JOB-" }
    val savedStatus = settings.text("default_status")
    val savedQuantity = decimalText(settings.decimal("default_line_quantity")).ifBlank { "1" }
    val savedAllowProducts = settings.fields["allow_products"] as? Boolean ?: true
    val savedAllowServices = settings.fields["allow_services"] as? Boolean ?: true
    val savedStatuses = stringList(settings.fields["available_statuses"]).ifEmpty { defaultJobStatuses }
    val savedLineTypes = stringList(settings.fields["line_types"]).ifEmpty { defaultJobLineTypes }

    // Keyed on the record itself, not its id (the id is the literal `true` of the singleton row
    // and never changes). A poll returning identical data produces an equal CapRecord, so typing
    // is never interrupted; a genuine change — including this screen's own save, which bumps
    // updated_at — re-keys and shows the values the server actually stored.
    var prefix by remember(settings) { mutableStateOf(savedPrefix) }
    var status by remember(settings) { mutableStateOf(savedStatus) }
    var quantity by remember(settings) { mutableStateOf(savedQuantity) }
    var allowProducts by remember(settings) { mutableStateOf(savedAllowProducts) }
    var allowServices by remember(settings) { mutableStateOf(savedAllowServices) }
    var statuses by remember(settings) { mutableStateOf(savedStatuses) }
    var lineTypes by remember(settings) { mutableStateOf(savedLineTypes) }

    // The saved default is kept selectable even if it is no longer in the list, so editing the
    // status list can never leave this dropdown showing nothing.
    val statusOptions = (statuses + savedStatus).filter { it.isNotBlank() }.distinct()
    val quantityValue = quantity.trim().toDoubleOrNull()
    val quantityError = when {
        quantity.isBlank() -> "Enter a quantity."
        quantityValue == null -> "Enter a number."
        quantityValue < 1 -> "Must be at least 1."
        else -> null
    }
    val valid = prefix.trim().isNotBlank() && status.isNotBlank() && quantityError == null
    val dirty = prefix != savedPrefix ||
        status != savedStatus ||
        quantity != savedQuantity ||
        allowProducts != savedAllowProducts ||
        allowServices != savedAllowServices ||
        statuses != savedStatuses ||
        lineTypes != savedLineTypes

    LazyColumn(
        Modifier.fillMaxSize().imePadding(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapScreenHeader(
                title = "Job Cards",
                subtitle = "Configuration that affects how new Job Cards are created and worked."
            )
        }

        item {
            CapSectionCard(title = "Defaults") {
                CapTextField(
                    label = "Job number prefix",
                    value = prefix,
                    onValueChange = { prefix = it },
                    required = true,
                    errorMessage = if (prefix.isBlank()) "A prefix is required." else null
                )
                Text(
                    "Used when a new job number is generated on Book In, e.g. \"${prefix.trim().ifBlank { "JOB-" }}123456\".",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                CapDropdownField(
                    label = "Default status for new Job Cards",
                    options = statusOptions.map { it to it },
                    selectedKey = status,
                    onSelected = { status = it },
                    required = true
                )
                CapTextField(
                    label = "Default quantity for new line items",
                    value = quantity,
                    onValueChange = { quantity = it },
                    required = true,
                    keyboardType = KeyboardType.Decimal,
                    errorMessage = quantityError
                )
                ToggleRow(
                    label = "Allow products on Job Cards",
                    description = "Technicians can select catalogue products when adding a line.",
                    checked = allowProducts,
                    onCheckedChange = { allowProducts = it }
                )
                ToggleRow(
                    label = "Allow services on Job Cards",
                    description = "Technicians can select catalogue services when adding a line.",
                    checked = allowServices,
                    onCheckedChange = { allowServices = it }
                )
            }
        }

        item {
            CapSectionCard(title = "Job statuses") {
                TagListEditor(
                    help = "Offered as the status options on every Job Card. At least one is required.",
                    addLabel = "Add a status",
                    values = statuses,
                    onChange = { statuses = it }
                )
            }
        }

        item {
            CapSectionCard(title = "Service / line item types") {
                TagListEditor(
                    help = "Offered as the \"Type\" options when adding a line item to a Job Card.",
                    addLabel = "Add a type",
                    values = lineTypes,
                    onChange = { lineTypes = it }
                )
            }
        }

        item {
            CapCard {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Box(Modifier.weight(1f)) {
                        CapSecondaryButton(
                            text = "Discard",
                            onClick = {
                                prefix = savedPrefix
                                status = savedStatus
                                quantity = savedQuantity
                                allowProducts = savedAllowProducts
                                allowServices = savedAllowServices
                                statuses = savedStatuses
                                lineTypes = savedLineTypes
                            },
                            enabled = dirty
                        )
                    }
                    Box(Modifier.weight(1f)) {
                        CapPrimaryButton(
                            text = "Save changes",
                            onClick = {
                                // settings.id is the singleton row's boolean primary key rendered
                                // as text ("true"), so the generic update builds `?id=eq.true` —
                                // the same row the web client targets with `.eq("id", true)`.
                                save(
                                    "job_card_settings",
                                    settings.id,
                                    mapOf(
                                        "numbering_prefix" to prefix.trim(),
                                        "default_status" to status,
                                        "default_line_quantity" to (quantityValue ?: 1.0),
                                        "allow_products" to allowProducts,
                                        "allow_services" to allowServices,
                                        "available_statuses" to statuses,
                                        "line_types" to lineTypes
                                    ),
                                    "Job Card settings"
                                )
                            },
                            enabled = valid && dirty
                        )
                    }
                }
            }
        }
    }
}

/**
 * Add/remove editor for the two configurable string lists. Add and remove only — no reordering
 * or renaming — matching the web control's deliberate scope.
 *
 * The web renders the values as a wrapping cloud of chips with a tiny close button inside each.
 * Here each value is its own full-width row: a status such as "Ready for Collection" would be
 * truncated inside a phone-width chip, and 24dp close buttons packed into a wrapped row put
 * overlapping 48dp touch targets next to each other. One row per value keeps every target
 * separate and every label fully readable.
 */
@Composable
private fun TagListEditor(
    help: String,
    addLabel: String,
    values: List<String>,
    onChange: (List<String>) -> Unit
) {
    var draft by remember { mutableStateOf("") }
    val trimmed = draft.trim()
    val canAdd = trimmed.isNotEmpty() && trimmed !in values

    values.forEach { value ->
        Row(
            Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Text(
                value,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            // The last remaining value cannot be removed: an empty list would leave the Job Card
            // screens with nothing to offer. Same rule as the web control.
            IconButton(
                onClick = { onChange(values - value) },
                enabled = values.size > 1
            ) {
                Icon(Icons.Outlined.Close, "Remove $value", Modifier.size(18.dp))
            }
        }
    }

    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Box(Modifier.weight(1f)) {
            CapTextField(
                label = addLabel,
                value = draft,
                onValueChange = { draft = it },
                imeAction = ImeAction.Done,
                keyboardActions = KeyboardActions(onDone = {
                    if (canAdd) {
                        onChange(values + trimmed)
                        draft = ""
                    }
                })
            )
        }
        IconButton(
            onClick = { onChange(values + trimmed); draft = "" },
            enabled = canAdd
        ) {
            Icon(Icons.Outlined.Add, "Add \"$trimmed\"")
        }
    }

    Text(
        help,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

/** Unit price for display, tolerating either JSON shape PostgREST may use for `numeric`. */
private fun cataloguePrice(item: CapRecord): Double = item.decimal("unit_price") ?: 0.0

/**
 * Which VAT option a stored `vat_rate` corresponds to. The two options the web form offers are
 * 15% and 0%; a value that is neither is preserved as its own option rather than being silently
 * rewritten to 15% the next time someone edits an unrelated field on the item.
 */
private fun vatRateKey(item: CapRecord?): String {
    val rate = item?.decimal("vat_rate") ?: return "0.15"
    return when (rate) {
        0.0 -> "0"
        0.15 -> "0.15"
        else -> decimalText(rate)
    }
}

private fun vatRateLabel(key: String): String = when (key) {
    "0.15" -> "15%"
    "0" -> "0% (zero-rated)"
    else -> "${decimalText((key.toDoubleOrNull() ?: 0.0) * 100)}%"
}

/**
 * Settings > Products & Services — the Android counterpart of ProductsServicesSettings.jsx, over
 * the same `public.products_services` table (migration 0018).
 *
 * Items are never hard-deleted from this screen, exactly as on the web: "Archive" flips
 * `is_active` to false through the ordinary save path, which hides the item from new Job Cards
 * while every job_card_line that already referenced it keeps its own point-in-time copy of the
 * description and price (see the migration's header). Restoring flips it back.
 *
 * The web row puts Edit and Archive as icon-only buttons on the right of each row. On a phone
 * that leaves the item name about 140dp wide between a leading icon and two 48dp targets, so the
 * actions move to their own row underneath as labelled text buttons — no truncated names, no
 * adjacent touch targets, and the destructive-ish action is named rather than guessed from a
 * glyph.
 */
@Composable
private fun ProductsServicesScreen(
    items: List<CapRecord>,
    save: (String, String?, Map<String, Any?>, String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var showInactive by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CapRecord?>(null) }

    val inactiveCount = items.count { it.fields["is_active"] as? Boolean == false }
    val visible = items
        .filter { showInactive || (it.fields["is_active"] as? Boolean ?: true) }
        .filter { item ->
            query.isBlank() ||
                item.text("name").contains(query, ignoreCase = true) ||
                item.text("sku").contains(query, ignoreCase = true) ||
                item.text("category").contains(query, ignoreCase = true) ||
                item.text("description").contains(query, ignoreCase = true)
        }
        .sortedBy { it.text("name").lowercase(Locale.US) }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            contentPadding = PaddingValues(bottom = 84.dp)
        ) {
            item {
                CapCard {
                    CapSectionHeader(
                        title = "Catalogue (${visible.size})",
                        action = {
                            if (inactiveCount > 0) {
                                TextButton(onClick = { showInactive = !showInactive }) {
                                    Text(if (showInactive) "Hide inactive" else "Show inactive ($inactiveCount)")
                                }
                            }
                        }
                    )
                    Text(
                        "The catalogue used when adding line items to Job Cards and invoices. " +
                            "Archiving an item hides it from new Job Cards; job cards that already " +
                            "used it are never changed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            item {
                CapSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search name, code, or category"
                )
            }

            if (visible.isEmpty()) {
                item {
                    CapEmptyState(
                        when {
                            items.isEmpty() ->
                                "No catalogue items yet. Add the products or services technicians should be able to select when logging work."
                            query.isNotBlank() -> "No catalogue items match your search."
                            else -> "Every catalogue item is archived. Use \"Show inactive\" to see them."
                        },
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    )
                }
            }

            items(visible, key = { it.id }) { entry ->
                val active = entry.fields["is_active"] as? Boolean ?: true
                val isService = entry.text("type") == "service"
                val name = entry.text("name").ifBlank { "Unnamed item" }
                val details = listOfNotNull(
                    entry.text("sku").ifBlank { null },
                    formatRand(cataloguePrice(entry)),
                    entry.text("category").ifBlank { null },
                    entry.text("description").ifBlank { null }
                ).joinToString(" · ")

                CapCard {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Icon(
                            if (isService) Icons.Outlined.Build else Icons.Outlined.Inventory2,
                            contentDescription = if (isService) "Service" else "Product",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Column(
                            Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            Text(
                                name,
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (!active) CapStatusBadge("Inactive", StatusTone.Neutral)
                            if (details.isNotBlank()) {
                                Text(
                                    details,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = Spacing.xs),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { editing = entry }) { Text("Edit") }
                        TextButton(onClick = {
                            save(
                                "products_services",
                                entry.id,
                                mapOf("is_active" to !active),
                                if (active) "Catalogue item archived" else "Catalogue item restored"
                            )
                        }) {
                            Text(if (active) "Archive" else "Restore")
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { creating = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(Spacing.md)
        ) {
            Icon(Icons.Outlined.Add, "Add catalogue item")
        }
    }

    if (creating || editing != null) {
        val target = editing
        CatalogueItemDialog(
            initial = target,
            onDismiss = { creating = false; editing = null },
            onSave = { fields ->
                save("products_services", target?.id, fields, "Catalogue item")
                creating = false
                editing = null
            }
        )
    }
}

@Composable
private fun CatalogueItemDialog(
    initial: CapRecord?,
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>) -> Unit
) {
    var type by remember(initial) { mutableStateOf(initial?.text("type")?.ifBlank { "product" } ?: "product") }
    var name by remember(initial) { mutableStateOf(initial?.text("name").orEmpty()) }
    var description by remember(initial) { mutableStateOf(initial?.text("description").orEmpty()) }
    var sku by remember(initial) { mutableStateOf(initial?.text("sku").orEmpty()) }
    var category by remember(initial) { mutableStateOf(initial?.text("category").orEmpty()) }
    var price by remember(initial) { mutableStateOf(initial?.let { decimalText(it.decimal("unit_price")) }.orEmpty()) }
    var vat by remember(initial) { mutableStateOf(vatRateKey(initial)) }
    var active by remember(initial) { mutableStateOf(initial?.fields?.get("is_active") as? Boolean ?: true) }

    val vatOptions = listOf("0.15", "0")
        .let { base -> if (vat in base) base else base + vat }
        .map { it to vatRateLabel(it) }

    EditDialog(
        title = if (initial == null) "New product or service" else "Edit item",
        onDismiss = onDismiss,
        valid = name.isNotBlank(),
        onSave = {
            onSave(
                mapOf(
                    "type" to type,
                    "name" to name.trim(),
                    // Blank optional fields are sent as "" rather than null: the shared data
                    // layer drops null values from a payload, so sending null for a cleared
                    // field would leave the old value in place instead of clearing it.
                    "description" to description.trim(),
                    "sku" to sku.trim(),
                    "category" to category.trim(),
                    "unit_price" to (price.trim().toDoubleOrNull() ?: 0.0),
                    "vat_rate" to (vat.toDoubleOrNull() ?: 0.15),
                    "is_active" to active
                )
            )
        }
    ) {
        SelectInput("Type", listOf("product" to "Product", "service" to "Service"), type) { type = it }
        TextInput("Name", name, { name = it }, true)
        TextInput("Description", description, { description = it })
        TextInput("SKU / code", sku, { sku = it })
        TextInput("Category", category, { category = it })
        TextInput("Unit price (R)", price, { price = it }, keyboardType = KeyboardType.Decimal)
        SelectInput("VAT rate", vatOptions, vat) { vat = it }
        ToggleRow(
            label = "Active",
            description = "Inactive items stay on existing Job Cards but cannot be added to new ones.",
            checked = active,
            onCheckedChange = { active = it }
        )
    }
}

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
    var workItems by remember(initial) { mutableStateOf(parseWorkPerformed(initial?.text("work_performed"))) }
    var nextDue by remember(initial) { mutableStateOf(initial?.text("next_service_due").orEmpty()) }
    EditDialog(if (initial == null) "Add service" else "Edit service", onDismiss, machineId.isNotBlank() && date.isNotBlank(), {
        onSave(mapOf("machine_id" to machineId, "service_date" to date, "technician_name" to technician.trim(), "work_performed" to joinWorkPerformed(workItems), "next_service_due" to nextDue.trim()))
    }) {
        SelectInput("Machine", machines.map { it.id to machineTitle(it) }, machineId) { machineId = it }
        CapDateField("Service date", date, { date = it }, required = true)
        TextInput("Technician", technician, { technician = it })
        WorkPerformedChecklist(selected = workItems, onSelectedChange = { workItems = it })
        CapDateField("Next service due", nextDue, { nextDue = it })
    }
}

@Composable
private fun JobDialog(clients: List<CapRecord>, machines: List<CapRecord>, initial: CapRecord?, onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    val today = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var clientId by remember(initial) { mutableStateOf(initial?.text("client_id") ?: clients.firstOrNull()?.id.orEmpty()) }
    val availableMachines = machines.filter { sameRecordId(it.fields["client_id"], clientId) }
    var machineId by remember(initial, clientId) { mutableStateOf(initial?.text("machine_id") ?: availableMachines.firstOrNull()?.id.orEmpty()) }
    var number by remember(initial) { mutableStateOf(initial?.text("job_number")?.ifBlank { newJobNumber() } ?: newJobNumber()) }
    var machineType by remember(initial) { mutableStateOf(initial?.text("machine_type").orEmpty()) }
    var fault by remember(initial) { mutableStateOf(initial?.text("fault_description").orEmpty()) }
    var accessories by remember(initial) { mutableStateOf(initial?.text("accessories_received").orEmpty()) }
    var arrivalCondition by remember(initial) { mutableStateOf(initial?.text("arrival_condition").orEmpty()) }
    var conditionNotes by remember(initial) { mutableStateOf(initial?.text("arrival_condition_notes").orEmpty()) }
    var technician by remember(initial) { mutableStateOf(initial?.text("technician_name").orEmpty()) }
    var status by remember(initial) { mutableStateOf(initial?.text("status")?.ifBlank { "Booked In" } ?: "Booked In") }
    EditDialog(if (initial == null) "Add job card" else "Edit job card", onDismiss, clientId.isNotBlank() && machineId.isNotBlank() && number.isNotBlank(), {
        onSave(
            mapOf(
                "client_id" to clientId,
                "machine_id" to machineId,
                "job_number" to number.trim(),
                "status" to status,
                "date_received" to (initial?.text("date_received")?.ifBlank { today } ?: today),
                "machine_type" to machineType.trim(),
                "fault_description" to fault.trim(),
                "accessories_received" to accessories.trim(),
                "arrival_condition" to arrivalCondition,
                "arrival_condition_notes" to conditionNotes.trim(),
                "technician_name" to technician.trim()
            )
        )
    }) {
        SelectInput("Client", clients.map { it.id to it.text("company_name") }, clientId) { selected -> clientId = selected; machineId = machines.firstOrNull { sameRecordId(it.fields["client_id"], selected) }?.id.orEmpty() }
        SelectInput("Machine", machines.filter { sameRecordId(it.fields["client_id"], clientId) }.map { it.id to machineTitle(it) }, machineId) { machineId = it }
        TextInput("Job number", number, { number = it }, true)
        TextInput("Machine type", machineType, { machineType = it })
        TextInput("Fault description", fault, { fault = it })
        TextInput("Accessories received", accessories, { accessories = it })
        SelectInput("Condition on arrival", arrivalConditions.map { it to it }, arrivalCondition) { arrivalCondition = it }
        TextInput("Condition notes", conditionNotes, { conditionNotes = it })
        TextInput("Technician", technician, { technician = it })
        SelectInput("Status", listOf("Booked In", "Open", "In Progress", "Completed", "Ready to Invoice").map { it to it }, status) { status = it }
    }
}

@Composable
private fun EditDialog(title: String, onDismiss: () -> Unit, valid: Boolean, onSave: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                content = content
            )
        },
        shape = MaterialTheme.shapes.large,
        confirmButton = { Button(onSave, enabled = valid, shape = MaterialTheme.shapes.medium) { Text("Save") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun TextInput(label: String, value: String, onValueChange: (String) -> Unit, required: Boolean = false, keyboardType: KeyboardType = KeyboardType.Text) {
    CapTextField(
        label = label,
        value = value,
        onValueChange = onValueChange,
        required = required,
        keyboardType = keyboardType
    )
}

/**
 * Dialog-local select control. Kept as a button + [DropdownMenu] rather than switching to
 * [CapDropdownField]: `ExposedDropdownMenuBox` anchors against the window, which misbehaves
 * inside an AlertDialog. Styling now follows the theme (medium shape, 48dp touch target,
 * outline colour) so it reads the same as the CapTheme fields around it.
 */
@Composable
private fun SelectInput(label: String, options: List<Pair<String, String>>, selected: String, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
            shape = MaterialTheme.shapes.medium,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
        ) {
            Text(
                options.firstOrNull { it.first == selected }?.second?.ifBlank { label } ?: "Select $label",
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Icon(Icons.Outlined.ArrowDropDown, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
    LazyColumn(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
        contentPadding = PaddingValues(bottom = 84.dp)
    ) {
        item {
            CapScreenHeader(
                title = "Connection and Sync",
                subtitle = "Live view of this device's link to the CAP backend"
            )
        }
        item {
            CapSectionCard(title = "Connection Details") {
                StatusRowBadge("Internet / Live Service", connectionLabel(status.connection), connectionTone(status.connection))
                StatusRowBadge("Authentication", if (status.apiHealthy) "Connected" else "Not connected", if (status.apiHealthy) StatusTone.Success else StatusTone.Error)
                StatusRowBadge("Database Access", if (status.dbHealthy) "Connected" else "Not connected", if (status.dbHealthy) StatusTone.Success else StatusTone.Error)
                StatusRow("Data Read", vm.recordsState.records.values.sumOf { it.size }.toString())
                StatusRow("Latency", "${status.latency} ms")
                StatusRow("Supabase Project", BuildConfig.SUPABASE_URL.removePrefix("https://").substringBefore("."))
                StatusRow("Environment", "Production")
                StatusRow("Last Sync", if (status.lastSync > 0) fmt.format(Date(status.lastSync)) else "Never")
                StatusRow("Pending Operations", status.pendingOperations.toString())
                StatusRow("Failed Operations", status.failedOperations.toString())
                status.lastError?.let {
                    Text("Last error: $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    CapSecondaryButton(text = "Test", onClick = { vm.checkHealth() }, modifier = Modifier.weight(1f))
                    CapSecondaryButton(text = "Sync", onClick = { vm.sync() }, modifier = Modifier.weight(1f))
                }
                CapOutlinedButton(text = "Open Web Dashboard", onClick = { uriHandler.openUri(BuildConfig.WEB_APP_URL) })
            }
        }
        item {
            CapSectionCard(title = "Account") {
                StatusRow("Current Account", user?.email?.ifBlank { "Unknown" } ?: "Unknown")
                StatusRow("User Role", user?.role?.ifBlank { "Unknown" } ?: "Unknown")
                StatusRow("App Version", BuildConfig.VERSION_NAME)
                StatusRow("Build Version", BuildConfig.VERSION_CODE.toString())
            }
        }
        item {
            CapSectionCard(title = "Connection Test") {
                Text(
                    "Runs a one-off, read-only check against the CAP Database, separate from the background status above.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                CapOutlinedButton(
                    text = "Test Connection",
                    onClick = { vm.testConnection() },
                    loading = vm.testingConnection
                )
                vm.connectionTestResult?.let { result ->
                    if (result.success) {
                        CapStatusBadge(
                            "Connected" + (result.latencyMs?.let { " — $it ms" } ?: ""),
                            StatusTone.Success
                        )
                    } else {
                        Text(
                            result.message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        if (status.syncResults.isNotEmpty()) {
            item { CapSectionHeader(title = "Last Sync Results") }
            items(status.syncResults) { result ->
                CapCard {
                    CapListItem(
                        title = result.resource,
                        trailing = {
                            if (result.error == null) {
                                CapStatusBadge("${result.count ?: 0} records", StatusTone.Success)
                            } else {
                                CapStatusBadge("Error", StatusTone.Error)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun StatusRow(label: String, value: String) = CapKeyValueRow(label, value)

@Composable
fun StatusRowBadge(label: String, value: String, tone: StatusTone) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        CapStatusBadge(value, tone)
    }
}
