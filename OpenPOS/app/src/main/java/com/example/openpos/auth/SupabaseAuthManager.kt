package com.example.openpos.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Minimal Supabase Auth client for the Android POS.
 * Access and refresh tokens are encrypted with an Android Keystore AES-GCM key.
 */
class SupabaseAuthManager(
    context: Context,
    var apiBaseUrl: String
) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences("openpos_secure_auth", Context.MODE_PRIVATE)

    @Volatile private var cachedSupabaseUrl: String? = null
    @Volatile private var cachedAnonKey: String? = null

    fun signIn(email: String, password: String) {
        require(email.isNotBlank()) { "Email is required." }
        require(password.isNotEmpty()) { "Password is required." }
        val config = loadConfig()
        val response = requestJson(
            "${config.first}/auth/v1/token?grant_type=password",
            "POST",
            config.second,
            JSONObject().put("email", email.trim()).put("password", password)
        )
        saveSession(response)
    }

    /**
     * Returns a usable access token, refreshing it when it is close to expiry.
     * Call from a background thread because refresh may perform network I/O.
     */
    fun getValidAccessToken(): String? {
        val stored = readSession() ?: return null
        val expiresAt = stored.optLong("expires_at", 0L)
        if (expiresAt > System.currentTimeMillis() + 60_000L) {
            return stored.optString("access_token").takeIf { it.isNotBlank() }
        }

        return try {
            val config = loadConfig()
            val refreshToken = stored.optString("refresh_token")
            if (refreshToken.isBlank()) return null
            val refreshed = requestJson(
                "${config.first}/auth/v1/token?grant_type=refresh_token",
                "POST",
                config.second,
                JSONObject().put("refresh_token", refreshToken)
            )
            saveSession(refreshed)
            refreshed.optString("access_token").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    fun hasStoredSession(): Boolean = readSession() != null

    fun signOut() {
        preferences.edit().remove(SESSION_KEY).apply()
    }

    private fun loadConfig(): Pair<String, String> {
        val urlCached = cachedSupabaseUrl
        val keyCached = cachedAnonKey
        if (!urlCached.isNullOrBlank() && !keyCached.isNullOrBlank()) return urlCached to keyCached

        val base = apiBaseUrl.trim().removeSuffix("/")
        require(base.startsWith("https://") || base.startsWith("http://")) {
            "Set the OpenPOS server URL before signing in."
        }
        val config = requestJson("$base/api/auth-config", "GET", null, null)
        require(config.optBoolean("configured", false)) {
            "Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY."
        }
        val supabaseUrl = config.optString("supabaseUrl").trim().removeSuffix("/")
        val anonKey = config.optString("supabaseAnonKey")
        require(supabaseUrl.startsWith("https://") && anonKey.isNotBlank()) {
            "The server returned invalid Supabase client configuration."
        }
        cachedSupabaseUrl = supabaseUrl
        cachedAnonKey = anonKey
        return supabaseUrl to anonKey
    }

    private fun requestJson(
        endpoint: String,
        method: String,
        anonKey: String?,
        body: JSONObject?
    ): JSONObject {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            if (!anonKey.isNullOrBlank()) setRequestProperty("apikey", anonKey)
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }

        try {
            if (body != null) {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.let {
                BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use { reader -> reader.readText() }
            }.orEmpty()
            if (status !in 200..299) {
                val error = try { JSONObject(responseText) } catch (_: Exception) { JSONObject() }
                val message = error.optString("msg")
                    .ifBlank { error.optString("message") }
                    .ifBlank { error.optString("error_description") }
                    .ifBlank { "HTTP $status" }
                throw IllegalStateException(message)
            }
            return if (responseText.isBlank()) JSONObject() else JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun saveSession(response: JSONObject) {
        val accessToken = response.optString("access_token")
        val refreshToken = response.optString("refresh_token")
        require(accessToken.isNotBlank() && refreshToken.isNotBlank()) {
            "Supabase did not return a complete login session."
        }
        val expiresIn = response.optLong("expires_in", 3600L)
        val session = JSONObject()
            .put("access_token", accessToken)
            .put("refresh_token", refreshToken)
            .put("expires_at", System.currentTimeMillis() + expiresIn * 1000L)
        val encrypted = encrypt(session.toString().toByteArray(Charsets.UTF_8))
        preferences.edit().putString(SESSION_KEY, encrypted).apply()
    }

    private fun readSession(): JSONObject? {
        val value = preferences.getString(SESSION_KEY, null) ?: return null
        return try {
            JSONObject(String(decrypt(value), Charsets.UTF_8))
        } catch (_: Exception) {
            preferences.edit().remove(SESSION_KEY).apply()
            null
        }
    }

    private fun encrypt(plainText: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(plainText)
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): ByteArray {
        val parts = value.split(".", limit = 2)
        require(parts.size == 2) { "Invalid encrypted session." }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    companion object {
        private const val SESSION_KEY = "encrypted_supabase_session"
        private const val KEY_ALIAS = "openpos_supabase_session_key"
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
