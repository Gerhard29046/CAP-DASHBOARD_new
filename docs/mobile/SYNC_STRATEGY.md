# Synchronisation Strategy

Laravel is authoritative. Room is an encrypted-device-local cache/draft store, never an independent master database. Each local write receives a UUID idempotency key and explicit state: Local Draft, Waiting to Sync, Syncing, Synced, Conflict, or Failed. WorkManager runs constrained, retryable FIFO sync. Successful server responses replace cached server fields.

Updates will send the last observed server version/`updated_at`. HTTP 409 preserves both the local draft and server representation for user review; mobile never silently overwrites. Deletes require server tombstones/delta support. Photos/signatures are queued as files in app-private storage, uploaded multipart, and removed locally only after confirmation. Sage finalisation always requires connectivity and explicit Laravel success.
