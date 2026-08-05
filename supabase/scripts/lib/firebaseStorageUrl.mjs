// Extracts the internal Firebase Storage object path from a public download URL -- the
// shape `firebase/storage`'s `getDownloadURL()` returns, which is what the real
// `knowledge_media`/`knowledge_documents` Firestore field `file_url` actually stores
// (confirmed via frontend/src/pages/KnowledgeMachineDetail.jsx, which opens `item.file_url`
// directly in a new tab). The Firebase Admin SDK's `bucket().file(path)` needs the raw,
// decoded object path, not this URL -- so Phase D of migrate-firestore-to-postgres.mjs must
// extract it before it can locate the source file to copy.
//
// Found 2026-08-05 while reviewing Phase D: it previously read a nonexistent `storage_path`
// field (the same wrong guess fixed in supabase/migrations/
// 0013_knowledge_subcollections_real_fields.sql and scripts/lib/entityMappings.mjs) and,
// even if that field name had been right, would still have needed this extraction step --
// a bare rename would not have been enough, since the Admin SDK cannot take a download URL
// directly.
//
// Download URL shape (verified against the Firebase Storage REST API docs, not just
// assumed): https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>?alt=media&token=<uuid>
// Deliberately zero-dependency (no firebase-admin) so it can be unit-tested without
// installing anything or touching real Firebase/Supabase -- see
// firebaseStorageUrl.test.mjs.
export function extractFirebaseStoragePath(fileUrl) {
  if (!fileUrl) return null;
  let url;
  try {
    url = new URL(fileUrl);
  } catch {
    return null;
  }
  const marker = "/o/";
  const index = url.pathname.indexOf(marker);
  if (index === -1) return null;
  const encoded = url.pathname.slice(index + marker.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded) || null;
  } catch {
    // Malformed percent-encoding -- treat as unresolvable rather than throwing, so one bad
    // record can't abort the whole best-effort storage-copy phase.
    return null;
  }
}
