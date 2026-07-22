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
import com.CAPDATABASE.capdatabase.ui.theme.CapDestructive
import com.CAPDATABASE.capdatabase.ui.theme.CapMutedForeground
import com.CAPDATABASE.capdatabase.ui.theme.CapPrimary
import com.CAPDATABASE.capdatabase.ui.theme.CapPrimaryForeground
import com.CAPDATABASE.capdatabase.ui.theme.CapSecondary
import com.CAPDATABASE.capdatabase.ui.theme.CapSuccessGreen
import com.CAPDATABASE.capdatabase.ui.theme.CapWarningAmber

enum class StatusTone { Success, Warning, Error, Neutral, Info }

private data class ToneColors(val background: Color, val content: Color)

private fun toneColors(tone: StatusTone): ToneColors = when (tone) {
    StatusTone.Success -> ToneColors(CapSuccessGreen.copy(alpha = 0.16f), CapSuccessGreen)
    StatusTone.Warning -> ToneColors(CapWarningAmber.copy(alpha = 0.16f), CapWarningAmber)
    StatusTone.Error -> ToneColors(CapDestructive.copy(alpha = 0.16f), CapDestructive)
    StatusTone.Info -> ToneColors(CapPrimary.copy(alpha = 0.16f), CapPrimary)
    StatusTone.Neutral -> ToneColors(CapSecondary, CapMutedForeground)
}

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
