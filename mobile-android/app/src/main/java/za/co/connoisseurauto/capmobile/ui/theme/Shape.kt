package com.CAPDATABASE.capdatabase.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// Corner radii derived from the website's `--radius: 0.75rem` (12dp) "lg" tier,
// mirroring the site's calc(var(--radius) - 2px) / - 4px pattern for smaller tiers.
val CapShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp)
)
