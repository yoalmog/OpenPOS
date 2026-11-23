package com.example.openpos

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.viewinterop.AndroidView
import com.example.openpos.auth.SupabaseAuthManager
import com.example.openpos.data.PosRepository
import com.example.openpos.i18n.LocalizationManager
import com.example.openpos.theme.OpenPOSTheme
import com.example.openpos.ui.auth.FirebaseLoginScreen

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    LocalizationManager.init(this)
    val repository = PosRepository.getInstance(this)
    val productionServerUrl = "https://openpos.b4u2store.workers.dev"
    val backOfficeWebUrl = "https://openpos-liart.vercel.app"
    val storedServerUrl = repository.settings.value.syncServerUrl
    if (!storedServerUrl.startsWith("https://")) {
      repository.updateSettings(repository.settings.value.copy(syncServerUrl = productionServerUrl))
    }
    val serverUrl = repository.settings.value.syncServerUrl.trim().removeSuffix("/")
    val authManager = SupabaseAuthManager(this, serverUrl)
    repository.syncManager?.accessTokenProvider = {
      kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        authManager.getValidAccessToken()
      }
    }

    enableEdgeToEdge()
    setContent {
      val currentLanguage by LocalizationManager.currentLanguage.collectAsState()
      var authChecked by remember { mutableStateOf(false) }
      var authenticated by remember { mutableStateOf(false) }

      LaunchedEffect(authManager) {
        authenticated = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
          authManager.getValidAccessToken() != null
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
              ) { CircularProgressIndicator() }

              authenticated -> AndroidBackOfficeScreen(
                serverUrl = backOfficeWebUrl,
                authManager = authManager
              )

              else -> FirebaseLoginScreen(
                activity = this@MainActivity,
                authManager = authManager,
                initialApiBaseUrl = serverUrl,
                onServerUrlChanged = { newUrl ->
                  repository.updateSettings(repository.settings.value.copy(syncServerUrl = newUrl))
                  authManager.apiBaseUrl = newUrl
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

/** Exposes only the current Supabase session to the trusted first-party Back Office origin. */
private class OpenPOSAndroidBridge(
  private val authManager: SupabaseAuthManager
) {
  @JavascriptInterface
  fun getSupabaseSession(): String = authManager.getWebSessionJson()
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun AndroidBackOfficeScreen(
  serverUrl: String,
  authManager: SupabaseAuthManager
) {
  val context = LocalContext.current
  var webView by remember { mutableStateOf<WebView?>(null) }

  BackHandler(enabled = webView?.canGoBack() == true) {
    webView?.goBack()
  }

  AndroidView(
    modifier = Modifier.fillMaxSize(),
    factory = {
      WebView(context).apply {
        webView = this
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.loadsImagesAutomatically = true
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        addJavascriptInterface(OpenPOSAndroidBridge(authManager), "OpenPOSAndroid")
        webChromeClient = WebChromeClient()
        webViewClient = object : WebViewClient() {
          override fun shouldOverrideUrlLoading(
            view: WebView,
            request: android.webkit.WebResourceRequest
          ): Boolean {
            val target = request.url
            if (target.scheme == "https" && target.host == "openpos-liart.vercel.app") return false
            return try {
              context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target.toString())))
              true
            } catch (_: Exception) {
              true
            }
          }
        }
        loadUrl(serverUrl)
      }
    },
    update = { view ->
      if (view.url.isNullOrBlank()) view.loadUrl(serverUrl)
    }
  )
}
