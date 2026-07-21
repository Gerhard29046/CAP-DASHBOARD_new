# CAP Mobile

Firebase application ID: `com.CAPDATABASE.capdatabase`. The login email defaults to the administrator address and can be changed with `CAP_LOGIN_EMAIL` in ignored `local.properties`; passwords are never stored in source or build configuration.

Native Android client for the CAP Firebase project. Use current stable Android Studio, JDK 17+, and SDK 36.

## Build

Open `mobile-android/` in Android Studio and sync, or set `JAVA_HOME` to Android Studio's `jbr` and run `gradlew.bat assembleDebug`.

The app uses Firebase Authentication and the named Cloud Firestore database `capdashboard`; it does not require Laravel, MySQL, `adb reverse`, or a development-computer address for login and data synchronisation. The Status screen links to the deployed dashboard at `https://capdashboard.gerhardvanwijk.workers.dev/`.

Run `gradlew.bat testDebugUnitTest lintDebug assembleDebug`.

Release signing must be supplied through ignored local/CI environment configuration; never commit keystores or passwords. Build an unsigned release bundle with `gradlew.bat bundleRelease` for secure signing configuration in the release pipeline.
