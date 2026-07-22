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
