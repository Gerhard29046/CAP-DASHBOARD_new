import { supabase } from "@/services/supabase/client";
import { optimizeImageForUpload } from "@/lib/imageOptimize";
import { RECORD_PHOTO_NAMESPACES, buildRecordPhotoPath } from "@/lib/recordPhotoPath";

export { RECORD_PHOTO_NAMESPACES, buildRecordPhotoPath };

// Supabase Storage helpers, mirroring apiClient.js's Firebase Storage upload path
// (frontend/src/api/apiClient.js's `integrations.Core.UploadFile`, now sharing the same
// image-optimization logic via lib/imageOptimize.js). Not wired in yet -- buckets are
// created by supabase/migrations/0004_storage_buckets.sql (run manually by the user via
// the SQL Editor, not by this code).
//
// Bucket names and path conventions must match 0004_storage_buckets.sql's RLS policies:
// profile-images expects `{auth.uid()}/...`, others are permission-gated regardless of
// path (see that migration's comments for which buckets have real permission-based
// gating vs. a generic "any active profile" default).

export const BUCKETS = {
  profileImages: "profile-images",
  invoices: "invoices",
  documents: "documents",
  photos: "photos",
  attachments: "attachments",
};

export async function uploadFile(bucket, path, file, { upsert = false, optimizeImage = true } = {}) {
  const toUpload = optimizeImage ? await optimizeImageForUpload(file) : file;
  const { data, error } = await supabase.storage.from(bucket).upload(path, toUpload, {
    upsert,
    contentType: toUpload.type || file.type,
  });
  if (error) throw error;
  return data;
}

// Convenience wrapper matching the profile-images bucket's RLS path convention
// (`{auth.uid()}/...`). Callers should not construct this path manually.
export async function uploadProfileImage(userId, file, fileName = "avatar.webp") {
  return uploadFile(BUCKETS.profileImages, `${userId}/${fileName}`, file, { upsert: true });
}

export async function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function getSignedUrl(bucket, path, expiresInSeconds = 60 * 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

// Record-scoped, PERMANENT-path photo storage for service_records.photos /
// job_cards.arrival_photos (Phase 3 -- see docs/ai-memory/DECISIONS.md's matching entry and
// supabase/migrations/0024_photos_bucket_record_scoped_rls.sql). These two columns must store
// a permanent Storage object path, never a signed URL -- the previous implementation stored a
// 7-day signed URL directly (via apiClient.integrations.Core.UploadFile), which silently went
// stale after a week even though the underlying file was still safely in Storage. That is not
// acceptable for a service-history/liability record that must remain useful indefinitely.
// Callers must call getRecordPhotoSignedUrl() fresh at display time and must NEVER write its
// result back into service_records.photos / job_cards.arrival_photos.
//
// RECORD_PHOTO_NAMESPACES / buildRecordPhotoPath() live in lib/recordPhotoPath.js (pure, no
// Supabase dependency, unit-tested directly) and are re-exported here for convenience.

// Uploads to the private `photos` bucket under a record-scoped path. Returns the PERMANENT
// object path -- the caller is responsible for persisting this (never a signed URL) into the
// relevant record's photos/arrival_photos jsonb array via a normal entity update()/create().
export async function uploadRecordPhoto(namespace, recordId, file) {
  const optimized = await optimizeImageForUpload(file);
  const path = buildRecordPhotoPath(namespace, recordId, optimized.name);
  await uploadFile(BUCKETS.photos, path, optimized, { optimizeImage: false });
  return path;
}

// Fresh signed URL for displaying a stored path -- call this at render/display time, never
// persist the result back into the database (it expires; the stored path does not).
export async function getRecordPhotoSignedUrl(path, expiresInSeconds = 60 * 60) {
  return getSignedUrl(BUCKETS.photos, path, expiresInSeconds);
}

// Best-effort Storage delete for a record photo. Callers must remove the path from the
// record's jsonb array via their own update() regardless of whether this succeeds -- a
// Storage-delete failure (e.g. permission edge case) must never block the database update.
// See buildRecordPhotoPath()'s namespace/path-shape contract above; this does not construct a
// path, it only removes an already-known one.
export async function deleteRecordPhoto(path) {
  await deleteFile(BUCKETS.photos, path);
}
