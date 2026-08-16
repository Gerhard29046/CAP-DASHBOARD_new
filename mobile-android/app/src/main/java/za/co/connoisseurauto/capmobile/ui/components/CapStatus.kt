package com.CAPDATABASE.capdatabase.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.CAPDATABASE.capdatabase.ui.theme.CapPrimary
import com.CAPDATABASE.capdatabase.ui.theme.CapPrimaryForeground
import com.CAPDATABASE.capdatabase.ui.theme.CapSuccessGreen
import com.CAPDATABASE.capdatabase.ui.theme.CapSuccessGreenOnLight
import com.CAPDATABASE.capdatabase.ui.theme.CapWarningAmber
import com.CAPDATABASE.capdatabase.ui.theme.CapWarningAmberOnLight
import com.CAPDATABASE.capdatabase.ui.theme.LocalCapDarkTheme

enum class StatusTone { Success, Warning, Error, Neutral, Info }

private data class ToneColors(val background: Color, val content: Color)

private fun tinted(color: Color) = ToneColors(color.copy(alpha = 0.16f), color)

/**
 * Now scheme-aware (Phase 9's Appearance work). Error/Info/Neutral resolve through
 * `MaterialTheme.colorScheme`, which already carries the right value for whichever scheme is
 * active — in dark mode those resolve to exactly the tokens this function used to name directly
 * (`error` = CapDestructive, `primary` = CapPrimary), so dark mode is visually unchanged apart
 * from Neutral, which moves from CapSecondary/CapMutedForeground to the near-identical
 * surfaceVariant/onSurfaceVariant pair and gains a correct light-mode appearance.
 *
 * Success/Warning have no Material role to resolve through, so they switch on
 * [LocalCapDarkTheme] between the mid-tone chosen for navy and the deeper shade legible on
 * white (see Color.kt).
 */
@Composable
private fun toneColors(tone: StatusTone): ToneColors {
    val dark = LocalCapDarkTheme.current
    return when (tone) {
        StatusTone.Success -> tinted(if (dark) CapSuccessGreen else CapSuccessGreenOnLight)
        StatusTone.Warning -> tinted(if (dark) CapWarningAmber else CapWarningAmberOnLight)
        StatusTone.Error -> tinted(MaterialTheme.colorScheme.error)
        StatusTone.Info -> tinted(MaterialTheme.colorScheme.primary)
        StatusTone.Neutral -> ToneColors(
            MaterialTheme.colorScheme.surfaceVariant,
            MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * The accent colour for a [StatusTone] in the active scheme, for callers that need the colour
 * on its own rather than a whole badge — currently the top bar's connection dot. Sharing this
 * function is what keeps the dot and the Status screen's badges from ever disagreeing.
 */
@Composable
fun capToneColor(tone: StatusTone): Color = toneColors(tone).content

/** Small rounded pill communicating a status, e.g. "Connected" / "Checking". */
@Composable
fun CapStatusBadge(label: String, tone: StatusTone, modifier: Modifier = Modifier) {
    val colors = toneColors(tone)
    Box(
        modifier = modifier
            .background(colors.background, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = colors.content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** Circular avatar showing initials on a Primary-tinted background. */
@Composable
fun CapUserAvatar(initials: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(40.dp)
            .background(CapPrimary, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            initials.take(2).uppercase(),
            style = MaterialTheme.typography.labelLarge,
            color = CapPrimaryForeground
        )
    }
}
