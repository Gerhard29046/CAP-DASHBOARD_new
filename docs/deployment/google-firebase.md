# Cloudflare and Google/Firebase deployment

## Target architecture

- Cloudflare Workers Static Assets serves the built React SPA from `frontend/dist`
  at `https://capdashboard.gerhardvanwijk.workers.dev`.
- Cloud Run serves the Laravel API.
- Cloud SQL for MySQL remains the relational system of record.
- Cloud Storage stores uploaded knowledge-base media and documents.
- Secret Manager stores `APP_KEY`, database credentials, and Google OAuth secrets.
- Android continues to use Laravel bearer authentication. Firebase services can add
  Crashlytics, App Distribution, and FCM without moving authorization or business
  records out of Laravel.

Firebase Auth, Firestore, and direct client access to Cloud SQL or Cloud Storage are
not part of this architecture.

## Required project inputs

- Google Cloud/Firebase project: `capdatabasefb2` (Blaze/pay-as-you-go)
- deployment region: `africa-south1`
- production frontend domain and optional custom domain
- production API domain or the generated Cloud Run URL
- existing MySQL migration/import plan
- Google OAuth client details for the production callback

## Frontend build and deploy

The `capdashboard` Cloudflare Worker is connected to the GitHub repository and
deploys changes from the production branch. Its configuration is in
`frontend/wrangler.jsonc`.

Configure the Cloudflare build with:

- root directory: `frontend`
- build command: `npm ci && npm run build`
- deploy command: `npx wrangler deploy`
- production API variable: `VITE_API_BASE_URL=https://API_HOST/api`

To verify or deploy manually:

```powershell
$env:VITE_API_BASE_URL = "https://API_HOST/api"
npm --prefix frontend ci
npm --prefix frontend run build
Push-Location frontend
npx wrangler deploy
Pop-Location
```

The Worker configuration supplies SPA fallback behavior. Set Laravel
`CORS_ALLOWED_ORIGINS` to the exact Cloudflare frontend origin.

## Laravel production configuration

Use Cloud Run environment variables for non-secret values and Secret Manager
references for secrets. At minimum:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://API_HOST
LOG_CHANNEL=stderr
LOG_LEVEL=info
DB_CONNECTION=mysql
DB_HOST=...
DB_PORT=3306
DB_DATABASE=...
DB_USERNAME=...
SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database
FRONTEND_URL=https://capdashboard.gerhardvanwijk.workers.dev
CORS_ALLOWED_ORIGINS=https://capdashboard.gerhardvanwijk.workers.dev
GOOGLE_CALENDAR_REDIRECT_URI=https://API_HOST/google-calendar/callback
```

Keep one stable production `APP_KEY`; changing it makes encrypted Google Calendar
tokens unreadable. Run `php artisan migrate --force` as a controlled deployment job,
not during every container boot. Use `/up` for process liveness and `/api/health` for
database-aware readiness.

## Remaining production blockers

Before the first backend deployment:

1. Replace local knowledge-file storage with a configurable Cloud Storage disk.
2. Replace Laravel's development server in the container with a production server.
3. Provision a new Cloud SQL instance in `africa-south1`, Secret Manager entries,
   and least-privilege service accounts. No existing production MySQL data needs
   migration.
4. Run backend tests against the intended database configuration.
5. Register the Google OAuth production redirect URI.

For Android Firebase services, register package
`za.co.connoisseurauto.capmobile`. Never place a Firebase Admin service-account key
inside the Android app or repository.
