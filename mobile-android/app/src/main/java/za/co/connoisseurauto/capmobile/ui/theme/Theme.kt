package com.CAPDATABASE.capdatabase.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The app-wide dark colour scheme.
 *
 * Every role is mapped explicitly to a token from [com.CAPDATABASE.capdatabase.ui.theme] — including
 * the `*Container` and `surfaceContainer*` roles. Leaving those unset is what made Material's
 * baseline purple leak into components that don't take an explicit colour (FloatingActionButton
 * uses `primaryContainer`, a plain `Card` uses `surfaceContainerLow`, `AlertDialog` uses
 * `surfaceContainerHigh`), which read as a different product to the rest of the navy palette.
 * No new hues are introduced here: the container tiers reuse the existing background/surface/
 * muted/secondary tokens in increasing lightness order.
 */
private val CapDarkColorScheme = darkColorScheme(
    primary = CapPrimary,
    onPrimary = CapPrimaryForeground,
    primaryContainer = CapPrimary,
    onPrimaryContainer = CapPrimaryForeground,
    secondary = CapSecondary,
    onSecondary = CapSecondaryForeground,
    secondaryContainer = CapSecondary,
    onSecondaryContainer = CapSecondaryForeground,
    tertiary = CapPrimary,
    onTertiary = CapPrimaryForeground,
    tertiaryContainer = CapSecondary,
    onTertiaryContainer = CapSecondaryForeground,
    background = CapBackground,
    onBackground = CapSecondaryForeground,
    surface = CapSurface,
    onSurface = CapSecondaryForeground,
    surfaceVariant = CapMuted,
    onSurfaceVariant = CapMutedForeground,
    surfaceTint = CapPrimary,
    surfaceBright = CapSecondary,
    surfaceDim = CapBackground,
    surfaceContainerLowest = CapBackground,
    surfaceContainerLow = CapSurface,
    surfaceContainer = CapSurface,
    surfaceContainerHigh = CapMuted,
    surfaceContainerHighest = CapSecondary,
    inverseSurface = CapSecondary,
    inverseOnSurface = CapSecondaryForeground,
    inversePrimary = CapPrimary,
    error = CapDestructive,
    onError = CapPrimaryForeground,
    errorContainer = CapDestructive,
    onErrorContainer = CapPrimaryForeground,
    outline = CapBorder,
    outlineVariant = CapBorder,
    scrim = Color(0xFF000000)
)

@Composable
fun CapTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = CapDarkColorScheme,
        typography = CapTypography,
        shapes = CapShapes,
        content = content
    )
}
