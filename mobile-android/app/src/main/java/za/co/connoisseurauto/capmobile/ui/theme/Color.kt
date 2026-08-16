package com.CAPDATABASE.capdatabase.ui.theme

import androidx.compose.ui.graphics.Color

// Core palette — extracted from the live website's frontend/tailwind.config.js
// and frontend/src/index.css CSS variables. Keep these in sync with the web app.
val CapBackground = Color(0xFF080C16)
val CapSurface = Color(0xFF0F1524)
val CapPrimary = Color(0xFF2584F8)
val CapPrimaryForeground = Color(0xFFFFFFFF)
val CapSecondary = Color(0xFF1D2435)
val CapSecondaryForeground = Color(0xFFDBE6F0)
val CapMuted = Color(0xFF191F2E)
val CapMutedForeground = Color(0xFF7588A3)
val CapDestructive = Color(0xFFDC2828)
val CapBorder = Color(0xFF20283C)

// Light-mode palette — taken from the SAME source as the dark tokens above: the website's
// `:root` (light) block in frontend/src/index.css, converted from its `H S% L%` values to
// sRGB. Nothing here is invented, and no new hue is introduced — this is the light half of a
// palette the app previously only used the dark half of.
//
//   --background 210 20% 98%   --card 0 0% 100%          --foreground 222 47% 11%
//   --secondary  210 25% 95%   --secondary-foreground 222 30% 22%
//   --muted      210 25% 95%   --muted-foreground     215 16% 47%
//   --destructive 0 72% 42%    --border 214 20% 89%
//
// The brand blue (CapPrimary) is deliberately NOT re-derived here — it stays constant across
// both schemes so a button, avatar, or selected tab is the same colour whichever appearance is
// chosen. (The website does darken its own light-mode `--primary` to 217 91% 45% for text
// contrast; keeping one brand blue on Android is the deliberate trade-off — see Theme.kt.)
val CapLightBackground = Color(0xFFF9FAFB)
val CapLightSurface = Color(0xFFFFFFFF)
val CapLightForeground = Color(0xFF0F1729)
val CapLightSecondary = Color(0xFFEFF2F5)
val CapLightSecondaryForeground = Color(0xFF273149)
val CapLightMuted = Color(0xFFEFF2F5)
val CapLightMutedForeground = Color(0xFF65758B)
val CapLightDestructive = Color(0xFFB81E1E)
val CapLightBorder = Color(0xFFDDE2E9)

// Additional status colors — not part of the website's core token set, but needed
// for status badges (e.g. "Connected" / "Checking"). Chosen to read as professional
// tones against the blue-navy palette above rather than clashing neon accents.
val CapSuccessGreen = Color(0xFF22C55E)
val CapWarningAmber = Color(0xFFF59E0B)

// Light-scheme counterparts of the two status colours above. The mid-tones chosen for a dark
// navy surface (#22C55E ≈ 2.2:1, #F59E0B ≈ 2.1:1 against white) are not legible as badge text
// on a light surface, so each drops to the deeper shade of the SAME hue family rather than
// changing colour identity — a "Connected" badge still reads green and a warning still reads
// amber in both schemes.
val CapSuccessGreenOnLight = Color(0xFF15803D)
val CapWarningAmberOnLight = Color(0xFFB45309)

// Dashboard note accents — the same four hue families the website's sticky notes use
// (amber / sky / emerald / rose), but taken at a mid-tone that stays legible when applied
// as a low-alpha tint on the dark navy surface, instead of the web's pastel `-50` fills
// which would wash out to near-white here. Kept separate from CapWarningAmber above so a
// yellow note never reads as a warning. The four keys are the only values the
// `dashboard_notes_color_valid` CHECK constraint accepts.
val CapNoteYellow = Color(0xFFFBBF24)
val CapNoteBlue = Color(0xFF38BDF8)
val CapNoteGreen = Color(0xFF34D399)
val CapNotePink = Color(0xFFFB7185)
