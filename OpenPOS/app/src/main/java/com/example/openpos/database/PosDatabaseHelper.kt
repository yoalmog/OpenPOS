package com.example.openpos.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.example.openpos.model.*
import org.json.JSONArray
import org.json.JSONObject

class PosDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "openpos_master.db"
        const val DATABASE_VERSION = 3

        const val TABLE_CATEGORIES = "categories"
        const val TABLE_ITEMS = "items"
        const val TABLE_RECEIPTS = "receipts"
        const val TABLE_SHIFTS = "shifts"
        const val TABLE_SYNC_QUEUE = "sync_queue"
        const val TABLE_EMPLOYEES = "employees"
        const val TABLE_OPEN_TICKETS = "open_tickets"
        const val TABLE_STOCK_MOVEMENTS = "stock_movements"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE_CATEGORIES (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color INTEGER NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_ITEMS (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category_id TEXT NOT NULL,
                barcode TEXT,
                color INTEGER NOT NULL,
                stock_quantity INTEGER DEFAULT 100,
                station TEXT DEFAULT 'HOT_KITCHEN',
                prep_time_minutes INTEGER DEFAULT 5
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_RECEIPTS (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                subtotal REAL NOT NULL,
                tax_rate REAL DEFAULT 0.17,
                tax_amount REAL DEFAULT 0.0,
                grand_total REAL NOT NULL,
                payments_summary TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                customer_name TEXT,
                ticket_note TEXT,
                items_json TEXT NOT NULL,
                payments_json TEXT,
                is_refund INTEGER DEFAULT 0,
                original_receipt_id TEXT
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_SHIFTS (
                id TEXT PRIMARY KEY,
                employee_name TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                starting_cash REAL NOT NULL,
                cash_payments REAL DEFAULT 0.0,
                card_payments REAL DEFAULT 0.0,
                total_refunds REAL DEFAULT 0.0,
                actual_closing_cash REAL,
                is_open INTEGER DEFAULT 1
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_SYNC_QUEUE (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                synced INTEGER DEFAULT 0
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_EMPLOYEES (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                role TEXT NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_OPEN_TICKETS (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                items_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_STOCK_MOVEMENTS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                change_qty INTEGER NOT NULL,
                resulting_stock INTEGER NOT NULL,
                reason TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
        """)

        createIndices(db)

        // Seed default employees safely with SHA-256 hashes
        val cvCashier = ContentValues().apply {
            put("id", "emp_cashier")
            put("name", "Cashier")
            put("pin_hash", sha256("1234"))
            put("role", "Cashier")
        }
        db.insert(TABLE_EMPLOYEES, null, cvCashier)

        val cvManager = ContentValues().apply {
            put("id", "emp_manager")
            put("name", "Manager")
            put("pin_hash", sha256("8888"))
            put("role", "Manager")
        }
        db.insert(TABLE_EMPLOYEES, null, cvManager)
    }

    private fun createIndices(db: SQLiteDatabase) {
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_receipts_ts ON $TABLE_RECEIPTS (timestamp DESC)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_sync_queue_st ON $TABLE_SYNC_QUEUE (synced, created_at)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_items_cat ON $TABLE_ITEMS (category_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_movements_item ON $TABLE_STOCK_MOVEMENTS (item_id, timestamp DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // NON-DESTRUCTIVE INCREMENTAL MIGRATIONS: Preserve all existing sales, inventory, and settings!
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE $TABLE_ITEMS ADD COLUMN stock_quantity INTEGER DEFAULT 100")
            } catch (_: Exception) {}
        }

        if (oldVersion < 3) {
            // Add Open Tickets table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS $TABLE_OPEN_TICKETS (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    items_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """)

            // Add Stock Movements audit table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS $TABLE_STOCK_MOVEMENTS (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    change_qty INTEGER NOT NULL,
                    resulting_stock INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    timestamp INTEGER NOT NULL
                )
            """)

            // Safely alter receipts table to add missing financial precision & refund columns
            val receiptCols = listOf(
                "tax_rate REAL DEFAULT 0.17",
                "tax_amount REAL DEFAULT 0.0",
                "ticket_note TEXT",
                "payments_json TEXT",
                "is_refund INTEGER DEFAULT 0",
                "original_receipt_id TEXT"
            )
            for (col in receiptCols) {
                try {
                    db.execSQL("ALTER TABLE $TABLE_RECEIPTS ADD COLUMN $col")
                } catch (_: Exception) {}
            }

            // Safely alter shifts table for actual cash count
            try {
                db.execSQL("ALTER TABLE $TABLE_SHIFTS ADD COLUMN actual_closing_cash REAL")
            } catch (_: Exception) {}

            // Safely alter employees for pin_hash
            try {
                db.execSQL("ALTER TABLE $TABLE_EMPLOYEES ADD COLUMN pin_hash TEXT")
            } catch (_: Exception) {}

            // Safely alter items table for restaurant kitchen station and prep time
            try {
                db.execSQL("ALTER TABLE $TABLE_ITEMS ADD COLUMN station TEXT DEFAULT 'HOT_KITCHEN'")
            } catch (_: Exception) {}
            try {
                db.execSQL("ALTER TABLE $TABLE_ITEMS ADD COLUMN prep_time_minutes INTEGER DEFAULT 5")
            } catch (_: Exception) {}

            createIndices(db)
        }
    }

    // --- ITEM & CATEGORY CATALOG METHODS ---

    fun saveItems(items: List<Item>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (item in items) {
                val cv = ContentValues().apply {
                    put("id", item.id)
                    put("name", item.name)
                    put("price", item.price)
                    put("category_id", item.categoryId)
                    put("barcode", item.barcode)
                    put("color", item.color)
                    put("stock_quantity", item.stockQuantity)
                    put("station", item.station)
                    put("prep_time_minutes", item.prepTimeMinutes)
                }
                db.insertWithOnConflict(TABLE_ITEMS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun getAllItems(): List<Item> {
        val list = mutableListOf<Item>()
        val db = readableDatabase
        val cursor = db.query(TABLE_ITEMS, null, null, null, null, null, "name ASC")
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val nameIdx = it.getColumnIndexOrThrow("name")
            val priceIdx = it.getColumnIndexOrThrow("price")
            val catIdx = it.getColumnIndexOrThrow("category_id")
            val barcodeIdx = it.getColumnIndexOrThrow("barcode")
            val colorIdx = it.getColumnIndexOrThrow("color")
            val stockIdx = it.getColumnIndexOrThrow("stock_quantity")
            val stationIdx = it.getColumnIndex("station")
            val prepIdx = it.getColumnIndex("prep_time_minutes")

            while (it.moveToNext()) {
                val station = if (stationIdx >= 0 && !it.isNull(stationIdx)) it.getString(stationIdx) else "HOT_KITCHEN"
                val prepTime = if (prepIdx >= 0 && !it.isNull(prepIdx)) it.getInt(prepIdx) else 5
                list.add(
                    Item(
                        id = it.getString(idIdx),
                        name = it.getString(nameIdx),
                        price = it.getDouble(priceIdx),
                        categoryId = it.getString(catIdx),
                        barcode = it.getString(barcodeIdx),
                        color = it.getLong(colorIdx),
                        stockQuantity = it.getInt(stockIdx),
                        station = station,
                        prepTimeMinutes = prepTime
                    )
                )
            }
        }
        return list
    }

    fun saveItem(item: Item) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("id", item.id)
            put("name", item.name)
            put("price", item.price)
            put("category_id", item.categoryId)
            put("barcode", item.barcode)
            put("color", item.color)
            put("stock_quantity", item.stockQuantity)
            put("station", item.station)
            put("prep_time_minutes", item.prepTimeMinutes)
        }
        db.insertWithOnConflict(TABLE_ITEMS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun deleteItem(itemId: String) {
        val db = writableDatabase
        db.delete(TABLE_ITEMS, "id = ?", arrayOf(itemId))
    }

    fun getAllCategories(): List<Category> {
        val list = mutableListOf<Category>()
        val db = readableDatabase
        val cursor = db.query(TABLE_CATEGORIES, null, null, null, null, null, "name ASC")
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val nameIdx = it.getColumnIndexOrThrow("name")
            val colorIdx = it.getColumnIndexOrThrow("color")
            while (it.moveToNext()) {
                list.add(
                    Category(
                        id = it.getString(idIdx),
                        name = it.getString(nameIdx),
                        color = it.getLong(colorIdx)
                    )
                )
            }
        }
        return list
    }

    fun saveCategory(category: Category) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("id", category.id)
            put("name", category.name)
            put("color", category.color)
        }
        db.insertWithOnConflict(TABLE_CATEGORIES, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun deleteCategory(categoryId: String) {
        val db = writableDatabase
        db.delete(TABLE_CATEGORIES, "id = ?", arrayOf(categoryId))
        db.delete(TABLE_ITEMS, "category_id = ?", arrayOf(categoryId))
    }

    fun clearAllItemsAndCategories() {
        val db = writableDatabase
        db.execSQL("DELETE FROM $TABLE_ITEMS")
        db.execSQL("DELETE FROM $TABLE_CATEGORIES")
    }

    // --- INVENTORY & STOCK AUTOMATION ---

    fun deductStock(itemId: String, quantity: Int, reason: String = "SALE"): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            var currentStock = 0
            var itemName = "Item"
            val cursor = db.query(TABLE_ITEMS, arrayOf("name", "stock_quantity"), "id = ?", arrayOf(itemId), null, null, null)
            cursor.use {
                if (it.moveToNext()) {
                    itemName = it.getString(0)
                    currentStock = it.getInt(1)
                }
            }

            val newStock = (currentStock - quantity).coerceAtLeast(0)
            val cv = ContentValues().apply {
                put("stock_quantity", newStock)
            }
            db.update(TABLE_ITEMS, cv, "id = ?", arrayOf(itemId))

            val movCv = ContentValues().apply {
                put("item_id", itemId)
                put("item_name", itemName)
                put("change_qty", -quantity)
                put("resulting_stock", newStock)
                put("reason", reason)
                put("timestamp", System.currentTimeMillis())
            }
            db.insert(TABLE_STOCK_MOVEMENTS, null, movCv)

            db.setTransactionSuccessful()
            return newStock
        } finally {
            db.endTransaction()
        }
    }

    fun restoreStock(itemId: String, quantity: Int, reason: String = "REFUND"): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            var currentStock = 0
            var itemName = "Item"
            val cursor = db.query(TABLE_ITEMS, arrayOf("name", "stock_quantity"), "id = ?", arrayOf(itemId), null, null, null)
            cursor.use {
                if (it.moveToNext()) {
                    itemName = it.getString(0)
                    currentStock = it.getInt(1)
                }
            }

            val newStock = currentStock + quantity
            val cv = ContentValues().apply {
                put("stock_quantity", newStock)
            }
            db.update(TABLE_ITEMS, cv, "id = ?", arrayOf(itemId))

            val movCv = ContentValues().apply {
                put("item_id", itemId)
                put("item_name", itemName)
                put("change_qty", quantity)
                put("resulting_stock", newStock)
                put("reason", reason)
                put("timestamp", System.currentTimeMillis())
            }
            db.insert(TABLE_STOCK_MOVEMENTS, null, movCv)

            db.setTransactionSuccessful()
            return newStock
        } finally {
            db.endTransaction()
        }
    }

    fun getStockMovements(limit: Int = 50): List<StockMovement> {
        val list = mutableListOf<StockMovement>()
        val db = readableDatabase
        val cursor = db.query(TABLE_STOCK_MOVEMENTS, null, null, null, null, null, "timestamp DESC", limit.toString())
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val itemIdx = it.getColumnIndexOrThrow("item_id")
            val nameIdx = it.getColumnIndexOrThrow("item_name")
            val qtyIdx = it.getColumnIndexOrThrow("change_qty")
            val stockIdx = it.getColumnIndexOrThrow("resulting_stock")
            val reasonIdx = it.getColumnIndexOrThrow("reason")
            val tsIdx = it.getColumnIndexOrThrow("timestamp")

            while (it.moveToNext()) {
                list.add(
                    StockMovement(
                        id = it.getLong(idIdx),
                        itemId = it.getString(itemIdx),
                        itemName = it.getString(nameIdx),
                        changeQuantity = it.getInt(qtyIdx),
                        resultingStock = it.getInt(stockIdx),
                        reason = it.getString(reasonIdx),
                        timestamp = it.getLong(tsIdx)
                    )
                )
            }
        }
        return list
    }

    // --- RECEIPTS & COMPLETE CLOUD SYNC QUEUE ---

    fun insertReceipt(receipt: Receipt) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val itemsJsonArr = JSONArray()
            receipt.items.forEach { cartItem ->
                itemsJsonArr.put(JSONObject().apply {
                    put("itemId", cartItem.item.id)
                    put("name", cartItem.item.name)
                    put("quantity", cartItem.quantity)
                    put("unitPrice", cartItem.unitPrice)
                    put("totalPrice", cartItem.totalPrice)
                    put("discountPercent", cartItem.discountPercent)
                    put("modifiers", JSONArray().apply {
                        cartItem.selectedModifiers.forEach { m ->
                            put(JSONObject().apply {
                                put("name", m.name)
                                put("additionalPrice", m.additionalPrice)
                            })
                        }
                    })
                })
            }
            val itemsJsonStr = itemsJsonArr.toString()

            val paymentsJsonArr = JSONArray()
            receipt.payments.forEach { p ->
                paymentsJsonArr.put(JSONObject().apply {
                    put("type", p.type.name)
                    put("displayName", p.type.displayName)
                    put("amount", p.amount)
                })
            }
            val paymentsJsonStr = paymentsJsonArr.toString()

            val cv = ContentValues().apply {
                put("id", receipt.id)
                put("timestamp", receipt.timestamp)
                put("subtotal", receipt.subtotal)
                put("tax_rate", receipt.taxRate)
                put("tax_amount", receipt.taxAmount)
                put("grand_total", receipt.grandTotal)
                put("payments_summary", receipt.payments.joinToString { "${it.type.displayName}: ₪${it.amount}" })
                put("employee_name", receipt.employeeName)
                put("customer_name", receipt.customerName)
                put("ticket_note", receipt.ticketNote)
                put("items_json", itemsJsonStr)
                put("payments_json", paymentsJsonStr)
                put("is_refund", if (receipt.isRefund) 1 else 0)
                put("original_receipt_id", receipt.originalReceiptId)
            }
            db.insertWithOnConflict(TABLE_RECEIPTS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)

            // CRITICAL FIX: Write complete, rich transaction payload to sync queue!
            val fullPayloadJson = JSONObject().apply {
                put("id", receipt.id)
                put("timestamp", receipt.timestamp)
                put("subtotal", receipt.subtotal)
                put("taxRate", receipt.taxRate)
                put("taxAmount", receipt.taxAmount)
                put("grandTotal", receipt.grandTotal)
                put("employeeName", receipt.employeeName)
                put("customerName", receipt.customerName ?: "")
                put("ticketNote", receipt.ticketNote ?: "")
                put("isRefund", receipt.isRefund)
                put("originalReceiptId", receipt.originalReceiptId ?: "")
                put("payments", paymentsJsonArr)
                put("items", itemsJsonArr)
            }.toString()

            val syncCv = ContentValues().apply {
                put("event_type", if (receipt.isRefund) "RECEIPT_REFUNDED" else "RECEIPT_CREATED")
                put("payload_json", fullPayloadJson)
                put("created_at", System.currentTimeMillis())
                put("synced", 0)
            }
            db.insert(TABLE_SYNC_QUEUE, null, syncCv)

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun getAllReceipts(limit: Int = 100): List<Receipt> {
        val list = mutableListOf<Receipt>()
        val db = readableDatabase
        val cursor = db.query(TABLE_RECEIPTS, null, null, null, null, null, "timestamp DESC", limit.toString())
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val tsIdx = it.getColumnIndexOrThrow("timestamp")
            val subIdx = it.getColumnIndexOrThrow("subtotal")
            val taxRateIdx = it.getColumnIndex("tax_rate")
            val empIdx = it.getColumnIndexOrThrow("employee_name")
            val custIdx = it.getColumnIndexOrThrow("customer_name")
            val noteIdx = it.getColumnIndex("ticket_note")
            val itemsJsonIdx = it.getColumnIndexOrThrow("items_json")
            val paymentsJsonIdx = it.getColumnIndex("payments_json")
            val isRefundIdx = it.getColumnIndex("is_refund")
            val origIdIdx = it.getColumnIndex("original_receipt_id")

            while (it.moveToNext()) {
                val receiptId = it.getString(idIdx)
                val timestamp = it.getLong(tsIdx)
                val subtotal = it.getDouble(subIdx)
                val taxRate = if (taxRateIdx >= 0 && !it.isNull(taxRateIdx)) it.getDouble(taxRateIdx) else 0.17
                val employeeName = it.getString(empIdx)
                val customerName = if (!it.isNull(custIdx)) it.getString(custIdx) else null
                val ticketNote = if (noteIdx >= 0 && !it.isNull(noteIdx)) it.getString(noteIdx) else null
                val isRefund = if (isRefundIdx >= 0 && !it.isNull(isRefundIdx)) it.getInt(isRefundIdx) == 1 else false
                val originalReceiptId = if (origIdIdx >= 0 && !it.isNull(origIdIdx)) it.getString(origIdIdx) else null

                // Parse items
                val parsedItems = mutableListOf<CartItem>()
                val itemsRaw = it.getString(itemsJsonIdx)
                try {
                    val arr = JSONArray(itemsRaw)
                    for (i in 0 until arr.length()) {
                        val obj = arr.getJSONObject(i)
                        val name = obj.optString("name", "Item")
                        val qty = obj.optInt("quantity", 1)
                        val unitPrice = obj.optDouble("unitPrice", obj.optDouble("unit_price", 0.0))
                        val disc = obj.optDouble("discountPercent", 0.0)
                        val itemId = obj.optString("itemId", "item_$i")

                        val cartItem = CartItem(
                            item = Item(id = itemId, name = name, price = unitPrice, categoryId = "general"),
                            quantity = qty,
                            discountPercent = disc
                        )
                        parsedItems.add(cartItem)
                    }
                } catch (_: Exception) {}

                // Parse payments
                val parsedPayments = mutableListOf<PaymentRecord>()
                if (paymentsJsonIdx >= 0 && !it.isNull(paymentsJsonIdx)) {
                    try {
                        val payArr = JSONArray(it.getString(paymentsJsonIdx))
                        for (p in 0 until payArr.length()) {
                            val pObj = payArr.getJSONObject(p)
                            val typeStr = pObj.optString("type", "CASH")
                            val amount = pObj.optDouble("amount", 0.0)
                            val payType = try { PaymentType.valueOf(typeStr) } catch (_: Exception) { PaymentType.CASH }
                            parsedPayments.add(PaymentRecord(type = payType, amount = amount))
                        }
                    } catch (_: Exception) {}
                }
                if (parsedPayments.isEmpty()) {
                    parsedPayments.add(PaymentRecord(PaymentType.CASH, subtotal * (1.0 + taxRate)))
                }

                list.add(
                    Receipt(
                        id = receiptId,
                        timestamp = timestamp,
                        items = parsedItems,
                        subtotal = subtotal,
                        taxRate = taxRate,
                        payments = parsedPayments,
                        employeeName = employeeName,
                        customerName = customerName,
                        ticketNote = ticketNote,
                        isRefund = isRefund,
                        originalReceiptId = originalReceiptId
                    )
                )
            }
        }
        return list
    }

    // --- CLOUD SYNC QUEUE OPERATIONS ---

    fun getPendingSyncEvents(limit: Int = 50): List<SyncQueueEvent> {
        val list = mutableListOf<SyncQueueEvent>()
        val db = readableDatabase
        val cursor = db.query(
            TABLE_SYNC_QUEUE,
            arrayOf("id", "event_type", "payload_json", "created_at"),
            "synced = 0",
            null,
            null,
            null,
            "created_at ASC",
            limit.toString()
        )
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val typeIdx = it.getColumnIndexOrThrow("event_type")
            val payloadIdx = it.getColumnIndexOrThrow("payload_json")
            val tsIdx = it.getColumnIndexOrThrow("created_at")

            while (it.moveToNext()) {
                list.add(
                    SyncQueueEvent(
                        id = it.getLong(idIdx),
                        eventType = it.getString(typeIdx),
                        payloadJson = it.getString(payloadIdx),
                        createdAt = it.getLong(tsIdx)
                    )
                )
            }
        }
        return list
    }

    fun getPendingSyncEventsCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_SYNC_QUEUE WHERE synced = 0", null)
        cursor.use {
            if (it.moveToNext()) {
                return it.getInt(0)
            }
        }
        return 0
    }

    // CRITICAL FIX: Only mark specifically acknowledged IDs!
    fun markEventsAsSynced(eventIds: List<Long>) {
        if (eventIds.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            val cv = ContentValues().apply { put("synced", 1) }
            val inClause = eventIds.joinToString(",")
            db.update(TABLE_SYNC_QUEUE, cv, "id IN ($inClause)", null)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // --- OPEN TICKETS PERSISTENCE ---

    fun saveOpenTicket(ticket: OpenTicket) {
        val db = writableDatabase
        val itemsArr = JSONArray()
        ticket.items.forEach { ci ->
            itemsArr.put(JSONObject().apply {
                put("id", ci.item.id)
                put("name", ci.item.name)
                put("price", ci.item.price)
                put("categoryId", ci.item.categoryId)
                put("barcode", ci.item.barcode ?: "")
                put("color", ci.item.color)
                put("quantity", ci.quantity)
                put("discountPercent", ci.discountPercent)
            })
        }

        val cv = ContentValues().apply {
            put("id", ticket.id)
            put("name", ticket.name)
            put("items_json", itemsArr.toString())
            put("updated_at", ticket.updatedAt)
        }
        db.insertWithOnConflict(TABLE_OPEN_TICKETS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun deleteOpenTicket(ticketId: String) {
        val db = writableDatabase
        db.delete(TABLE_OPEN_TICKETS, "id = ?", arrayOf(ticketId))
    }

    fun getAllOpenTickets(): List<OpenTicket> {
        val list = mutableListOf<OpenTicket>()
        val db = readableDatabase
        val cursor = db.query(TABLE_OPEN_TICKETS, null, null, null, null, null, "updated_at DESC")
        cursor.use {
            val idIdx = it.getColumnIndexOrThrow("id")
            val nameIdx = it.getColumnIndexOrThrow("name")
            val itemsIdx = it.getColumnIndexOrThrow("items_json")
            val tsIdx = it.getColumnIndexOrThrow("updated_at")

            while (it.moveToNext()) {
                val id = it.getString(idIdx)
                val name = it.getString(nameIdx)
                val itemsRaw = it.getString(itemsIdx)
                val ts = it.getLong(tsIdx)

                val cartItems = mutableListOf<CartItem>()
                try {
                    val arr = JSONArray(itemsRaw)
                    for (i in 0 until arr.length()) {
                        val obj = arr.getJSONObject(i)
                        val item = Item(
                            id = obj.getString("id"),
                            name = obj.getString("name"),
                            price = obj.getDouble("price"),
                            categoryId = obj.getString("categoryId"),
                            barcode = if (obj.has("barcode") && !obj.isNull("barcode")) obj.getString("barcode") else null,
                            color = obj.optLong("color", 0xFF2196F3)
                        )
                        cartItems.add(
                            CartItem(
                                item = item,
                                quantity = obj.optInt("quantity", 1),
                                discountPercent = obj.optDouble("discountPercent", 0.0)
                            )
                        )
                    }
                } catch (_: Exception) {}

                list.add(OpenTicket(id = id, name = name, items = cartItems, updatedAt = ts))
            }
        }
        return list
    }

    // --- SHIFTS PERSISTENCE ---

    fun saveShift(shift: Shift) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("id", shift.id)
            put("employee_name", shift.employeeName)
            put("start_time", shift.startTime)
            put("end_time", shift.endTime)
            put("starting_cash", shift.startingCash)
            put("cash_payments", shift.cashPayments)
            put("card_payments", shift.cardPayments)
            put("total_refunds", shift.totalRefunds)
            put("actual_closing_cash", shift.actualClosingCash)
            put("is_open", if (shift.isOpen) 1 else 0)
        }
        db.insertWithOnConflict(TABLE_SHIFTS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getActiveShift(): Shift? {
        val db = readableDatabase
        val cursor = db.query(TABLE_SHIFTS, null, "is_open = 1", null, null, null, "start_time DESC", "1")
        cursor.use {
            if (it.moveToNext()) {
                val id = it.getString(it.getColumnIndexOrThrow("id"))
                val emp = it.getString(it.getColumnIndexOrThrow("employee_name"))
                val start = it.getLong(it.getColumnIndexOrThrow("start_time"))
                val endIdx = it.getColumnIndexOrThrow("end_time")
                val end = if (!it.isNull(endIdx)) it.getLong(endIdx) else null
                val startCash = it.getDouble(it.getColumnIndexOrThrow("starting_cash"))
                val cashPay = it.getDouble(it.getColumnIndexOrThrow("cash_payments"))
                val cardPay = it.getDouble(it.getColumnIndexOrThrow("card_payments"))
                val refunds = it.getDouble(it.getColumnIndexOrThrow("total_refunds"))
                val actualCashIdx = it.getColumnIndexOrThrow("actual_closing_cash")
                val actualCash = if (!it.isNull(actualCashIdx)) it.getDouble(actualCashIdx) else null

                return Shift(
                    id = id,
                    employeeName = emp,
                    startTime = start,
                    endTime = end,
                    startingCash = startCash,
                    cashPayments = cashPay,
                    cardPayments = cardPay,
                    totalRefunds = refunds,
                    actualClosingCash = actualCash,
                    isOpen = true
                )
            }
        }
        return null
    }

    fun closeActiveShift(actualCash: Double): Shift? {
        val active = getActiveShift() ?: return null
        val closed = active.copy(
            endTime = System.currentTimeMillis(),
            actualClosingCash = actualCash,
            isOpen = false
        )
        saveShift(closed)
        return closed
    }

    // --- EMPLOYEE & SECURE PIN VERIFICATION ---

    fun getEmployeeByPin(pin: String): Employee? {
        val hash = sha256(pin)
        val db = readableDatabase
        val cursor = db.query(TABLE_EMPLOYEES, null, "pin_hash = ?", arrayOf(hash), null, null, null)
        cursor.use {
            if (it.moveToNext()) {
                return Employee(
                    id = it.getString(it.getColumnIndexOrThrow("id")),
                    name = it.getString(it.getColumnIndexOrThrow("name")),
                    pinHash = hash,
                    role = it.getString(it.getColumnIndexOrThrow("role"))
                )
            }
        }
        return null
    }

    fun clearAllData() {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete(TABLE_ITEMS, null, null)
            db.delete(TABLE_CATEGORIES, null, null)
            db.delete(TABLE_RECEIPTS, null, null)
            db.delete(TABLE_SHIFTS, null, null)
            db.delete(TABLE_SYNC_QUEUE, null, null)
            db.delete(TABLE_OPEN_TICKETS, null, null)
            db.delete(TABLE_STOCK_MOVEMENTS, null, null)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}
