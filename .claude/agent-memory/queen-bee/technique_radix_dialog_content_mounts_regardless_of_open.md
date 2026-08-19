---
name: technique-radix-dialog-content-mounts-regardless-of-open
description: A React wrapper component (like this repo's DialogContent) mounts as soon as it appears in a parent's JSX, regardless of Radix's `open` prop — any effect placed inside it fires on first render, not on "open." Caused a real, deployed regression (2026-08-19).
metadata:
  type: technique
---

`<Dialog open={someState}><DialogContent>...</DialogContent></Dialog>` — `DialogContent` here
is a plain React component. It mounts (and its own `useEffect`s fire) the instant it appears in
the parent's JSX tree, **regardless of whether `open` is true or false**. Only Radix's internal
`Presence` mechanism decides whether to actually render/portal the dialog's visual output into
the DOM. If a page always renders `<Dialog open={x}><DialogContent>` unconditionally (never
wrapped in `{x && <Dialog>...}`), `DialogContent` never unmounts for the lifetime of that page,
even while closed.

**Why this matters — real incident**: put a scroll-lock `useEffect` inside `DialogContent`
itself (`frontend/src/components/ui/dialog.jsx`), assuming it would only run while the dialog
was actually open. It ran once on first render of any page that always-mounts a `<Dialog>`
(`ServiceRecords.jsx` via the always-rendered `PhotoLightbox`; `Clients.jsx`'s filter sheet) and
never cleaned up, since the component never unmounted — the whole page's `document.body` got
permanently stuck `position: fixed`, real production regression, user-reported ("this page and
might be any page cant scroll").

**How to apply**: any effect that needs to run "while a dialog is open," not "while
`DialogContent` happens to be in the tree," must be driven by the actual controlled `open`
value — every call site in this app passes `open` explicitly (never uncontrolled/`defaultOpen`).
The fix: wrap `DialogPrimitive.Root` itself (not `Content`) in a small component that receives
`open` as a real prop and keys `useEffect(..., [open])` off it directly. See the current
`Dialog` export in `dialog.jsx` for the working pattern. Generalizes to any Radix primitive with
a similar `Root`+`Content` split (`AlertDialog`, `Popover`, `Sheet`, etc.) — don't assume a
child primitive's own mount lifecycle tracks its parent's open/closed state.

See also [[technique_playwright_real_ui_validation]] (how this was caught for real, on a live
URL, not by inspection) and a related lesson,
[[feedback_verify_migration_status_before_stating]] (verify live before making a claim).
