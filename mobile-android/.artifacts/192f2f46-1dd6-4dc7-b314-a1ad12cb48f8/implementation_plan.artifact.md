# Continue Building Jetpack Compose Frontend

This plan outlines the steps to finish the mobile frontend, aligning it with the CAP Database website dashboard's "Dark Navy and Blue" professional design and ensuring all features are fully connected to live data.

## Current Status

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Theme** | ⚠️ Needs Wiring | Professional blue theme exists in `ui.theme` but `MainActivity` is still using an ad-hoc green theme. |
| **Dashboard** | ✅ Complete | Professional layout with stats and quick actions. |
| **Bottom Navigation** | ✅ Complete | Home, Clients, Jobs, More. |
| **Clients / Machines** | ✅ Complete | List and Detail views with full Firestore sync. |
| **Services / Jobs** | ✅ Complete | List and Detail views with full Firestore sync. |
| **Forms (Log/Book In)** | ✅ Complete | Full-screen forms with validation. |
| **Knowledge Base** | ✅ Complete | Detailed technical data, notes, and media. |
| **Invoices** | ⚠️ Unfinished | Currently a simple list; needs professional styling consistent with other screens. |
| **Status / Account** | ✅ Complete | Diagnostic tools and user settings. |

## Proposed Changes

### [mobile-android](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android)

#### [MODIFY] [MainActivity.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/MainActivity.kt)
- **Theme Integration**: Remove local `CapTheme` and `darkColorScheme` definitions. Import and use `com.CAPDATABASE.capdatabase.ui.theme.CapTheme`.
- **Component Cleanup**: Replace local UI helpers (like `RecordCard`, `EmptyCard`, `TextInput`) with standardized components from the `ui.components` package.
- **Invoice Screen Polish**: Update `InvoiceScreen` to use `CapScreenHeader` and `CapListItem` for a consistent, professional look.
- **Navigation Consistency**: Ensure all screens use the same padding and spacing patterns defined in `Spacing.kt`.

## Verification Plan

### Automated Tests
- Run `gradlew :app:testDebugUnitTest` to ensure no regressions in sync logic.
- Run `gradlew :app:assembleDebug` to verify the build.

### Manual Verification
- **Visual Audit**: Confirm the app now appears in the correct **Dark Navy and Blue** theme.
- **Navigation Test**: Click through all bottom-nav items (Home, Clients, Jobs, More) and verify secondary links (Knowledge Base, Invoices).
- **Data Sync**: Verify that the "Status" screen shows live record counts from Firestore.
- **Device Test**: Install and launch on the connected Xiaomi phone.
