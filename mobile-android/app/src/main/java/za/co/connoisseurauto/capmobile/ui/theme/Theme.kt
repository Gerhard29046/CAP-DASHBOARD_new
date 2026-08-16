package com.CAPDATABASE.capdatabase.ui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView

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

/**
 * The light colour scheme — a strict role-for-role mirror of [CapDarkColorScheme] above, so a
 * component cannot look "designed" in one scheme and accidental in the other. Every role that is
 * assigned in the dark scheme is assigned here too; nothing falls through to Material's baseline
 * palette.
 *
 * Derivation (see Color.kt for the exact source values): the background/surface/foreground/
 * outline roles swap to the website's own light `:root` tokens, and the container tiers run
 * white → near-white → muted → border, i.e. the same "increasing separation from the page"
 * ordering the dark scheme uses, inverted.
 *
 * Two deliberate decisions worth knowing about:
 *
 * 1. `primary` stays [CapPrimary] (#2584F8) in both schemes rather than adopting the website's
 *    darker light-mode `--primary`. One brand blue keeps buttons, avatars, and the selected nav
 *    tab identical whichever appearance is chosen. The cost is disclosed rather than hidden:
 *    #2584F8 measures ≈3.7:1 against white, which clears WCAG's 3:1 bar for UI components and
 *    large text but not the 4.5:1 bar for small body text — so primary is used here for fills,
 *    icons, and controls, never as the colour of a paragraph.
 * 2. `secondary` does NOT stay [CapSecondary]. That token is #1D2435 — a dark elevated-surface
 *    tone, not a brand accent — and this scheme uses `secondary`/`onSecondary` exactly where the
 *    dark scheme does: as the fill of `CapSecondaryButton` and the neutral chip tone. Holding it
 *    constant would put a navy-black filled button on a white screen. The website makes the same
 *    call (its own `--secondary` is 210 25% 95% in light and 222 25% 15% in dark).
 */
private val CapLightColorScheme = lightColorScheme(
    primary = CapPrimary,
    onPrimary = CapPrimaryForeground,
    primaryContainer = CapPrimary,
    onPrimaryContainer = CapPrimaryForeground,
    secondary = CapLightSecondary,
    onSecondary = CapLightSecondaryForeground,
    secondaryContainer = CapLightSecondary,
    onSecondaryContainer = CapLightSecondaryForeground,
    tertiary = CapPrimary,
    onTertiary = CapPrimaryForeground,
    tertiaryContainer = CapLightSecondary,
    onTertiaryContainer = CapLightSecondaryForeground,
    background = CapLightBackground,
    onBackground = CapLightForeground,
    surface = CapLightSurface,
    onSurface = CapLightForeground,
    surfaceVariant = CapLightMuted,
    onSurfaceVariant = CapLightMutedForeground,
    surfaceTint = CapPrimary,
    surfaceBright = CapLightSurface,
    surfaceDim = CapLightSecondary,
    surfaceContainerLowest = CapLightSurface,
    surfaceContainerLow = CapLightSurface,
    surfaceContainer = CapLightBackground,
    surfaceContainerHigh = CapLightMuted,
    surfaceContainerHighest = CapLightBorder,
    // Inverse roles are the one place the navy palette is still correct in a light scheme —
    // Material uses them for things that deliberately contrast with the page (e.g. Snackbar).
    inverseSurface = CapSecondary,
    inverseOnSurface = CapSecondaryForeground,
    inversePrimary = CapPrimary,
    error = CapLightDestructive,
    onError = CapPrimaryForeground,
    errorContainer = CapLightDestructive,
    onErrorContainer = CapPrimaryForeground,
    outline = CapLightBorder,
    outlineVariant = CapLightBorder,
    scrim = Color(0xFF000000)
)

/**
 * Holds the live appearance choice and writes it back to [CapThemePreferences] when it changes.
 *
 * Owned by [CapTheme] and published through [LocalCapThemeController], so the Settings >
 * Appearance control can read and change it without every screen between the Activity and that
 * control having to pass it down.
 */
@Stable
class CapThemeController internal constructor(
    initialMode: CapThemeMode,
    private val persist: (CapThemeMode) -> Unit
) {
    var mode by mutableStateOf(initialMode)
        private set

    fun select(newMode: CapThemeMode) {
        if (newMode == mode) return
        mode = newMode
        persist(newMode)
    }
}

/**
 * @param initialMode the already-loaded saved choice. `MainActivity` reads it in `onCreate`, so
 *   the very first composition is already in the right scheme. Left null (previews, tests, any
 *   future entry point) the preference is read here instead — still before [MaterialTheme] is
 *   applied, so there is no flash of the wrong theme either way.
 */
@Composable
fun rememberCapThemeController(initialMode: CapThemeMode? = null): CapThemeController {
    val context = LocalContext.current
    return remember(context) {
        CapThemeController(initialMode ?: CapThemePreferences.load(context)) { chosen ->
            CapThemePreferences.save(context, chosen)
        }
    }
}

/** The controller behind Settings > Appearance. Only valid inside [CapTheme]. */
val LocalCapThemeController = staticCompositionLocalOf<CapThemeController> {
    error("LocalCapThemeController was read outside CapTheme().")
}

/**
 * Whether the RESOLVED scheme is dark (i.e. [CapThemeMode.System] already collapsed to a real
 * answer). Components that must pick a colour Material has no role for — the status-badge
 * success/warning tones — read this instead of guessing from a surface colour.
 */
val LocalCapDarkTheme = staticCompositionLocalOf { true }

@Composable
fun CapTheme(
    controller: CapThemeController = rememberCapThemeController(),
    content: @Composable () -> Unit
) {
    val dark = when (controller.mode) {
        CapThemeMode.Light -> false
        CapThemeMode.Dark -> true
        CapThemeMode.System -> isSystemInDarkTheme()
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect { view.applySystemBarAppearance(lightBars = !dark) }
    }

    CompositionLocalProvider(
        LocalCapThemeController provides controller,
        LocalCapDarkTheme provides dark
    ) {
        MaterialTheme(
            colorScheme = if (dark) CapDarkColorScheme else CapLightColorScheme,
            typography = CapTypography,
            shapes = CapShapes,
            content = content
        )
    }
}

/**
 * Keeps the system status/navigation bar icons legible against whichever scheme is active.
 *
 * This is not cosmetic polish: `targetSdk` is 36, so on Android 15+ the app is edge-to-edge
 * whether it opts in or not, and those bars sit directly over `CapAppScaffold`'s own background
 * colour. Light icons over the new light background would be invisible.
 *
 * Uses the platform `WindowInsetsController` on API 30+ and the pre-30 decor-view flag below
 * that (minSdk is 26), rather than reaching for `androidx.core`'s `WindowCompat` — this module
 * does not declare `androidx.core` itself, and a system-bar tweak is not a good reason to start
 * depending on a transitively-resolved artifact.
 */
@Suppress("DEPRECATION") // systemUiVisibility, on the API 26..29 branch only.
private fun View.applySystemBarAppearance(lightBars: Boolean) {
    val window = context.findActivity()?.window ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if (lightBars) mask else 0, mask)
    } else {
        val decor = window.decorView
        decor.systemUiVisibility = if (lightBars) {
            decor.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        } else {
            decor.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
        }
    }
}

private fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
