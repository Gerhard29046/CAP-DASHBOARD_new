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

// Additional status colors — not part of the website's core token set, but needed
// for status badges (e.g. "Connected" / "Checking"). Chosen to read as professional
// tones against the blue-navy palette above rather than clashing neon accents.
val CapSuccessGreen = Color(0xFF22C55E)
val CapWarningAmber = Color(0xFFF59E0B)

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
