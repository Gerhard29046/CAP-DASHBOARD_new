# Google Calendar integration setup

This document explains how to configure the read-only Google Calendar
integration end to end: the Google Cloud OAuth client, the Firebase Cloud
Functions (2nd gen, region `africa-south1`, project `capdatabasefb2`) that
back System Settings and the Calendar page, and the frontend build/deploy
steps that wire it all together.

The integration is read-only. It never writes to, modifies, or deletes
anything in the connected Google account's calendars.

Never commit a real OAuth client ID or client secret to this repository, to
any `.env*` file, or to this document. Placeholders below are literal text to
replace, not real values.

## 1. Select the Google Cloud project

In the [Google Cloud Console](https://console.cloud.google.com/), select the
project associated with Firebase project `capdatabasefb2` (the same project
backs Firebase Auth, Firestore, and Storage for CAP Dashboard).

## 2. Enable the Google Calendar API

APIs & Services -> Library -> search "Google Calendar API" -> Enable.

## 3. Configure the OAuth consent screen

APIs & Services -> OAuth consent screen.

- **Internal** — if the connected Google account belongs to a Google
  Workspace organisation and only that organisation's users will ever
  connect, choose Internal. No Google verification review is required.
- **External** — if the account is a personal/non-Workspace Google account,
  choose External and add the connecting account's email under Test users
  while the app is in "Testing" publishing status (this avoids needing a full
  Google verification review, since CAP Dashboard only requests read-only
  Calendar scopes for a single known account).

## 4. Create a Web application OAuth client

APIs & Services -> Credentials -> Create Credentials -> OAuth client ID ->
Application type: **Web application**.

- Name: e.g. `CAP Dashboard Google Calendar`.
- Leave Authorized JavaScript origins and redirect URIs for the next two
  steps.

After creation, Google Cloud Console shows a **Client ID** and **Client
Secret**. Copy both somewhere secure (e.g. a password manager) — you will
paste them into `firebase functions:secrets:set` prompts in step 7, and
nowhere else.

## 5. Add the authorized redirect URI

Add this EXACT URL to the OAuth client's **Authorized redirect URIs**:

```
https://africa-south1-capdatabasefb2.cloudfunctions.net/googleCalendarCallback
```

This URL is fixed by the `googleCalendarCallback` function's name, region
(`africa-south1`), and project (`capdatabasefb2`) — it does not change
between deploys and is also documented in `functions/lib/googleOAuthClient.js`.

## 6. Add the authorized JavaScript origin

Add the live CAP Dashboard domain to **Authorized JavaScript origins**:

```
https://capdashboard.gerhardvanwijk.workers.dev
```

(Confirmed as the live Cloudflare Worker domain in
`docs/deployment/google-firebase.md`.)

## 7. Set the Firebase Functions secrets

From the repository root, using `npx firebase-tools` (no global install
required):

```powershell
npx firebase-tools functions:secrets:set GOOGLE_CALENDAR_CLIENT_ID --project capdatabasefb2
npx firebase-tools functions:secrets:set GOOGLE_CALENDAR_CLIENT_SECRET --project capdatabasefb2
```

Each command prompts for the secret value interactively — paste the Client ID
/ Client Secret from step 4 when prompted. Never pass secret values as a
command-line argument (they would be recorded in shell history) and never
paste them into a file that gets committed.

## 8. Deploy the functions

```powershell
npx firebase-tools deploy --only functions --project capdatabasefb2
```

The `africa-south1` region is baked into each function's definition (via
`setGlobalOptions({ region: "africa-south1" })` in `functions/index.js`), so
no `--region` flag is needed or available on this command.

## 9. Configure the frontend environment and rebuild

Ensure `frontend/.env.production` contains:

```
VITE_FUNCTIONS_BASE_URL=https://africa-south1-capdatabasefb2.cloudfunctions.net
```

(This is already committed — it is a public function base URL, not a secret,
consistent with the other `VITE_FIREBASE_*` public config values already
committed in that file.)

Rebuild the frontend:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
```

## 10. Redeploy the Cloudflare frontend

```powershell
Push-Location frontend
npx wrangler deploy
Pop-Location
```

(Per the existing deployment steps in `docs/deployment/google-firebase.md`.)

## 11. Connect Google Calendar from CAP Dashboard

Sign in as a user with the `calendar.google.connect` permission (admins
always have it), open **System Settings**, and click **Connect Google
Calendar**. Complete the Google consent screen using the authorised company
Google account.

## 12. Select calendars

Back in **System Settings** after a successful connection, check the
calendars that should appear in the CAP Dashboard **Calendar** page, then
click **Change Selected Calendars**. Selected events then appear alongside
Upcoming Services on the `/calendar` page for any user with the
`calendar.google.view` permission.

## Permissions reference

| Permission key                        | Grants                                   |
|----------------------------------------|-------------------------------------------|
| `calendar.view`                        | View the Calendar page (Upcoming Services) |
| `calendar.google.view`                 | View Google Calendar status/events/list    |
| `calendar.google.connect`              | Start/replace the Google Calendar OAuth connection |
| `calendar.google.calendars.select`     | Change which Google calendars are shown    |
| `calendar.google.disconnect`           | Disconnect Google Calendar                 |

Admins (`role: "admin"`) implicitly have all of the above.

## Local testing (optional)

The Firebase emulator suite can run the functions locally against emulated
Auth/Firestore (see the `"emulators"` block in `firebase.json`):

```powershell
npm --prefix functions install
npx firebase-tools emulators:start --only functions,firestore,auth --project capdatabasefb2
```

Note: the OAuth redirect URI registered in Google Cloud Console (step 5)
only works against the deployed `googleCalendarCallback` URL, so the full
connect/callback round-trip cannot be exercised purely against the local
emulator without a separate redirect URI registered for a tunnelled local
URL.
