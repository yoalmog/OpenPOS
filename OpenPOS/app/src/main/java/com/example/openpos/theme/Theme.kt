package com.example.openpos.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// OpenPOS Android palette aligned with the Back Office dark navy / blue interface.
private val OpenPosDark = darkColorScheme(
    primary = Color(0xFF3B82F6),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF1E3A8A),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = Color(0xFF8B5CF6),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFF312E81),
    onSecondaryContainer = Color(0xFFEDE9FE),
    tertiary = Color(0xFFF59E0B),
    onTertiary = Color(0xFF111827),
    tertiaryContainer = Color(0xFF78350F),
    onTertiaryContainer = Color(0xFFFDE68A),
    background = Color(0xFF0B0F19),
    onBackground = Color(0xFFF9FAFB),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFF9FAFB),
    surfaceVariant = Color(0xFF1F2937),
    onSurfaceVariant = Color(0xFF9CA3AF),
    outline = Color(0xFF374151),
    outlineVariant = Color(0xFF273449),
    error = Color(0xFFEF4444),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFEE2E2)
)

private val OpenPosLight = lightColorScheme(
    primary = Color(0xFF2563EB),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFDBEAFE),
    onPrimaryContainer = Color(0xFF1E40AF),
    secondary = Color(0xFF7C3AED),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEDE9FE),
    onSecondaryContainer = Color(0xFF4C1D95),
    tertiary = Color(0xFFD97706),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFEF3C7),
    onTertiaryContainer = Color(0xFF92400E),
    background = Color(0xFFF3F4F6),
    onBackground = Color(0xFF111827),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFE5E7EB),
    onSurfaceVariant = Color(0xFF4B5563),
    outline = Color(0xFFD1D5DB),
    outlineVariant = Color(0xFFE5E7EB),
    error = Color(0xFFDC2626),
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF7F1D1D)
)

/** Matches the Back Office navy canvas, blue actions, and restrained status colors. */
@Composable
fun OpenPOSTheme(
    darkTheme: Boolean = true,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) OpenPosDark else OpenPosLight
    MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
