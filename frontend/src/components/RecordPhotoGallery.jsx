import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";

// Renders a strip/grid of record photos (service_records.photos / job_cards.arrival_photos
// entries -- PERMANENT Storage paths as of Phase 3, see docs/ai-memory/DECISIONS.md and
// migration 0024_photos_bucket_record_scoped_rls.sql) as fresh signed-URL thumbnails.
//
// Not a generic media/attachment component -- purpose-built for exactly these two bounded
// photo fields, shared here only to avoid duplicating the same signed-URL-resolution logic
// across MachineDetail.jsx / ServiceRecords.jsx / JobCardDetail.jsx.
//
// `onPhotoClick(url)` renders each photo as a button (caller handles what "click" means, e.g.
// a lightbox). Omit it to render each photo as a plain link that opens the signed URL in a
// new tab instead.
export default function RecordPhotoGallery({
  photos,
  onPhotoClick,
  containerClassName = "flex gap-2 overflow-x-auto pb-1",
  itemClassName = "shrink-0",
  imgClassName = "w-24 h-24 rounded-lg object-cover border border-border hover:border-primary/50 transition-colors",
}) {
  const { urls } = useSignedPhotoUrls(photos);

  if (!photos || photos.length === 0) return null;

  return (
    <div className={containerClassName}>
      {photos.map((path, i) => {
        const url = urls[path];
        const image = url ? (
          <img src={url} alt="" className={imgClassName} loading="lazy" />
        ) : (
          <div className={`${imgClassName} bg-secondary animate-pulse`} />
        );

        if (onPhotoClick) {
          return (
            <button key={path + i} type="button" onClick={() => url && onPhotoClick(url)} className={itemClassName}>
              {image}
            </button>
          );
        }
        return (
          <a
            key={path + i}
            href={url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={itemClassName}
            onClick={(e) => { if (!url) e.preventDefault(); }}
          >
            {image}
          </a>
        );
      })}
    </div>
  );
}
