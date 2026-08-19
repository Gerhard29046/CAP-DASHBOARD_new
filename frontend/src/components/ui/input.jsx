import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        // Mobile-first pass (2026-08-19): h-11 (~44px) by default so every Input in the app is
        // comfortably tappable on a phone without editing each call site; steps back down to the
        // existing h-9 desktop density at md: (see index.css .mobile-content-bottom-padding etc.
        // for the same pattern). text-base (16px) on mobile is deliberate/pre-existing -- iOS
        // Safari zooms the whole page on focus if an input's font-size is under 16px.
        "flex h-11 md:h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 md:py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
