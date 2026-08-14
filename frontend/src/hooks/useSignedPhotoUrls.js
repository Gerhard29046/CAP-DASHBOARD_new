import { useEffect, useState } from "react";
import { getRecordPhotoSignedUrl } from "@/services/supabase/storage";

// Resolves an array of PERMANENT Storage paths (service_records.photos / job_cards.arrival_photos
// entries, post-Phase-3) into fresh signed URLs for display. Never persists the result -- the
// database only ever holds the permanent path, never a signed URL (that's the whole point of
// this migration away from the old 7-day-expiring-URL-in-the-database design). Re-resolves
// whenever the `paths` array's actual contents change.
//
// A signed-URL failure for one path degrades that single entry to `null` (caller can render a
// broken-image placeholder) rather than failing the whole hook -- one bad/racy path must not
// hide every other photo.
export function useSignedPhotoUrls(paths) {
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(paths || []);

  useEffect(() => {
    let cancelled = false;
    const list = paths || [];
    if (list.length === 0) {
      setUrls({});
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    Promise.all(
      list.map(async (path) => {
        try {
          const url = await getRecordPhotoSignedUrl(path);
          return [path, url];
        } catch {
          return [path, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setUrls(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // `key` is the stable, content-based dependency; `paths` itself is a new array reference
    // on every render even when unchanged, which would otherwise re-fetch on every render.
  }, [key]);

  return { urls, loading };
}
