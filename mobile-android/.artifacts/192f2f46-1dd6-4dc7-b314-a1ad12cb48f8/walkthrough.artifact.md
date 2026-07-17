# Server Connection and Synchronisation Status Feature Walkthrough

I have implemented a real-time connection and synchronisation status monitoring system. This allows you to verify that the mobile app is correctly talking to the Laravel API and MySQL database.

## Changes Made

### Core Logic
#### [Core.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/Core.kt)
- **Health API**: Added `/api/health` support to `CapApi` to check server and database status.
- **Connectivity Monitoring**: Implemented `ConnectivityObserver` using Android's `ConnectivityManager` to detect network changes (Wi-Fi/Mobile Data) instantly.
- **Status Repository**: Added `StatusRepository` which manages the global connection state, measures latency, and handles resource synchronisation checks for Clients, Machines, etc.
- **Sync Endpoints**: Added endpoints to fetch and count records from the live database.

### UI Components
#### [MainActivity.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/MainActivity.kt)
- **ServerStatusIndicator**: A real-time status dot in the TopAppBar (Green: Connected, Amber: Checking/Warning, Red: Offline/Error).
- **Status Screen**: A new diagnostic screen accessible from the navigation menu that displays:
    - Detailed API/DB health.
    - Connection latency.
    - Environment info (Debug/Production) and Base URL.
    - Live record counts for key data (Clients, Machines, etc.).
    - Manual "Test" and "Sync" buttons.

## Verification Results

### Build & Environment
- **Build Status**: `Build finished successfully.`
- **Configured API URL**: `http://10.0.2.2:8000/api/` (Optimized for Android Emulator).
- **Health Endpoint**: `/api/health` was used to confirm backend connectivity.

### Connectivity Behavior
- **Offline Mode**: If you disable Wi-Fi/Data, the status indicator immediately turns Red and shows "Offline".
- **Connected Mode**: When the server is reachable, the indicator turns Green and shows "Connected".
- **Sync Validation**: The "Status" screen confirms live data is flowing by showing the actual record counts from the database.

> [!TIP]
> **For Physical Device Testing**:
> The current URL (`10.0.2.2`) will only work in the emulator. To test on a physical phone, you must update `BuildConfig.API_BASE_URL` (usually in `local.properties` or `build.gradle.kts`) to use your computer's local IP address (e.g., `http://192.168.1.x:8000/api/`).
