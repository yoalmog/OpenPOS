package com.example.openpos.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val EnterpriseLight = lightColorScheme(
  primary = Color(0xFF2457D6),
  onPrimary = Color.White,
  primaryContainer = Color(0xFFDCE7FF),
  onPrimaryContainer = Color(0xFF102B66),
  secondary = Color(0xFF526078),
  onSecondary = Color.White,
  tertiary = Color(0xFF16845B),
  background = Color(0xFFF4F6FA),
  onBackground = Color(0xFF172033),
  surface = Color(0xFFFFFFFF),
  onSurface = Color(0xFF172033),
  surfaceVariant = Color(0xFFE9EEF5),
  onSurfaceVariant = Color(0xFF526078),
  outline = Color(0xFFD5DEEA),
  error = Color(0xFFC43D4B)
)

private val EnterpriseDark = darkColorScheme(
  primary = Color(0xFF8AAEFF),
  onPrimary = Color(0xFF102B66),
  primaryContainer = Color(0xFF1E3D78),
  onPrimaryContainer = Color(0xFFDCE7FF),
  secondary = Color(0xFFA8B5C9),
  onSecondary = Color(0xFF1B2638),
  tertiary = Color(0xFF4BC69A),
  background = Color(0xFF0C1220),
  onBackground = Color(0xFFEDF2FA),
  surface = Color(0xFF152137),
  onSurface = Color(0xFFEDF2FA),
  surfaceVariant = Color(0xFF1B2A42),
  onSurfaceVariant = Color(0xFFA8B5C9),
  outline = Color(0xFF34445D),
  error = Color(0xFFFB7883)
)

/** Enterprise theme follows the Android system appearance (automatic light/dark). */
@Composable
fun OpenPOSTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme = if (darkTheme) EnterpriseDark else EnterpriseLight
  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
