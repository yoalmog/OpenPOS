package com.example.openpos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import com.example.openpos.auth.FirebaseAuthManager
import com.example.openpos.data.PosRepository
import com.example.openpos.i18n.LocalizationManager
import com.example.openpos.theme.OpenPOSTheme
import com.example.openpos.ui.auth.FirebaseLoginScreen
import com.example.openpos.ui.pos.PosScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    LocalizationManager.init(this)
    val repository = PosRepository.getInstance(this)
    val storedServerUrl = repository.settings.value.syncServerUrl
    val productionServerUrl = "https://openpos.b4u2store.workers.dev"
    if (!storedServerUrl.startsWith("https://")) {
      repository.updateSettings(repository.settings.value.copy(syncServerUrl = productionServerUrl))
    }
    val authManager = FirebaseAuthManager()
    repository.syncManager?.accessTokenProvider = authManager::getValidIdToken

    enableEdgeToEdge()
    setContent {
      val currentLanguage by LocalizationManager.currentLanguage.collectAsState()
      var authChecked by remember { mutableStateOf(false) }
      var authenticated by remember { mutableStateOf(false) }

      LaunchedEffect(authManager) {
        authenticated = withContext(Dispatchers.IO) {
          authManager.getValidIdToken() != null
        }
        authChecked = true
      }

      CompositionLocalProvider(LocalLayoutDirection provides currentLanguage.layoutDirection) {
        OpenPOSTheme {
          Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when {
              !authChecked -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
              ) {
                CircularProgressIndicator()
              }
              authenticated -> PosScreen(repository = repository)
              else -> FirebaseLoginScreen(
                activity = this@MainActivity,
                authManager = authManager,
                initialApiBaseUrl = repository.settings.value.syncServerUrl,
                onServerUrlChanged = { serverUrl ->
                  authManager.apiBaseUrl = serverUrl
                  repository.updateSettings(repository.settings.value.copy(syncServerUrl = serverUrl))
                },
                onAuthenticated = {
                  authenticated = true
                  repository.syncManager?.triggerSync()
                }
              )
            }
          }
        }
      }
    }
  }
}
