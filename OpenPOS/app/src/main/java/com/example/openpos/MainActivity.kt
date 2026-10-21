package com.example.openpos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import com.example.openpos.data.PosRepository
import com.example.openpos.i18n.LocalizationManager
import com.example.openpos.theme.OpenPOSTheme
import com.example.openpos.ui.pos.PosScreen

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    LocalizationManager.init(this)
    val repository = PosRepository.getInstance(this)

    enableEdgeToEdge()
    setContent {
      val currentLanguage by LocalizationManager.currentLanguage.collectAsState()

      CompositionLocalProvider(LocalLayoutDirection provides currentLanguage.layoutDirection) {
        OpenPOSTheme {
          Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            PosScreen(repository = repository)
          }
        }
      }
    }
  }
}
