# Existing System Audit

## Architecture and authentication

The repository contains `frontend/` (React/Vite) and `backend/` (Laravel 13/MySQL). Laravel Sanctum issues bearer tokens from `POST /api/login`; `GET /api/me` restores the current user and `POST /api/logout` revokes the current token. Login returns the safe user profile, effective permission keys, and permission overrides. Disabled users cannot log in, but existing-token requests do not yet re-check `is_active` on every request.

## Core data and API

Clients, machines, service records, job cards, and job-card lines have JSON CRUD resources. Machines belong to clients; service records belong to machines; job cards belong to clients and machines. Job-card lines calculate authoritative line totals server-side. List endpoints are currently unpaginated and only expose limited filters. There is no general record-version or idempotency mechanism.

The Calendar API merges date-range-filtered `next_service_due` records with read-only Google events. Google credentials and encrypted tokens remain exclusively in Laravel. Knowledge Base media/documents have protected multipart upload/download endpoints and UUID filenames, but there is no reusable attachment model for machines, operational services, job cards, invoices, or signatures.

## Permissions

`User::hasPermission()` resolves explicit per-user overrides before role defaults and denies unknown keys. Laravel route middleware enforces most core resource permissions. Android must consume `effective_permissions`; it must not infer access from roles. Some older Knowledge Base controllers still contain role-oriented authorization that should be consolidated in a later backend-hardening pass.

## Workflow and branding

The web application uses a dark professional theme, rounded cards, green primary accents, concise status language, and responsive navigation. Existing workflows cover clients, machines, services, upcoming services, book-ins/job cards, job-card parts/labour, knowledge data, user administration, invoice-queue presentation, and Calendar. Operational photographs displayed by some React pages are not backed by a complete reusable upload API.

## Phase 1 conclusion

The existing Sanctum token contract is suitable for Android. Phase 1 can implement secure login, session restoration, effective permissions, and navigation without backend duplication. Pagination, sync/idempotency, operational attachments, invoice persistence, signatures, PDF/email, and Sage need backend work in later phases.
