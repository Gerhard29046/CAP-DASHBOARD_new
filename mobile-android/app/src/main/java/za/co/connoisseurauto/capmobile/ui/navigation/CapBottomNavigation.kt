package com.CAPDATABASE.capdatabase.ui.navigation

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow

data class CapNavDestination(
    val route: String,
    val label: String,
    val icon: ImageVector
)

/**
 * Dark-navy bottom navigation bar with the active item highlighted in Primary blue.
 * Insets-agnostic by design: `CapAppScaffold` already applies navigation-bar insets at the
 * Scaffold level, so this component must not add its own `navigationBarsPadding()` to avoid
 * double-padding.
 *
 * The selected item is distinguished three ways so current location is unambiguous at a glance:
 * a Primary-tinted pill behind the icon (the same low-alpha treatment `CapStatusBadge` uses for
 * its Info tone — `secondary` was nearly indistinguishable from `surface` here), Primary icon and
 * label colour, and a heavier label weight.
 */
@Composable
fun CapBottomNavigation(
    destinations: List<CapNavDestination>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        windowInsets = NavigationBarDefaults.windowInsets
    ) {
        destinations.forEach { destination ->
            val isSelected = destination.route == selected
            NavigationBarItem(
                selected = isSelected,
                onClick = { onSelect(destination.route) },
                // Null description, not the label: the visible label below the icon already
                // carries it, and duplicating it makes TalkBack announce each tab twice.
                icon = { Icon(destination.icon, contentDescription = null) },
                label = {
                    Text(
                        destination.label,
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            )
        }
    }
}
