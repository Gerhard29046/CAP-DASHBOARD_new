package com.CAPDATABASE.capdatabase.ui.navigation

import android.net.Uri

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
    /**
     * The Jobs list. Carries an OPTIONAL status filter as a query argument, so the Dashboard's
     * "Open Jobs" tile can open the same list already narrowed to the jobs it counted rather than
     * dumping the user into an unfiltered list. `jobs` (no argument) and `jobs?filter=open` are the
     * same NavHost destination — navigate to [BASE] for the plain list, [of] for a filtered one.
     */
    data object Jobs : CapNavRoute("jobs?filter={filter}", "Jobs") {
        const val ARG = "filter"
        const val BASE = "jobs"

        /** [ARG] value meaning "only job cards that are not yet Completed/Collected". */
        const val FILTER_OPEN = "open"

        fun of(filter: String) = "$BASE?$ARG=${Uri.encode(filter)}"
    }
    data object Calendar : CapNavRoute("calendar", "Calendar")
    data object KnowledgeBase : CapNavRoute("knowledge_base", "Knowledge Base")
    data object Invoices : CapNavRoute("invoices", "Invoices")
    data object Users : CapNavRoute("users", "Users")
    data object Status : CapNavRoute("status", "Status")
    data object More : CapNavRoute("more", "More")
    data object Account : CapNavRoute("account", "Account")
    data object LogNewService : CapNavRoute("log_new_service", "Log New Service")
    data object BookIn : CapNavRoute("book_in", "Book In")

    // --- Detail destinations (record id argument) ------------------------------------------
    // Real NavHost destinations with their own back-stack entry. Each carries the record id
    // only -- the record itself is re-resolved from the live collection by the destination, so
    // a detail screen survives tab switches and process death instead of being lost with the
    // parent list screen's local state (which is what it was before: a `remember`ed CapRecord
    // held *inside* the list composable).
    data object ClientDetail : CapNavRoute("client_detail/{clientId}", "Client Detail") {
        const val ARG = "clientId"
        fun of(clientId: String) = "client_detail/${Uri.encode(clientId)}"
    }

    data object MachineDetail : CapNavRoute("machine_detail/{machineId}", "Machine Detail") {
        const val ARG = "machineId"
        fun of(machineId: String) = "machine_detail/${Uri.encode(machineId)}"
    }

    data object JobDetail : CapNavRoute("job_detail/{jobId}", "Job Detail") {
        const val ARG = "jobId"
        fun of(jobId: String) = "job_detail/${Uri.encode(jobId)}"
    }

    data object ServiceRecordDetail : CapNavRoute("service_detail/{serviceId}", "Service Detail") {
        const val ARG = "serviceId"
        fun of(serviceId: String) = "service_detail/${Uri.encode(serviceId)}"
    }

    data object KnowledgeBaseDetail : CapNavRoute("knowledge_base_detail/{entryId}", "Knowledge Base Detail") {
        const val ARG = "entryId"
        fun of(entryId: String) = "knowledge_base_detail/${Uri.encode(entryId)}"
    }

    companion object {
        /** Argument-free destinations reachable directly by label from the nav bar or "More". */
        val topLevel: List<CapNavRoute> = listOf(
            Home, Clients, Machines, Services, Jobs, Calendar, KnowledgeBase,
            Invoices, Users, Status, More, Account, LogNewService, BookIn
        )

        /** Detail destinations, addressed by record id rather than by label. */
        val details: List<CapNavRoute> = listOf(
            ClientDetail, MachineDetail, JobDetail, ServiceRecordDetail, KnowledgeBaseDetail
        )
    }
}
