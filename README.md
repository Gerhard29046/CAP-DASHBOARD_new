# CAP Dashboard

**CAP Dashboard** is the internal service-management platform built for **Connoisseur Automotive Products (CAP)**, a workshop business specialising in the sale, installation, repair, and — most importantly — the **annual servicing** of automotive air-conditioning (A/C) equipment, with a primary focus on Wigam A/C service/recovery machines.

It replaces paper job cards, spreadsheets, and tribal knowledge with a single, permission-controlled system of record for every client, every machine, and every service ever performed on it — accessible from the workshop desktop, a phone in the workshop, or the field via the Android app.

---

## The business model this dashboard supports

Connoisseur Automotive Products doesn't just repair machines once — its core recurring revenue comes from **scheduled annual servicing** of A/C equipment already sold to or serviced for its clients. That business model only works if the company can reliably answer, for every machine it has ever touched:

- Who owns this machine, and how do we contact them?
- What is its full service and repair history?
- When was it last serviced, and when is its **next annual service due**?
- What faults, parts, and labour were involved last time?

CAP Dashboard exists specifically to make that recurring-service model operational and scalable — instead of relying on a technician's memory or a filing cabinet, every machine's full lifecycle (installation → each service → each repair → next due date) lives in one searchable, permission-controlled database, and the **Upcoming Services** view surfaces exactly which clients and machines are due (or overdue) for their next annual service so the workshop can proactively schedule the work rather than wait for a breakdown call.

In short: **the dashboard is the operational backbone of CAP's annual-service business model** — it is what turns "we serviced this machine once" into "we have a permanent, reliable relationship with this client's equipment, year after year."

---

## Who uses it

| Role | What they do in the system |
|---|---|
| **Administrator** | Full access — clients, machines, users & permissions, job cards, settings, company details, policies |
| **Technician** | Books in machines, logs services/repairs, updates job card status, records parts/labour, uploads photos |
| **Accountant** | Reviews completed jobs in the Invoice Queue, tracks costs, manages billing-related data |

Every action is enforced server-side by database-level Row Level Security — not just hidden in the UI — so permissions are real, not cosmetic.

---

## Core features

### Client management
Customer database, multiple machines linked to a single client, site/contact details, notes, and full historical service records per client.

### Machine management
Complete machine profiles — brand, model, serial number, refrigerant type, installation date, warranty status, trade-in history, current status — with a complete ownership and service history attached to every machine, forever.

### Workshop Book-In
Book a customer's machine into the workshop with a unique job number, reported fault, accessories received, arrival condition assessment (with arrival photos), and technician assignment. Every book-in is checked against the machine's previous repair history automatically.

### Digital job cards
Every repair produces a complete digital job card: customer and machine details, reported fault, technician notes, work performed, labour entries, parts used, and full status tracking from **Booked In → Open → In Progress → Completed → Collected**.

### Annual service tracking ("Upcoming Services")
The system automatically calculates and surfaces which machines are due (or overdue) for their next annual service, built directly from real service records — this is the feature that operationalises CAP's recurring-service business model, not a bolt-on calendar.

### Service certificates
Branded, downloadable PDF service certificates generated per completed service record, referencing the client, machine, and work performed.

### Labour & parts costing
Labour entries, parts used, diagnostic entries, and other workshop charges, with automatic totals feeding into an **Invoice Queue** for completed jobs ready to be billed.

### Knowledge base
A searchable technical reference (machine notes, service codes, photos, documents) built up over time by technicians, shared across the whole team.

### Company settings & policies
Company details, job-card configuration, products & services catalogue, and a dedicated **Settings → Policies** section covering privacy, data security, ownership, and third-party service disclosures.

---

## Platforms

- **Web dashboard** (`frontend/`) — the primary admin/workshop interface, desktop and mobile-responsive, deployed at `capdashboard.gerhardvanwijk.workers.dev` via Cloudflare Workers.
- **Android app** (`mobile-android/`) — native Kotlin/Jetpack Compose client for technicians in the workshop or field, using the exact same live backend and permissions as the web dashboard (no separate/duplicate database).

Both clients read and write the **same live Supabase (PostgreSQL) database**, protected by the same Row Level Security policies — there is one source of truth for every client, machine, and service record, regardless of which platform is used.

---

## Technology

- **Frontend**: React + Vite, deployed to Cloudflare Workers
- **Android**: Kotlin, Jetpack Compose, MVVM, Hilt
- **Backend/data**: Supabase — PostgreSQL, Auth, Storage, and Row Level Security (both clients talk directly to Supabase; there is no separate API server in the live path)
- **Legacy**: a Laravel API (`backend/`) exists in this repository from an earlier architecture but is superseded and not used by either live client

---

## Repository structure

```
frontend/         React/Vite web dashboard (live production app)
mobile-android/    Native Android app (Kotlin/Compose)
backend/           Laravel API (legacy, not used by live clients)
supabase/          Database schema, RLS policies, and migrations
docs/              Architecture, decisions, and project documentation
```

---

## Development

```bash
# Web dashboard
cd frontend && npm install && npm run dev

# Android app
cd mobile-android && ./gradlew.bat assembleDebug
```

See `docs/` for full architecture and setup documentation.

---

© Connoisseur Automotive Products. Internal business software — not for redistribution.
