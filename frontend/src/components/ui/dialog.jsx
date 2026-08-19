"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// Mobile-first pass (2026-08-19), Phase 3: on phone widths every Dialog is now a bottom sheet
// (anchored to the bottom edge, rounded top corners, slides up, capped height with its own
// scroll) instead of a small centered desktop-style card -- per spec section 12 ("the user
// should never see a tiny desktop modal squeezed into a 390px phone"). One primitive change
// covers every existing DialogContent call site (edit forms, product/service dialog, sticky
// note editor, etc.) without touching each individually. Reverts to the original centered-card
// behavior at sm: and up -- desktop is untouched. `max-h-[85dvh] overflow-y-auto` is a built-in
// safety net so a tall form can never render off-screen with no way to scroll to its own footer
// buttons (spec section 30); call sites that already set their own max-h/overflow (e.g.
// `max-h-[90vh] overflow-y-auto` on the edit-client/edit-machine dialogs) simply override this
// default via `cn()`, so nothing double-applies.
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Desktop/tablet default: the original centered card (unchanged behavior), now with a
        // built-in max-h/overflow safety net so no dialog can ever render taller than the
        // viewport with no way to reach its own footer buttons.
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 rounded-lg max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        // Mobile-only override (max-sm:, i.e. below the 640px breakpoint): bottom sheet instead
        // of a centered card -- anchored to the bottom edge, rounded top corners only, slides up
        // from the bottom, respects the safe-area home-indicator inset.
        "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-auto max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[85dvh] max-sm:pb-[calc(1.5rem+var(--safe-bottom))] max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0 max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0",
        className
      )}
      {...props}>
      <div className="mx-auto -mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />
      {children}
      <DialogPrimitive.Close
        className="tap-target absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
