# Mobile API Contract — Phase 1

Base URL is supplied by Android build configuration and ends in `/api/`. JSON errors follow Laravel `{message, errors?}`. Authenticated calls send `Authorization: Bearer <token>` and `Accept: application/json`.

## Authentication

### `POST login` — public

Request: `{ "email": "user@example.com", "password": "..." }`. Success 200: `{ "token": "...", "user": User }`. Validation 422 uses Laravel field errors; invalid or disabled credentials return 401. No refresh token exists currently; on expiry Android clears the session and requests login.

### `GET me` — authenticated

Success 200: `{ "user": User }`. `User` contains `id`, `name`, `email`, lowercase `role`, `is_active`, `must_change_password`, `effective_permissions[]`, and `permission_overrides`. Tokens are never returned.

### `POST logout` — authenticated

Revokes the current token and returns 204. Android clears its local encrypted token even if the request fails.

## Existing resources

`clients`, `machines`, `service-records`, `job-cards`, and `job-card-lines` expose standard JSON CRUD routes with permission middleware documented in `backend/routes/api.php`. Current list responses are unpaginated arrays; pagination and mobile delta sync are mandatory API gaps before production-scale offline caching. Calendar uses `GET calendar/events?start=&end=&include_services=&include_google=`. Knowledge uploads use multipart protected endpoints. HTTP 401 means reauthenticate, 403 means access denied, 422 means validation failed. HTTP 409/idempotency are not yet implemented.
