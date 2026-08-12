import React from "react";

// Shared shell for all auth pages (Login, Register, ForgotPassword, ResetPassword).
// Fixed 2026-08-11: previously only rendered `{children}`, silently dropping the
// `icon`/`title`/`subtitle`/`footer` props every caller already passes -- every auth page
// rendered as a mostly-empty white card with no heading. Pre-existing since this file was
// created (2026-07-14, commit 40d775c), unrelated to the Firebase->Supabase migration, but
// fixed here since it was hit directly during Supabase auth QA and is low-risk/presentational
// only (no data/auth logic touched).
// The app's global theme (src/index.css) is dark-mode-by-design: `--foreground` is a
// near-white color intended for use on the app's near-black `--background`. This card is
// deliberately a light/white surface instead (matching every other auth-flow design), so
// the shared `text-foreground`/`text-muted-foreground`/`text-card-foreground` tokens used
// throughout Login/Register/ForgotPassword/ResetPassword need to resolve to dark colors
// *inside this card specifically* -- overriding the CSS custom properties locally (inline
// style, scoped to this subtree only) rather than changing the global theme, which the rest
// of the app correctly depends on staying dark.
const LIGHT_CARD_TEXT_VARS = {
  "--foreground": "222 47% 11%",
  "--card-foreground": "222 47% 11%",
  "--muted-foreground": "215 20% 35%",
};

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      {/* `text-foreground` here is deliberate, not just decorative: Label/Input (shadcn
          primitives) set no color of their own and rely on plain CSS inheritance from an
          ancestor's computed `color`. Custom-property overrides alone (LIGHT_CARD_TEXT_VARS)
          only reach elements that explicitly reference var(--foreground) themselves (h1/p
          below); this class gives the card div itself a concrete dark `color` computed from
          the *local* override, which then correctly inherits down to Label/Input's un-styled
          text. Do not remove even though `text-foreground` isn't visually obvious here. */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-foreground" style={LIGHT_CARD_TEXT_VARS}>
        {Icon && (
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
          </div>
        )}
        {title && (
          <h1 className="text-2xl font-semibold text-foreground text-center">{title}</h1>
        )}
        {subtitle && (
          <p className="text-sm text-muted-foreground text-center mt-1 mb-6">{subtitle}</p>
        )}
        {!subtitle && title && <div className="mb-6" />}
        {children}
        {footer && (
          <div className="text-sm text-muted-foreground text-center mt-6">{footer}</div>
        )}
      </div>
    </div>
  );
}
