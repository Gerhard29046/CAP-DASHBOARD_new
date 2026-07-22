package com.CAPDATABASE.capdatabase.ui.navigation

/**
 * Route/destination identifiers for every screen planned across this 13-phase build.
 * This is identifiers + labels only — actual NavHost wiring happens in a later phase
 * once the corresponding screens exist.
 */
sealed class CapNavRoute(val route: String, val label: String) {
    data object Home : CapNavRoute("home", "Home")
    data object Clients : CapNavRoute("clients", "Clients")
    data object ClientDetail : CapNavRoute("client_detail/{clientId}", "Client Detail")
    data object Machines : CapNavRoute("machines", "Machines")
    data object MachineDetail : CapNavRoute("machine_detail/{machineId}", "Machine Detail")
    data object UpcomingServices : CapNavRoute("upcoming_services", "Upcoming Services")
    data object ServiceRecords : CapNavRoute("service_records", "Service Records")
    data object Jobs : CapNavRoute("jobs", "Jobs")
    data object JobDetail : CapNavRoute("job_detail/{jobId}", "Job Detail")
    data object LogNewService : CapNavRoute("log_new_service", "Log New Service")
    data object BookIn : CapNavRoute("book_in", "Book In")
    data object KnowledgeBase : CapNavRoute("knowledge_base", "Knowledge Base")
    data object KnowledgeBaseDetail : CapNavRoute("knowledge_base_detail/{entryId}", "Knowledge Base Detail")
    data object Calendar : CapNavRoute("calendar", "Calendar")
    data object InvoiceQueue : CapNavRoute("invoice_queue", "Invoice Queue")
    data object ConnectionStatus : CapNavRoute("connection_status", "Connection Status")
    data object Account : CapNavRoute("account", "Account")
    data object More : CapNavRoute("more", "More")

    companion object {
        val all: List<CapNavRoute> = listOf(
            Home, Clients, ClientDetail, Machines, MachineDetail, UpcomingServices,
            ServiceRecords, Jobs, JobDetail, LogNewService, BookIn, KnowledgeBase,
            KnowledgeBaseDetail, Calendar, InvoiceQueue, ConnectionStatus, Account, More
        )
    }
}
