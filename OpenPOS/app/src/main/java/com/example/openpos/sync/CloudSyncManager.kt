package com.example.openpos.sync

import com.example.openpos.database.PosDatabaseHelper
import com.example.openpos.model.Category
import com.example.openpos.model.Item
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
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
    var serverUrl: String = "http://10.0.2.2:3000",
    var apiKey: String = "openpos_sec_key_2026"
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _syncStatus = MutableStateFlow(SyncStatus.SYNCED)
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private val _pendingEventsCount = MutableStateFlow(0)
    val pendingEventsCount: StateFlow<Int> = _pendingEventsCount.asStateFlow()

    private val _lastSyncTime = MutableStateFlow<Long?>(null)
    val lastSyncTime: StateFlow<Long?> = _lastSyncTime.asStateFlow()

    private val _lastSyncError = MutableStateFlow<String?>(null)
    val lastSyncError: StateFlow<String?> = _lastSyncError.asStateFlow()

    // Callback for two-way catalog synchronization (server to POS)
    var onCatalogReceived: ((List<Item>, List<Category>) -> Unit)? = null

    init {
        updatePendingCount()
        startAutoSyncLoop()
    }

    fun updatePendingCount() {
        val count = dbHelper.getPendingSyncEventsCount()
        _pendingEventsCount.value = count
        if (count > 0 && _syncStatus.value == SyncStatus.SYNCED) {
            _syncStatus.value = SyncStatus.OFFLINE
        }
    }

    private fun startAutoSyncLoop() {
        scope.launch {
            while (isActive) {
                delay(45_000) // sync check every 45s
                try {
                    val pending = dbHelper.getPendingSyncEventsCount()
                    if (pending > 0 || _syncStatus.value == SyncStatus.OFFLINE) {
                        triggerSync()
                    }
                } catch (_: Exception) {}
            }
        }
    }

    fun triggerSync(onComplete: (Boolean) -> Unit = {}) {
        scope.launch {
            _syncStatus.value = SyncStatus.SYNCING
            _lastSyncError.value = null

            val pendingEvents = dbHelper.getPendingSyncEvents(limit = 50)
            val eventsArray = JSONArray()

            for (event in pendingEvents) {
                eventsArray.put(JSONObject().apply {
                    put("id", event.id)
                    put("type", event.eventType)
                    try {
                        put("payload", JSONObject(event.payloadJson))
                    } catch (_: Exception) {
                        put("payload", event.payloadJson)
                    }
                })
            }

            try {
                val cleanUrl = serverUrl.trim().removeSuffix("/")
                val endpoint = "$cleanUrl/api/sync"
                val url = URL(endpoint)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 7000
                conn.readTimeout = 7000
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("x-api-key", apiKey)
                conn.doOutput = true

                val requestBody = JSONObject().apply {
                    put("client", "Android-OpenPOS")
                    put("timestamp", System.currentTimeMillis())
                    put("pendingCount", pendingEvents.size)
                    put("events", eventsArray)
                }.toString()

                OutputStreamWriter(conn.outputStream, "UTF-8").use {
                    it.write(requestBody)
                    it.flush()
                }

                val responseCode = conn.responseCode
                if (responseCode in 200..299) {
                    val responseStr = BufferedReader(InputStreamReader(conn.inputStream, "UTF-8")).use {
                        it.readText()
                    }
                    conn.disconnect()

                    val responseJson = JSONObject(responseStr)

                    // CRITICAL FIX: Only mark specifically acknowledged IDs as synced!
                    val ackIds = mutableListOf<Long>()
                    if (responseJson.has("acknowledgedIds")) {
                        val ackArr = responseJson.getJSONArray("acknowledgedIds")
                        for (i in 0 until ackArr.length()) {
                            ackIds.add(ackArr.getLong(i))
                        }
                    } else if (responseJson.optBoolean("success", false) && pendingEvents.isNotEmpty()) {
                        // If backend returned success without id array, acknowledge all sent batch
                        ackIds.addAll(pendingEvents.map { it.id })
                    }

                    if (ackIds.isNotEmpty()) {
                        dbHelper.markEventsAsSynced(ackIds)
                    }

                    // Two-way Catalog Sync (Backend -> Local POS)
                    if (responseJson.has("items") || responseJson.has("categories")) {
                        val serverItems = mutableListOf<Item>()
                        val serverCategories = mutableListOf<Category>()

                        if (responseJson.has("categories")) {
                            val catArr = responseJson.getJSONArray("categories")
                            for (c in 0 until catArr.length()) {
                                val cObj = catArr.getJSONObject(c)
                                serverCategories.add(
                                    Category(
                                        id = cObj.getString("id"),
                                        name = cObj.getString("name"),
                                        color = cObj.optLong("color", 0xFF1976D2)
                                    )
                                )
                            }
                        }

                        if (responseJson.has("items")) {
                            val itmArr = responseJson.getJSONArray("items")
                            for (itIdx in 0 until itmArr.length()) {
                                val iObj = itmArr.getJSONObject(itIdx)
                                serverItems.add(
                                    Item(
                                        id = iObj.getString("id"),
                                        name = iObj.getString("name"),
                                        price = iObj.getDouble("price"),
                                        categoryId = iObj.optString("categoryId", "general"),
                                        barcode = if (iObj.has("barcode") && !iObj.isNull("barcode")) iObj.getString("barcode") else null,
                                        color = iObj.optLong("color", 0xFF2E7D32),
                                        stockQuantity = iObj.optInt("stockQuantity", 100)
                                    )
                                )
                            }
                        }

                        if (serverItems.isNotEmpty() || serverCategories.isNotEmpty()) {
                            withContext(Dispatchers.Main) {
                                onCatalogReceived?.invoke(serverItems, serverCategories)
                            }
                        }
                    }

                    val remaining = dbHelper.getPendingSyncEventsCount()
                    _pendingEventsCount.value = remaining
                    _syncStatus.value = if (remaining > 0) SyncStatus.OFFLINE else SyncStatus.SYNCED
                    _lastSyncTime.value = System.currentTimeMillis()

                    withContext(Dispatchers.Main) { onComplete(true) }
                } else {
                    // Non-200 HTTP response - DO NOT MARK AS SYNCED!
                    val errorText = try {
                        BufferedReader(InputStreamReader(conn.errorStream ?: conn.inputStream, "UTF-8")).use {
                            it.readText()
                        }
                    } catch (_: Exception) {
                        "HTTP $responseCode"
                    }
                    conn.disconnect()

                    _lastSyncError.value = "Server error ($responseCode): $errorText"
                    _pendingEventsCount.value = dbHelper.getPendingSyncEventsCount()
                    _syncStatus.value = SyncStatus.ERROR
                    withContext(Dispatchers.Main) { onComplete(false) }
                }
            } catch (e: Exception) {
                // Network error or timeout - DO NOT MARK AS SYNCED!
                _lastSyncError.value = "Network unreachable: ${e.message}"
                _pendingEventsCount.value = dbHelper.getPendingSyncEventsCount()
                _syncStatus.value = SyncStatus.OFFLINE
                withContext(Dispatchers.Main) { onComplete(false) }
            }
        }
    }
}
