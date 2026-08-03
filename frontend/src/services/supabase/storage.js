import { supabase } from "@/services/supabase/client";
import { optimizeImageForUpload } from "@/lib/imageOptimize";

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
