package com.CAPDATABASE.capdatabase.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * New CapTheme visual system, self-contained and not yet wired into MainActivity.
 * A later, separate change will replace the ad-hoc CapTheme in MainActivity.kt with this one.
 */
private val CapDarkColorScheme = darkColorScheme(
    primary = CapPrimary,
    onPrimary = CapPrimaryForeground,
    secondary = CapSecondary,
    onSecondary = CapSecondaryForeground,
    tertiary = CapPrimary,
    onTertiary = CapPrimaryForeground,
    background = CapBackground,
    onBackground = CapSecondaryForeground,
    surface = CapSurface,
    onSurface = CapSecondaryForeground,
    surfaceVariant = CapMuted,
    onSurfaceVariant = CapMutedForeground,
    error = CapDestructive,
    onError = CapPrimaryForeground,
    outline = CapBorder,
    outlineVariant = CapBorder
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
