package com.example.openpos.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.example.openpos.R
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

/** Firebase-backed Google sign-in for OpenPOS Android terminals. */
class FirebaseAuthManager {
    private val auth = FirebaseAuth.getInstance()

    suspend fun signInWithGoogle(activity: Activity): String {
        val credentialManager = CredentialManager.create(activity)
        val googleOption = GetGoogleIdOption.Builder()
            .setServerClientId(activity.getString(R.string.default_web_client_id))
            .setFilterByAuthorizedAccounts(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleOption)
            .build()
        val result = credentialManager.getCredential(context = activity, request = request)
        val credential = result.credential as? CustomCredential
            ?: throw IllegalStateException("Google did not return a supported sign-in credential.")
        if (credential.type != TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw IllegalStateException("Google returned an unexpected credential type.")
        }
        val googleIdToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        val firebaseCredential = GoogleAuthProvider.getCredential(googleIdToken, null)
        val authResult = auth.signInWithCredential(firebaseCredential).await()
        val email = authResult.user?.email.orEmpty()
        if (!email.equals(OWNER_EMAIL, ignoreCase = true)) {
            auth.signOut()
            throw IllegalStateException("This Google account is not authorized as the OpenPOS owner. Sign in with $OWNER_EMAIL.")
        }
        return email
    }

    suspend fun getValidIdToken(): String? {
        val user = auth.currentUser ?: return null
        if (!user.email.equals(OWNER_EMAIL, ignoreCase = true)) {
            auth.signOut()
            return null
        }
        return user.getIdToken(false).await().token
    }

    fun signOut() = auth.signOut()

    companion object {
        private const val OWNER_EMAIL = "yoalmog@gmail.com"
    }
}
