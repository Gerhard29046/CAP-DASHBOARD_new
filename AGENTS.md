# CAP Dashboard Engineering Guide

## Architecture

- `frontend/`: React/Vite web client. It only communicates with Laravel.
- `backend/`: Laravel API and the sole gateway to MySQL, Google Calendar, mail, and future Sage services.
- `mobile-android/`: Native Kotlin/Compose client. Laravel remains its system of record.
- `docs/`: API and implementation documentation.

## Conventions and security

- JavaScript remains JavaScript/JSX; do not perform an incidental TypeScript conversion.
- Android uses Kotlin, Compose, MVVM, Hilt, repositories, and immutable UI state.
- Never connect a client directly to MySQL, Google, Sage, or SMTP.
- Never commit `.env`, tokens, credentials, signing files, or production passwords.
- Laravel permissions are authoritative. Clients may hide actions, but every API action must also be protected server-side.
- Store Android bearer tokens only through Keystore-backed encrypted storage. Never store passwords.
- Do not run `migrate:fresh`, delete business data, or rewrite existing migrations.
- Preserve unrelated worktree changes. Use feature branches/worktrees for parallel work and do not force-push shared branches.

## Commands

- Frontend: `cd frontend && npm install && npm run build`
- Backend: `cd backend && composer install && php artisan test`
- Android: `cd mobile-android && gradlew.bat testDebugUnitTest lintDebug assembleDebug`

## Testing and definition of done

Changed backend behavior requires feature tests; Android domain/view-model behavior requires unit tests and important navigation requires Compose tests. A milestone is done only when relevant builds/tests pass, permissions are enforced on server and client, errors are professional, no secrets or placeholder actions exist, and documentation reflects the actual contract.
