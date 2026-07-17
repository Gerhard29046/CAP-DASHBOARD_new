# Server Connection and Synchronisation Status Feature

This plan outlines the implementation of a real-time server and synchronisation status monitoring feature for the CAP Mobile app.

## Proposed Changes

### [mobile-android](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android)

#### [MODIFY] [Core.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/Core.kt)
- Add `HealthResponse` data class to map `/api/health`.
- Add generic `PaginatedResponse` or simple `List` response models for sync checks.
- Update `CapApi` interface:
    - Add `GET health` endpoint.
    - Add `GET clients`, `machines`, `service-records`, `job-cards` endpoints for sync validation.
- Create `ConnectivityObserver` to monitor network state using `ConnectivityManager`.
- Create `StatusRepository` to manage:
    - Real-time connectivity status.
    - API/Database health status.
    - Resource synchronisation status.
- Add `StatusRepository` to Hilt's `NetworkModule` or as a standalone singleton.

#### [MODIFY] [MainActivity.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/MainActivity.kt)
- Update `MainViewModel`:
    - Inject `StatusRepository`.
    - Expose `connectionStatus` and `syncStatus` as `StateFlow`.
    - Add methods to trigger manual connection tests and synchronisation.
- Add `ServerStatusIndicator` component:
    - Displays a small status dot and label (Connected, Offline, etc.).
- Add `StatusScreen` composable:
    - Detailed breakdown of API, Database, and Auth status.
    - Environment info (Debug/Production, Base URL).
    - Resource sync summary (count of records for Clients, Machines, etc.).
    - "Test Connection" and "Synchronise Now" buttons.
- Update `AdaptiveShell`:
    - Integrate `ServerStatusIndicator` into the `TopAppBar`.
- Update `destinations`:
    - Add a "Status" destination to the navigation menu.

## Verification Plan

### Automated Tests
- Run `gradlew clean :app:assembleDebug` to ensure compilation.
- I will add `println` logging to verify:
    - Connectivity state changes (Wi-Fi on/off).
    - API response codes and latency.
    - Sync counts.

### Manual Verification
- **Emulator Test**: Verify `http://10.0.2.2:8000/api/` reaches the backend.
- **Physical Device Check**: Report the current `BuildConfig.API_BASE_URL` and explain how to update it for LAN testing.
- **Status States**:
    - Trigger "Offline" by disabling network.
    - Trigger "Authentication Required" by logging out.
    - Verify "Connected" when everything is working.
- **Sync Summary**: Confirm record counts match expected values from the backend (if known, or at least that they are non-zero).

## Open Questions
- Should the sync check perform a full sync or just a "dry run" count? (Requirement says: "show whether each resource loaded successfully and show the number of records received", so I will implement it as a fetch-and-count).
