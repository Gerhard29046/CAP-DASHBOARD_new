import { toast } from "@/components/ui/use-toast";

// Shared error-surfacing helper for async write operations (create/update/delete/upload/etc.)
// across the app. Added 2026-08-18 as part of a full sweep: most save/delete handlers in this
// codebase called `await apiClient...` with no try/catch at all, so any thrown error (a
// network blip, an RLS denial, an unexpected validation failure) left the UI silently stuck --
// a loading/"Saving..." state that never reset, with no message shown (see
// docs/ai-memory/KNOWN_ISSUES.md's matching 2026-08-18 entries for the full history, starting
// from the specific "leaving a field blank crashes the page" report that led to this).
//
// This does NOT replace fixing the underlying cause (e.g. sanitizeForWrite.js for the
// empty-string bug) -- it's the last line of defence so ANY future/unexpected failure still
// surfaces a clear message instead of a frozen UI. Always call this from a `catch` block, and
// always reset the caller's own loading state in a `finally` (this helper does not do that for
// you, since only the caller knows its own state setters).
//
// Uses this project's existing toast system (components/ui/use-toast.jsx, already mounted via
// <Toaster /> in App.jsx, already used for success messages e.g. Register.jsx) rather than
// introducing a second error-UI pattern.
export function reportError(error, fallbackMessage, context) {
  if (context) console.error(context, error); else console.error(error);
  toast({
    variant: "destructive",
    title: "Something went wrong",
    description: error?.message || fallbackMessage || "Please try again.",
  });
}
