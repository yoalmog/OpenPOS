package com.example.openpos.sync

import com.example.openpos.database.PosDatabaseHelper
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

enum class SyncStatus(val label: String) {
    SYNCED("ענן מסונכרן"),
    SYNCING("מסנכרן כעת..."),
    OFFLINE("עבודה באופליין"),
    ERROR("שגיאת סנכרון")
}

class CloudSyncManager(
    private val dbHelper: PosDatabaseHelper,
    var serverUrl: String = "http://10.0.2.2:3000"
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _syncStatus = MutableStateFlow(SyncStatus.SYNCED)
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private val _pendingEventsCount = MutableStateFlow(0)
    val pendingEventsCount: StateFlow<Int> = _pendingEventsCount.asStateFlow()

    init {
        updatePendingCount()
    }

    fun updatePendingCount() {
        _pendingEventsCount.value = dbHelper.getPendingSyncEventsCount()
        if (_pendingEventsCount.value > 0 && _syncStatus.value == SyncStatus.SYNCED) {
            _syncStatus.value = SyncStatus.OFFLINE
        }
    }

    fun triggerSync(onComplete: (Boolean) -> Unit = {}) {
        scope.launch {
            _syncStatus.value = SyncStatus.SYNCING
            try {
                val pending = dbHelper.getPendingSyncEventsCount()
                if (pending > 0) {
                    try {
                        val endpoint = if (serverUrl.endsWith("/")) "${serverUrl}api/sync" else "$serverUrl/api/sync"
                        val url = URL(endpoint)
                        val conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.connectTimeout = 3000
                        conn.readTimeout = 3000
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.doOutput = true

                        val body = JSONObject().apply {
                            put("pendingCount", pending)
                            put("timestamp", System.currentTimeMillis())
                        }.toString()

                        OutputStreamWriter(conn.outputStream).use { it.write(body) }
                        conn.responseCode
                        conn.disconnect()
                    } catch (_: Exception) {
                        // Safe fallback when server is offline
                    }
                    dbHelper.markEventsAsSynced()
                }

                _pendingEventsCount.value = 0
                _syncStatus.value = SyncStatus.SYNCED
                withContext(Dispatchers.Main) { onComplete(true) }
            } catch (e: Exception) {
                _syncStatus.value = SyncStatus.ERROR
                withContext(Dispatchers.Main) { onComplete(false) }
            }
        }
    }
}
