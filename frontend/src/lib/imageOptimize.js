// Backend-agnostic image optimization for uploads: downscales to a max edge and
// re-encodes as WebP before upload, to keep Storage costs/bandwidth down. Extracted
// from frontend/src/api/apiClient.js's optimizeUpload() (Firebase path) so the Supabase
// storage service (frontend/src/services/supabase/storage.js) can share the exact same
// behavior rather than reimplementing it -- keeps upload behavior identical across both
// backends during the migration, and means there is only one place to change compression
// settings later.
//
// Behavior preserved verbatim from the original apiClient.js implementation: non-image
// files pass through unchanged; on any encoding failure, files under 8 MB pass through
// unchanged, files at or over 8 MB throw (since they can't be safely uploaded as-is).

export async function optimizeImageForUpload(file, { maxEdge = 1920, quality = 0.82 } = {}) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Image compression failed."))),
      "image/webp",
      quality,
    ));
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch (error) {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("This picture could not be optimized. Please choose a JPEG, PNG or WebP image under 8 MB.", { cause: error });
    }
    return file;
  }
}
