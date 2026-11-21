package com.example.openpos.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.example.openpos.R
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
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
        val serverClientId = activity.getString(R.string.default_web_client_id)

        // First try the returning-user / account-picker flow.
        val googleOption = GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setFilterByAuthorizedAccounts(false)
            .build()
        val googleRequest = GetCredentialRequest.Builder()
            .addCredentialOption(googleOption)
            .build()

        // Some devices have no saved Credential Manager entry even though a
        // Google account is present on the phone. In that case show Google's
        // explicit Sign in with Google bottom sheet as a fallback.
        val result = try {
            credentialManager.getCredential(context = activity, request = googleRequest)
        } catch (_: NoCredentialException) {
            val signInOption = GetSignInWithGoogleOption.Builder()
                .setServerClientId(serverClientId)
                .build()
            val signInRequest = GetCredentialRequest.Builder()
                .addCredentialOption(signInOption)
                .build()
            credentialManager.getCredential(context = activity, request = signInRequest)
        }

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
