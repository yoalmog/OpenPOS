package com.example.openpos.ui.auth

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.openpos.auth.FirebaseAuthManager
import kotlinx.coroutines.launch

@Composable
fun FirebaseLoginScreen(
    activity: Activity,
    authManager: FirebaseAuthManager,
    initialApiBaseUrl: String,
    onServerUrlChanged: (String) -> Unit,
    onAuthenticated: () -> Unit
) {
    var serverUrl by remember { mutableStateOf(initialApiBaseUrl) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("OpenPOS", style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.height(8.dp))
            Text("Sign in with the owner Google account", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it; error = null },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("OpenPOS server URL") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
            )
            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    loading = true
                    error = null
                    scope.launch {
                        try {
                            val normalizedServerUrl = serverUrl.trim().removeSuffix("/")
                            require(normalizedServerUrl.startsWith("https://")) {
                                "Enter the secure OpenPOS Production URL (https://...)."
                            }
                            onServerUrlChanged(normalizedServerUrl)
                            authManager.signInWithGoogle(activity)
                            onAuthenticated()
                        } catch (exception: Exception) {
                            error = exception.message ?: "Google sign-in failed."
                        } finally {
                            loading = false
                        }
                    }
                },
                enabled = !loading && serverUrl.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                }
                Text(if (loading) "Connecting..." else "Continue with Google")
            }
        }
    }
}
