package com.example.openpos.data

import android.content.Context
import com.example.openpos.database.PosDatabaseHelper
import com.example.openpos.model.*
import com.example.openpos.printer.EscPosPrinter
import com.example.openpos.sync.CloudSyncManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class PosRepository private constructor(context: Context? = null) {

    private val dbHelper: PosDatabaseHelper? = context?.let { PosDatabaseHelper(it) }
    val syncManager: CloudSyncManager? = dbHelper?.let { CloudSyncManager(it) }
    val printer: EscPosPrinter? = context?.let { EscPosPrinter(it) }

    private val prefs = context?.getSharedPreferences("openpos_settings", Context.MODE_PRIVATE)

    // Store & System Settings
    private val _settings = MutableStateFlow(
        AppSettings(
            storeName = prefs?.getString("store_name", "OpenPOS Store") ?: "OpenPOS Store",
            taxRatePercent = (prefs?.getFloat("tax_rate", 17.0f) ?: 17.0f).toDouble(),
            currencySymbol = prefs?.getString("currency_symbol", "$") ?: "$",
            syncServerUrl = prefs?.getString("sync_server_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000",
            cashierName = prefs?.getString("cashier_name", "Cashier") ?: "Cashier",
            receiptFooter = prefs?.getString("receipt_footer", "Thank you for your visit!") ?: "Thank you for your visit!",
            defaultPrinterMac = prefs?.getString("printer_mac", null),
            apiKey = prefs?.getString("api_key", "openpos_sec_key_2026") ?: "openpos_sec_key_2026",
            managerPin = prefs?.getString("manager_pin", "8888") ?: "8888"
        )
    )
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    fun updateSettings(newSettings: AppSettings) {
        _settings.value = newSettings
        prefs?.edit()?.apply {
            putString("store_name", newSettings.storeName)
            putFloat("tax_rate", newSettings.taxRatePercent.toFloat())
            putString("currency_symbol", newSettings.currencySymbol)
            putString("sync_server_url", newSettings.syncServerUrl)
            putString("cashier_name", newSettings.cashierName)
            putString("receipt_footer", newSettings.receiptFooter)
            putString("printer_mac", newSettings.defaultPrinterMac)
            putString("api_key", newSettings.apiKey)
            putString("manager_pin", newSettings.managerPin)
            apply()
        }
        syncManager?.serverUrl = newSettings.syncServerUrl
        syncManager?.apiKey = newSettings.apiKey
    }

    // Categories List
    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    // Items Catalog
    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items.asStateFlow()

    // Shopping Cart
    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    // Open Tickets
    private val _openTickets = MutableStateFlow<List<OpenTicket>>(emptyList())
    val openTickets: StateFlow<List<OpenTicket>> = _openTickets.asStateFlow()

    // Receipts
    private val _receipts = MutableStateFlow<List<Receipt>>(emptyList())
    val receipts: StateFlow<List<Receipt>> = _receipts.asStateFlow()

    // Active Shift
    private val _currentShift = MutableStateFlow<Shift?>(null)
    val currentShift: StateFlow<Shift?> = _currentShift.asStateFlow()

    // Logged-in Employee
    private val _currentEmployee = MutableStateFlow<Employee>(
        Employee(name = "Cashier", pinHash = sha256("1234"), role = "Cashier")
    )
    val currentEmployee: StateFlow<Employee> = _currentEmployee.asStateFlow()

    init {
        // Load clean data from local SQLite database
        dbHelper?.let { db ->
            _items.value = db.getAllItems()
            _categories.value = db.getAllCategories()
            _openTickets.value = db.getAllOpenTickets()
            _receipts.value = db.getAllReceipts()
            _currentShift.value = db.getActiveShift() ?: Shift(
                employeeName = _settings.value.cashierName,
                startingCash = 0.0
            ).also { db.saveShift(it) }
        }

        syncManager?.serverUrl = _settings.value.syncServerUrl
        syncManager?.apiKey = _settings.value.apiKey

        // Setup two-way sync catalog receiver
        syncManager?.onCatalogReceived = { serverItems, serverCategories ->
            dbHelper?.let { db ->
                if (serverCategories.isNotEmpty()) {
                    serverCategories.forEach { db.saveCategory(it) }
                    _categories.value = db.getAllCategories()
                }
                if (serverItems.isNotEmpty()) {
                    db.saveItems(serverItems)
                    _items.value = db.getAllItems()
                }
            }
        }
    }

    fun addNewItem(item: Item) {
        dbHelper?.saveItem(item)
        _items.update { current ->
            val idx = current.indexOfFirst { it.id == item.id }
            if (idx >= 0) {
                current.mapIndexed { i, itm -> if (i == idx) item else itm }
            } else {
                current + item
            }
        }
    }

    fun deleteItem(itemId: String) {
        dbHelper?.deleteItem(itemId)
        _items.update { it.filterNot { itm -> itm.id == itemId } }
        _cart.update { it.filterNot { cartItm -> cartItm.item.id == itemId } }
    }

    fun addNewCategory(category: Category) {
        dbHelper?.saveCategory(category)
        _categories.update { current ->
            val idx = current.indexOfFirst { it.id == category.id }
            if (idx >= 0) {
                current.mapIndexed { i, cat -> if (i == idx) category else cat }
            } else {
                current + category
            }
        }
    }

    fun deleteCategory(categoryId: String) {
        dbHelper?.deleteCategory(categoryId)
        _categories.update { it.filterNot { cat -> cat.id == categoryId } }
        _items.update { it.filterNot { itm -> itm.categoryId == categoryId } }
    }

    fun clearAllCatalog() {
        dbHelper?.clearAllItemsAndCategories()
        _items.value = emptyList()
        _categories.value = emptyList()
        _cart.value = emptyList()
    }

    // --- CART ACTIONS ---

    fun addItemToCart(item: Item, modifiers: List<ModifierOption> = emptyList()) {
        _cart.update { current ->
            val existingIndex = current.indexOfFirst {
                it.item.id == item.id && it.selectedModifiers == modifiers
            }
            if (existingIndex >= 0) {
                current.mapIndexed { index, cartItem ->
                    if (index == existingIndex) cartItem.copy(quantity = cartItem.quantity + 1)
                    else cartItem
                }
            } else {
                current + CartItem(item = item, selectedModifiers = modifiers, quantity = 1)
            }
        }
    }

    fun updateQuantity(cartItemId: String, newQuantity: Int) {
        _cart.update { current ->
            if (newQuantity <= 0) {
                current.filterNot { it.cartItemId == cartItemId }
            } else {
                current.map {
                    if (it.cartItemId == cartItemId) it.copy(quantity = newQuantity)
                    else it
                }
            }
        }
    }

    fun applyDiscount(cartItemId: String, discountPercent: Double) {
        _cart.update { current ->
            current.map {
                if (it.cartItemId == cartItemId) it.copy(discountPercent = discountPercent.coerceIn(0.0, 100.0))
                else it
            }
        }
    }

    fun clearCart() {
        _cart.value = emptyList()
    }

    // --- OPEN TICKETS (PERSISTED IN SQLITE) ---

    fun saveCartAsOpenTicket(name: String): Boolean {
        if (_cart.value.isEmpty()) return false
        val ticket = OpenTicket(
            name = name.ifBlank { "Ticket #${_openTickets.value.size + 1}" },
            items = _cart.value
        )
        dbHelper?.saveOpenTicket(ticket)
        _openTickets.update { it + ticket }
        clearCart()
        return true
    }

    fun loadOpenTicket(ticketId: String): Boolean {
        val ticket = _openTickets.value.find { it.id == ticketId } ?: return false
        dbHelper?.deleteOpenTicket(ticketId)
        _cart.value = ticket.items
        _openTickets.update { it.filterNot { t -> t.id == ticketId } }
        return true
    }

    // --- CHECKOUT WITH AUTOMATIC INVENTORY DECREMENT & SHIFT TRACKING ---

    fun checkout(payments: List<PaymentRecord>, customerName: String? = null): Receipt? {
        val currentItems = _cart.value
        if (currentItems.isEmpty()) return null

        val subtotal = currentItems.sumOf { it.totalPrice }
        val receipt = Receipt(
            items = currentItems,
            subtotal = subtotal,
            taxRate = _settings.value.taxRatePercent / 100.0,
            payments = payments,
            employeeName = _currentEmployee.value.name,
            customerName = customerName
        )

        // 1. Automatic Stock Decrement on Checkout
        dbHelper?.let { db ->
            currentItems.forEach { cartItem ->
                db.deductStock(cartItem.item.id, cartItem.quantity, "SALE: ${receipt.id}")
            }
            // 2. Persist full receipt & enqueue delta sync event
            db.insertReceipt(receipt)
            // Reload updated stock
            _items.value = db.getAllItems()
        }

        // 3. Update active shift in memory & SQLite
        _currentShift.update { shift ->
            val updated = shift?.let {
                val cashSum = payments.filter { p -> p.type == PaymentType.CASH }.sumOf { p -> p.amount }
                val cardSum = payments.filter { p -> p.type == PaymentType.CARD }.sumOf { p -> p.amount }
                it.copy(
                    cashPayments = it.cashPayments + cashSum,
                    cardPayments = it.cardPayments + cardSum
                )
            }
            updated?.let { dbHelper?.saveShift(it) }
            updated
        }

        // 4. Update in-memory receipts
        _receipts.update { listOf(receipt) + it }

        // 5. Trigger cloud sync (reliable delta)
        syncManager?.updatePendingCount()
        syncManager?.triggerSync()

        clearCart()
        return receipt
    }

    // --- FULL REFUND & AUTOMATIC INVENTORY RESTORATION ---

    fun refundReceipt(receiptId: String): Boolean {
        val original = _receipts.value.find { it.id == receiptId } ?: return false
        if (original.isRefund) return false // Prevent double refund

        val refundReceipt = Receipt(
            id = "REF-${System.currentTimeMillis() % 100000}",
            timestamp = System.currentTimeMillis(),
            items = original.items,
            subtotal = -original.subtotal,
            taxRate = original.taxRate,
            payments = original.payments.map { it.copy(amount = -it.amount) },
            employeeName = _currentEmployee.value.name,
            customerName = original.customerName,
            ticketNote = "Refund for ${original.id}",
            isRefund = true,
            originalReceiptId = original.id
        )

        // 1. Restore Stock in DB
        dbHelper?.let { db ->
            original.items.forEach { cartItem ->
                db.restoreStock(cartItem.item.id, cartItem.quantity, "REFUND: ${original.id}")
            }
            // 2. Persist refund receipt & enqueue sync
            db.insertReceipt(refundReceipt)
            _items.value = db.getAllItems()
        }

        // 3. Update shift in memory and DB
        _currentShift.update { shift ->
            val updated = shift?.copy(totalRefunds = shift.totalRefunds + original.grandTotal)
            updated?.let { dbHelper?.saveShift(it) }
            updated
        }

        // 4. Update receipts list
        _receipts.update { listOf(refundReceipt) + it }

        // 5. Trigger cloud sync
        syncManager?.updatePendingCount()
        syncManager?.triggerSync()

        return true
    }

    // --- SHIFT MANAGEMENT (START / CLOSE / Z-REPORT) ---

    fun startNewShift(startingCash: Double): Shift {
        val newShift = Shift(
            employeeName = _currentEmployee.value.name,
            startingCash = startingCash
        )
        dbHelper?.saveShift(newShift)
        _currentShift.value = newShift
        return newShift
    }

    fun closeActiveShift(actualClosingCash: Double): Shift? {
        val closed = dbHelper?.closeActiveShift(actualClosingCash)
        _currentShift.value = null
        return closed
    }

    // --- SECURE EMPLOYEE LOGIN ---

    fun verifyPin(pin: String): Employee? {
        val emp = dbHelper?.getEmployeeByPin(pin)
        if (emp != null) return emp
        // Fallback check against manager PIN in settings
        if (pin == _settings.value.managerPin) {
            return Employee(name = "Manager", pinHash = sha256(pin), role = "Manager")
        }
        return null
    }

    fun switchEmployee(employee: Employee) {
        _currentEmployee.value = employee
    }

    fun resetAllData() {
        dbHelper?.clearAllData()
        _items.value = emptyList()
        _categories.value = emptyList()
        _cart.value = emptyList()
        _openTickets.value = emptyList()
        _receipts.value = emptyList()
        _currentShift.value = Shift(employeeName = _settings.value.cashierName, startingCash = 0.0)
        syncManager?.updatePendingCount()
    }

    companion object {
        @Volatile
        private var INSTANCE: PosRepository? = null

        fun getInstance(context: Context? = null): PosRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: PosRepository(context?.applicationContext).also { INSTANCE = it }
            }
        }

        val instance: PosRepository
            get() = INSTANCE ?: PosRepository(null).also { INSTANCE = it }
    }
}
