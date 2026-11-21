package com.example.openpos.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val EnterpriseLight = lightColorScheme(
  primary = Color(0xFFF0C541),
  onPrimary = Color(0xFF292515),
  primaryContainer = Color(0xFFFFF1BE),
  onPrimaryContainer = Color(0xFF59440A),
  secondary = Color(0xFF475569),
  onSecondary = Color.White,
  secondaryContainer = Color(0xFFE8EDF3),
  onSecondaryContainer = Color(0xFF1E293B),
  tertiary = Color(0xFFB7791F),
  onTertiary = Color.White,
  tertiaryContainer = Color(0xFFFFE8D2),
  onTertiaryContainer = Color(0xFF542B0B),
  background = Color(0xFFF8F7F2),
  onBackground = Color(0xFF172A2A),
  surface = Color(0xFFFFFFFF),
  onSurface = Color(0xFF172A2A),
  surfaceVariant = Color(0xFFE8EFF0),
  onSurfaceVariant = Color(0xFF526568),
  outline = Color(0xFFC8D5D6),
  outlineVariant = Color(0xFFDCE5E5),
  error = Color(0xFFBA3545),
  errorContainer = Color(0xFFFFE1E4),
  onErrorContainer = Color(0xFF5F101B)
)

private val EnterpriseDark = darkColorScheme(
  primary = Color(0xFFF4CF58),
  onPrimary = Color(0xFF292515),
  primaryContainer = Color(0xFF59440A),
  onPrimaryContainer = Color(0xFFFFF1BE),
  secondary = Color(0xFFB5C4C7),
  onSecondary = Color(0xFF243438),
  secondaryContainer = Color(0xFF34484B),
  onSecondaryContainer = Color(0xFFDCE8E9),
  tertiary = Color(0xFFFFB979),
  onTertiary = Color(0xFF4A2500),
  tertiaryContainer = Color(0xFF693D17),
  onTertiaryContainer = Color(0xFFFFDCC0),
  background = Color(0xFF17160F),
  onBackground = Color(0xFFE5F0EF),
  surface = Color(0xFF142324),
  onSurface = Color(0xFFE5F0EF),
  surfaceVariant = Color(0xFF203536),
  onSurfaceVariant = Color(0xFFB3C5C5),
  outline = Color(0xFF476061),
  outlineVariant = Color(0xFF304849),
  error = Color(0xFFFF8992),
  errorContainer = Color(0xFF64232B),
  onErrorContainer = Color(0xFFFFD9DC)
)

/** Enterprise POS theme with an adaptive, high-contrast teal and graphite palette. */
@Composable
fun OpenPOSTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme = if (darkTheme) EnterpriseDark else EnterpriseLight
  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
