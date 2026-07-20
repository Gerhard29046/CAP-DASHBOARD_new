# Fix Physical Device Connectivity

The Android app cannot connect to the server because it is configured to use `10.0.2.2`, which only works for emulators. For a physical device (like the Xiaomi phone detected), we must use the computer's local IP address, and the Laravel server must be configured to accept external connections.

## User Review Required

> [!IMPORTANT]
> You **MUST** restart your Laravel server using the following command for this to work:
> `php artisan serve --host=0.0.0.0 --port=8000`

## Full App Verification Plan

I will perform a systematic check of all app destinations to ensure navigation and links are working as intended.

### Navigation Links
For each item in the navigation menu (Rail/Bottom Bar), I will:
- Verify that clicking the item updates the screen title.
- Verify that the correct content (or placeholder) is displayed.

### Authenticated Flow
- Verify that permissions correctly filter the visible destinations (e.g., Administrator sees more than Accountant).
- Verify that "Logout" returns the user to the Login screen and clears the session.

## Proposed Changes

### [mobile-android](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android)

#### [MODIFY] [app/build.gradle.kts](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/build.gradle.kts)
- Update `API_BASE_URL` in the `debug` build type to use the computer's local IP: `http://10.174.206.104:8000/api/`.

#### [MODIFY] [MainActivity.kt](file:///C:/Users/Gerhard/Documents/CAP-DASHBOARD_new/mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/MainActivity.kt)
- Add a "Custom API URL" override field in the `DevelopmentAccounts` section. This will allow you to quickly change the IP if you switch networks without having to re-build the app.

## Verification Plan

### Automated Tests
- Run `gradlew clean :app:assembleDebug`

### Manual Verification
1.  Restart Laravel with `--host=0.0.0.0`.
2.  Deploy the app to the Xiaomi phone.
3.  Check the "Status" screen in the app to confirm "Connected".
4.  If it still shows "Offline", verify that both the phone and the computer are on the same Wi-Fi network.
