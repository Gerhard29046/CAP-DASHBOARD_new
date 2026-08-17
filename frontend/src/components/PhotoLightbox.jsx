import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Full-screen in-app photo viewer -- fixes the deferred item from
// docs/ai-memory/KNOWN_ISSUES.md ("Web: photo click opens a new browser tab instead of an
// in-app viewer"). Consistent with the same "stay in-app, don't hand a signed Storage URL off
// to browser chrome" goal Android's CapPhotoViewerDialog already implements
// (mobile-android/.../ui/components -- see that file for the matching cross-platform intent).
//
// Uses the existing Radix Dialog primitive (frontend/src/components/ui/dialog.jsx) rather than
// a bespoke overlay -- same design system, same focus-trap/escape/backdrop-dismiss behavior
// every other modal in this app already has for free.
export default function PhotoLightbox({ url, onClose }) {
  return (
    <Dialog open={Boolean(url)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] p-2 bg-black/95 border-none">
        <DialogTitle className="sr-only">Photo preview</DialogTitle>
        {url && (
          <img
            src={url}
            alt=""
            className="w-full max-h-[85vh] object-contain rounded-lg"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
