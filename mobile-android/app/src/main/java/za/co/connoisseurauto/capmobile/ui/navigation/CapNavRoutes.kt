package com.CAPDATABASE.capdatabase.ui.navigation

/**
 * Route identifiers for every top-level screen. Wired into a real NavHost/NavController for
 * the first time in Phase B of the Android->Supabase migration (see
 * docs/android/ANDROID_SUPABASE_MIGRATION.md) -- previously defined here (Phase 1 of the
 * earlier visual-redesign project) but never connected to anything; navigation was a plain
 * `selected: String` + local `remember` switch in MainActivity.kt's `AdaptiveShell`/
 * `ScreenContent`.
 *
 * These ids are deliberately space-free/lowercase-snake_case (Navigation-Compose route
 * strings go through Uri-template construction internally; several of this app's existing
 * display labels contain spaces, e.g. "Knowledge Base" -- kept working correctly here by
 * never using a display label as a route id). `MainActivity.kt`'s existing display-label
 * strings ("Dashboard", "Clients", "Knowledge Base", etc.) are unchanged and still drive
 * permission checks (`destinations`/`permissionFor`), titles, and the `ScreenContent` `when`
 * dispatch -- a small adapter (`routeIdForLabel`/`labelForRouteId` in MainActivity.kt)
 * translates between the two only at the NavHost boundary, so no screen composable, no
 * permission check, and no existing `onNavigate("SomeLabel")` call site needed to change.
 *
 * Revised to match the app's ACTUAL final screen set (some Phase-1 entries were speculative
 * and never matched reality -- e.g. a separate "UpcomingServices" route was never built;
 * that feature lives inside the "Calendar" screen; "Users" was missing entirely despite the
 * screen existing).
 */
sealed class CapNavRoute(val route: String, val label: String) {
    data object Home : CapNavRoute("dashboard", "Home")
    data object Clients : CapNavRoute("clients", "Clients")
    data object Machines : CapNavRoute("machines", "Machines")
    data object Services : CapNavRoute("services", "Services")
    data object Jobs : CapNavRoute("jobs", "Jobs")
    data object Calendar : CapNavRoute("calendar", "Calendar")
    data object KnowledgeBase : CapNavRoute("knowledge_base", "Knowledge Base")
    data object Invoices : CapNavRoute("invoices", "Invoices")
    data object Users : CapNavRoute("users", "Users")
    data object Status : CapNavRoute("status", "Status")
    data object More : CapNavRoute("more", "More")
    data object Account : CapNavRoute("account", "Account")
    data object LogNewService : CapNavRoute("log_new_service", "Log New Service")
    data object BookIn : CapNavRoute("book_in", "Book In")

    // --- Reserved for Phase D (not yet wired into the NavHost) -----------------------------
    // Detail screens (ClientDetailScreen, MachineDetailScreen, etc.) currently exist as
    // composables but are reached via ad-hoc `remember { mutableStateOf<CapRecord?>(null) }`
    // state *inside* their parent list screen, not as addressable routes -- converting each
    // one to a real nested route (with a real back-stack entry, deep-linkable by id) is
    // deliberately scoped to Phase D, alongside that screen's own Firestore->Supabase data
    // swap, not done as one large navigation-only rewrite up front. Kept defined here so the
    // id convention is already decided when that work starts.
    data object ClientDetail : CapNavRoute("client_detail/{clientId}", "Client Detail")
    data object MachineDetail : CapNavRoute("machine_detail/{machineId}", "Machine Detail")
    data object JobDetail : CapNavRoute("job_detail/{jobId}", "Job Detail")
    data object ServiceRecordDetail : CapNavRoute("service_detail/{serviceId}", "Service Detail")
    data object KnowledgeBaseDetail : CapNavRoute("knowledge_base_detail/{entryId}", "Knowledge Base Detail")

    companion object {
        /** Top-level destinations actually wired into the Phase B NavHost. */
        val topLevel: List<CapNavRoute> = listOf(
            Home, Clients, Machines, Services, Jobs, Calendar, KnowledgeBase,
            Invoices, Users, Status, More, Account, LogNewService, BookIn
        )
    }
}
