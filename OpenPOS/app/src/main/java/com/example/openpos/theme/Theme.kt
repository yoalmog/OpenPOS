package com.example.openpos.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val EnterpriseLight = lightColorScheme(
  primary = Color(0xFF087F75),
  onPrimary = Color.White,
  primaryContainer = Color(0xFFD3F2EC),
  onPrimaryContainer = Color(0xFF063F3A),
  secondary = Color(0xFF475569),
  onSecondary = Color.White,
  secondaryContainer = Color(0xFFE8EDF3),
  onSecondaryContainer = Color(0xFF1E293B),
  tertiary = Color(0xFFC06A22),
  onTertiary = Color.White,
  tertiaryContainer = Color(0xFFFFE8D2),
  onTertiaryContainer = Color(0xFF542B0B),
  background = Color(0xFFF3F6F7),
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
  primary = Color(0xFF66D4C5),
  onPrimary = Color(0xFF003731),
  primaryContainer = Color(0xFF07564F),
  onPrimaryContainer = Color(0xFFB9F1E8),
  secondary = Color(0xFFB5C4C7),
  onSecondary = Color(0xFF243438),
  secondaryContainer = Color(0xFF34484B),
  onSecondaryContainer = Color(0xFFDCE8E9),
  tertiary = Color(0xFFFFB979),
  onTertiary = Color(0xFF4A2500),
  tertiaryContainer = Color(0xFF693D17),
  onTertiaryContainer = Color(0xFFFFDCC0),
  background = Color(0xFF0D191A),
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
