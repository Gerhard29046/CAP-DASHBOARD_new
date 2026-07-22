# Android Device Test Checklist (for later, in Android Studio)

Runtime testing has not happened yet — everything up to this point is compile-time verified only (`assembleDebug`, `testDebugUnitTest`, `lintDebug`). When ready to test on your physical phone:

1. Open `mobile-android/` in Android Studio.
2. Allow Gradle sync to complete.
3. Connect your Android phone with USB.
4. Enable Developer Options (Settings → About phone → tap "Build number" 7 times).
5. Enable USB Debugging (Settings → Developer Options).
6. Accept the USB debugging prompt on the phone.
7. Select the physical phone as the run target in Android Studio.
8. Run the app.
9. Sign in with an existing live account.
10. Check that the dashboard shows real live data matching the website.
11. Open Connection and Sync Status.
12. Press Test Connection.
13. Confirm the test is read-only (no new/changed records in the website or Firestore console).
14. Create an authorised test service record only when you explicitly approve doing so.
15. Confirm the website and Android app show the same information side by side.
16. Check Logcat (View → Tool Windows → Logcat) for crashes, permission errors, or Firebase exceptions.
