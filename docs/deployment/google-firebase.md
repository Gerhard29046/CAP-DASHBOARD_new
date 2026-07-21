# Cloudflare and Firebase deployment

## Live architecture

- Cloudflare Workers Static Assets serves `frontend/dist` at
  `https://capdashboard.gerhardvanwijk.workers.dev`.
- Firebase project `capdatabasefb2` provides Email/Password Authentication.
- The named Cloud Firestore database `capdashboard` is the shared web/Android data
  store.
- Firebase Storage bucket `capdatabasefb2.firebasestorage.app` stores optimized
  uploads.
- Android app `1:100946498038:android:d71d04a6e1f5b02bc677d7` uses package
  `com.CAPDATABASE.capdatabase` and the checked-in Firebase client configuration at
  `mobile-android/app/google-services.json`.

Laravel/Cloud Run remains in the repository for legacy and future integrations, but
it is not an active dependency for normal web or Android authentication and
Firestore synchronisation. Firebase client configuration is public application
metadata; Firebase Admin credentials, passwords, tokens, and service-account keys
must never be committed.

## Frontend build and deployment

The existing Cloudflare Worker is named `capdashboard` and is connected to
`Gerhard29046/CAP-DASHBOARD_new`. Its configuration is
`frontend/wrangler.jsonc`.

- root directory: `frontend`
- build command: `npm ci && npm run build`
- deploy command: `npx wrangler deploy`
- output directory: `frontend/dist`
- Firebase Vite variables: `frontend/.env.production`

Manual verification and deployment:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
Push-Location frontend
npx wrangler deploy
Pop-Location
```

The Worker configuration provides SPA fallback. The production domain must remain
in Firebase Authentication → Settings → Authorized domains.

## Firebase security and data

- `firestore.rules` requires an authenticated, active `users/{uid}` profile and
  enforces the existing CAP permission keys.
- Only administrators can manage user profiles, roles, and permissions.
- `storage.rules` restricts uploads to the authenticated user's path and requires
  an existing upload permission. Images are limited to 8 MB after client-side
  resizing/WebP compression; other approved documents are limited to 20 MB.
- `firebase.json` targets the named `capdashboard` Firestore database.

Deploy rules from the repository root:

```powershell
npx firebase-tools deploy --only firestore:rules --project capdatabasefb2
npx firebase-tools deploy --only storage --project capdatabasefb2
```

The original Laravel administrator credentials did not authenticate against the
legacy Cloud Run API during the Firebase cutover, so no legacy MySQL business rows
were copied automatically. Empty Firestore collections therefore represent zero
live Firebase records, not a local-server failure.

## Record identifiers and live relationships

Firestore-generated document IDs are strings. Keep `client_id`, `machine_id`, and
`job_card_id` as strings in both clients; converting them to numbers breaks linked
record queries. The web client detail watches the `machines` collection and resolves
machines by `client_id`. Android uses the same collection names and snapshot listeners,
so client, machine, service, and job changes are delivered without a local server.

The canonical invoice-ready job status is `Ready to Invoice`. The web invoice queue
also accepts the older `Ready for Invoice` spelling so existing records are not hidden.
