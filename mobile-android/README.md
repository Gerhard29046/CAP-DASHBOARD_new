# CAP Mobile

Native Android client for the CAP Laravel API. Use current stable Android Studio, JDK 17+, and SDK 36.

## Build

Open `mobile-android/` in Android Studio and sync, or set `JAVA_HOME` to Android Studio's `jbr` and run `gradlew.bat assembleDebug`.

For a physical USB-connected debug device, run `adb reverse tcp:8000 tcp:8000` and set the ignored `local.properties` value `CAP_API_BASE_URL=http://127.0.0.1:8000/api/`. The release build always uses `https://dashboard.connoisseurauto.co.za/api/` and disables cleartext traffic.

Run `gradlew.bat testDebugUnitTest lintDebug assembleDebug`.

Release signing must be supplied through ignored local/CI environment configuration; never commit keystores or passwords. Build an unsigned release bundle with `gradlew.bat bundleRelease` for secure signing configuration in the release pipeline.
