package com.CAPDATABASE.capdatabase.ui.navigation

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Scaffold wrapper that guarantees content never sits under the status bar, navigation bar,
 * or keyboard.
 *
 * Insets are applied exactly once: `contentWindowInsets` covers the status bar / navigation
 * bar for the content area (Material3's `TopAppBar`/`NavigationBar` already consume those
 * insets themselves for `topBar`/`bottomBar`), and `Modifier.imePadding()` on the outer
 * Scaffold additionally keeps content clear of the on-screen keyboard. Callers of
 * `CapBottomNavigation` should not add their own insets padding — this Scaffold is the single
 * source of truth for edge-to-edge spacing.
 */
@Composable
fun CapAppScaffold(
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    snackbarHostState: SnackbarHostState? = null,
    content: @Composable (paddingValues: androidx.compose.foundation.layout.PaddingValues) -> Unit
) {
    Scaffold(
        modifier = modifier.imePadding(),
        containerColor = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground,
        topBar = topBar,
        bottomBar = bottomBar,
        snackbarHost = { snackbarHostState?.let { SnackbarHost(it) } },
        contentWindowInsets = ScaffoldDefaults.contentWindowInsets.union(WindowInsets.systemBars),
        content = content
    )
}
