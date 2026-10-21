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
        const val DATABASE_VERSION = 2

        const val TABLE_CATEGORIES = "categories"
        const val TABLE_ITEMS = "items"
        const val TABLE_RECEIPTS = "receipts"
        const val TABLE_SHIFTS = "shifts"
        const val TABLE_SYNC_QUEUE = "sync_queue"
        const val TABLE_EMPLOYEES = "employees"
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
                stock_quantity INTEGER DEFAULT 100
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_RECEIPTS (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                subtotal REAL NOT NULL,
                grand_total REAL NOT NULL,
                payments_summary TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                customer_name TEXT,
                items_json TEXT NOT NULL
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
                pin TEXT NOT NULL,
                role TEXT NOT NULL
            )
        """)

        // Default employee without fake names
        val cvEmp = ContentValues().apply {
            put("id", "emp_1")
            put("name", "Cashier")
            put("pin", "1234")
            put("role", "Staff")
        }
        db.insert(TABLE_EMPLOYEES, null, cvEmp)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_CATEGORIES")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_ITEMS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_RECEIPTS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SHIFTS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SYNC_QUEUE")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_EMPLOYEES")
        onCreate(db)
    }

    // שירותי פריטים ומלאי
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

            while (it.moveToNext()) {
                list.add(
                    Item(
                        id = it.getString(idIdx),
                        name = it.getString(nameIdx),
                        price = it.getDouble(priceIdx),
                        categoryId = it.getString(catIdx),
                        barcode = it.getString(barcodeIdx),
                        color = it.getLong(colorIdx),
                        stockQuantity = it.getInt(stockIdx)
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

    // שמירת קבלה ותור סנכרון
    fun insertReceipt(receipt: Receipt) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val itemsJson = JSONArray().apply {
                receipt.items.forEach { item ->
                    put(JSONObject().apply {
                        put("name", item.item.name)
                        put("quantity", item.quantity)
                        put("unit_price", item.unitPrice)
                        put("total_price", item.totalPrice)
                    })
                }
            }.toString()

            val cv = ContentValues().apply {
                put("id", receipt.id)
                put("timestamp", receipt.timestamp)
                put("subtotal", receipt.subtotal)
                put("grand_total", receipt.grandTotal)
                put("payments_summary", receipt.payments.joinToString { "${it.type.displayName}: ₪${it.amount}" })
                put("employee_name", receipt.employeeName)
                put("customer_name", receipt.customerName)
                put("items_json", itemsJson)
            }
            db.insertWithOnConflict(TABLE_RECEIPTS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)

            // הוספה לתור סנכרון הענן
            val syncCv = ContentValues().apply {
                put("event_type", "RECEIPT_CREATED")
                put("payload_json", JSONObject().apply {
                    put("receipt_id", receipt.id)
                    put("total", receipt.grandTotal)
                    put("timestamp", receipt.timestamp)
                    put("employee", receipt.employeeName)
                }.toString())
                put("created_at", System.currentTimeMillis())
                put("synced", 0)
            }
            db.insert(TABLE_SYNC_QUEUE, null, syncCv)

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
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

    fun markEventsAsSynced() {
        val db = writableDatabase
        val cv = ContentValues().apply { put("synced", 1) }
        db.update(TABLE_SYNC_QUEUE, cv, "synced = 0", null)
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
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}
