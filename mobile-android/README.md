# CAP Mobile

Native Android client for the CAP Dashboard. Login email defaults to the administrator address
and can be changed with `CAP_LOGIN_EMAIL` in ignored `local.properties`; passwords are never
stored in source or build configuration.

Use current stable Android Studio, JDK 17+, and SDK 36.

## Build

Open `mobile-android/` in Android Studio and sync, or set `JAVA_HOME` to Android Studio's `jbr` and run `gradlew.bat assembleDebug`.

The app uses Supabase Auth and live-polled Postgres data against the same Supabase project
(`cjvrquipmnoihksijful`) the web client uses -- it does not require Firebase, Laravel, MySQL,
`adb reverse`, or a development-computer address. Its permission-aware Compose screens provide
live dashboard counts, client/machine relationships, editable machines, service records, job
cards, calendar dates, the invoice queue, knowledge-base records, users and roles, and connection
diagnostics. The Status screen links to the deployed dashboard at
`https://capdashboard.gerhardvanwijk.workers.dev/`.

Run `gradlew.bat testDebugUnitTest lintDebug assembleDebug`.

The optional live device smoke test takes a temporary record marker through the instrumentation
runner. It verifies that a client and linked machine appear in Compose, edits the machine from
Android, and waits for the change to sync back. Only run it against clearly labelled disposable
test data.

Release signing must be supplied through ignored local/CI environment configuration; never commit keystores or passwords. Build an unsigned release bundle with `gradlew.bat bundleRelease` for secure signing configuration in the release pipeline.
