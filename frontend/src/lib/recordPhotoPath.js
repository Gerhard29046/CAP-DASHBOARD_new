// Pure path construction for record-scoped Storage photos (service_records.photos /
// job_cards.arrival_photos). Deliberately has zero Supabase/browser dependency so it's
// directly unit-testable with plain `node --test` (matching lib/customerImport.js's existing
// pattern) -- frontend/src/services/supabase/storage.js is the impure wrapper that actually
// calls Supabase, built on top of this.
//
// See docs/ai-memory/DECISIONS.md's Phase 3 entry and
// supabase/migrations/0024_photos_bucket_record_scoped_rls.sql: the path shape here must
// exactly match what that migration's can_access_service_record_photo()/
// can_access_job_card_photo() functions expect -- `{namespace}/{recordId}/{uuid}-{fileName}`,
// exactly 2 folder segments before the filename. Getting this wrong doesn't just break display,
// it means the RLS policy silently denies access (fails closed), so this is worth testing in
// isolation from any network call.

export const RECORD_PHOTO_NAMESPACES = {
  serviceRecord: "service-records",
  jobCard: "job-cards",
};

export function buildRecordPhotoPath(namespace, recordId, fileName) {
  if (namespace !== RECORD_PHOTO_NAMESPACES.serviceRecord && namespace !== RECORD_PHOTO_NAMESPACES.jobCard) {
    throw new Error(`buildRecordPhotoPath: invalid namespace "${namespace}"`);
  }
  if (!recordId) {
    throw new Error("buildRecordPhotoPath: recordId is required");
  }
  if (!fileName) {
    throw new Error("buildRecordPhotoPath: fileName is required");
  }
  return `${namespace}/${recordId}/${crypto.randomUUID()}-${fileName}`;
}
