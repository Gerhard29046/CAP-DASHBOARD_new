# API Gaps

| Gap | Required backend outcome | Phase |
|---|---|---|
| Large lists | Cursor/page pagination, search, filters, `updated_since` | 2 |
| Disabled active sessions | Reject/revoke tokens when `is_active=false` | 1 hardening |
| Offline retries | UUID idempotency keys and replay-safe create endpoints | 3 |
| Conflicts | Version/updated-at preconditions and HTTP 409 payload | 3 |
| Operational media | Reusable attachment model and protected multipart APIs | 3 |
| Invoice domain | Drafts, lines, status, authoritative totals and audit trail | 4 |
| Signatures | Protected immutable file/version records and upload API | 4 |
| PDF/email | Queued server generation/send/status/retry endpoints | 4 |
| Sage | Backend-only adapter, connection/status/idempotent submit | 4 |
| Mobile sync | Delta endpoints and tombstones for cached entities | 3 |

Knowledge Base upload routes can be reused only for Knowledge Base content; they must not be misapplied to operational records.
