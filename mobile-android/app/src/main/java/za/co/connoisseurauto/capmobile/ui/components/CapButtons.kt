package com.CAPDATABASE.capdatabase.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Minimum touch target height for all Cap buttons. */
private val MinButtonHeight = 48.dp

@Composable
fun CapPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = MinButtonHeight),
        enabled = enabled && !loading,
        shape = MaterialTheme.shapes.medium
    ) {
        CapButtonContent(text, loading)
    }
}

@Composable
fun CapSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    FilledTonalButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = MinButtonHeight),
        enabled = enabled && !loading,
        shape = MaterialTheme.shapes.medium,
        colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = MaterialTheme.colorScheme.secondary,
            contentColor = MaterialTheme.colorScheme.onSecondary
        )
    ) {
        CapButtonContent(text, loading)
    }
}

@Composable
fun CapOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = MinButtonHeight),
        enabled = enabled && !loading,
        shape = MaterialTheme.shapes.medium
    ) {
        CapButtonContent(text, loading)
    }
}

@Composable
private fun CapButtonContent(text: String, loading: Boolean) {
    Box(contentAlignment = Alignment.Center) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = LocalContentColor.current
            )
        } else {
            Text(text)
        }
    }
}
