package com.example.openpos.ui.pos

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.openpos.data.PosRepository
import com.example.openpos.i18n.AppLanguage
import com.example.openpos.i18n.LocalizationManager
import com.example.openpos.i18n.PosStrings
import com.example.openpos.model.*
import com.example.openpos.scanner.BarcodeScannerDialog
import com.example.openpos.sync.SyncStatus
import kotlinx.coroutines.launch
import java.text.DecimalFormat

fun getCurrencyFormat(lang: AppLanguage): DecimalFormat {
    return when (lang) {
        AppLanguage.ENGLISH -> DecimalFormat("$#,##0.00")
        AppLanguage.HEBREW -> DecimalFormat("₪#,##0.00")
        AppLanguage.SPANISH -> DecimalFormat("€#,##0.00")
        AppLanguage.ARABIC -> DecimalFormat("₪#,##0.00")
    }
}

fun getLocalizedPaymentTypeName(type: PaymentType, strings: PosStrings): String {
    return when (type) {
        PaymentType.CASH -> strings.cash
        PaymentType.CARD -> strings.card
        PaymentType.OTHER -> strings.otherPayment
    }
}

enum class PosTab {
    CATALOG,
    CART
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(
    repository: PosRepository = PosRepository.instance,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val currentLanguage by LocalizationManager.currentLanguage.collectAsState()
    val strings = LocalizationManager.getStrings(currentLanguage)
    val settings by repository.settings.collectAsState()

    val currencyFormat = remember(settings.currencySymbol) {
        try {
            DecimalFormat("${settings.currencySymbol}#,##0.00")
        } catch (_: Exception) {
            DecimalFormat("$#,##0.00")
        }
    }

    val categories by repository.categories.collectAsState()
    val items by repository.items.collectAsState()
    val cart by repository.cart.collectAsState()
    val openTickets by repository.openTickets.collectAsState()
    val currentShift by repository.currentShift.collectAsState()
    val currentEmployee by repository.currentEmployee.collectAsState()

    var activeTab by remember { mutableStateOf(PosTab.CATALOG) }
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }
    var itemForModifierDialog by remember { mutableStateOf<Item?>(null) }
    var showPaymentDialog by remember { mutableStateOf(false) }
    var showTicketsDialog by remember { mutableStateOf(false) }
    var showShiftDialog by remember { mutableStateOf(false) }
    var showSaveTicketDialog by remember { mutableStateOf(false) }
    var showBarcodeScannerDialog by remember { mutableStateOf(false) }
    var showPrinterSelectionDialog by remember { mutableStateOf(false) }
    var showLanguageMenu by remember { mutableStateOf(false) }
    var showAddProductDialog by remember { mutableStateOf(false) }
    var showSettingsDialog by remember { mutableStateOf(false) }
    var showReceiptsDialog by remember { mutableStateOf(false) }
    var receiptToInspect by remember { mutableStateOf<Receipt?>(null) }
    var itemToDelete by remember { mutableStateOf<Item?>(null) }
    var lastReceipt by remember { mutableStateOf<Receipt?>(null) }
    val receipts by repository.receipts.collectAsState()

    val syncStatus by repository.syncManager?.syncStatus?.collectAsState() ?: remember { mutableStateOf(SyncStatus.SYNCED) }
    val pendingSyncCount by repository.syncManager?.pendingEventsCount?.collectAsState() ?: remember { mutableStateOf(0) }
    val coroutineScope = rememberCoroutineScope()

    val filteredItems = remember(selectedCategoryId, items) {
        if (selectedCategoryId == null) items
        else items.filter { it.categoryId == selectedCategoryId }
    }

    val totalCartItems = cart.sumOf { it.quantity }
    val subtotal = cart.sumOf { it.totalPrice }
    val taxAmount = subtotal * (settings.taxRatePercent / 100.0)
    val grandTotal = subtotal + taxAmount

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            Text(
                                settings.storeName,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                fontSize = 15.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Text(
                            strings.mainRegister,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    // Cloud Sync Indicator Pill (Reliable status & quick sync)
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = when (syncStatus) {
                            SyncStatus.SYNCED -> Color(0xFFE8F5E9)
                            SyncStatus.SYNCING -> Color(0xFFE3F2FD)
                            SyncStatus.OFFLINE -> Color(0xFFFFF3E0)
                            SyncStatus.ERROR -> Color(0xFFFFEBEE)
                        },
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                coroutineScope.launch {
                                    repository.syncManager?.triggerSync()
                                }
                            }
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when (syncStatus) {
                                            SyncStatus.SYNCED -> Color(0xFF2E7D32)
                                            SyncStatus.SYNCING -> Color(0xFF1976D2)
                                            SyncStatus.OFFLINE -> Color(0xFFF57C00)
                                            SyncStatus.ERROR -> Color(0xFFD32F2F)
                                        }
                                    )
                            )
                            if (pendingSyncCount > 0) {
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    "$pendingSyncCount",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFE65100)
                                )
                            }
                        }
                    }

                    // Language Switcher Dropdown
                    Box {
                        IconButton(onClick = { showLanguageMenu = true }) {
                            Icon(
                                Icons.Default.Language,
                                contentDescription = strings.switchLanguage,
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                        DropdownMenu(
                            expanded = showLanguageMenu,
                            onDismissRequest = { showLanguageMenu = false }
                        ) {
                            AppLanguage.entries.forEach { lang ->
                                DropdownMenuItem(
                                    text = {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = lang.displayName,
                                                fontWeight = if (lang == currentLanguage) FontWeight.Bold else FontWeight.Normal,
                                                color = if (lang == currentLanguage) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                            )
                                            if (lang == currentLanguage) {
                                                Spacer(Modifier.width(8.dp))
                                                Icon(
                                                    Icons.Default.Check,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(16.dp),
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                            }
                                        }
                                    },
                                    onClick = {
                                        LocalizationManager.setLanguage(context, lang)
                                        showLanguageMenu = false
                                    }
                                )
                            }
                        }
                    }

                    // Barcode Scanner Action
                    IconButton(onClick = { showBarcodeScannerDialog = true }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = strings.barcodeScanner)
                    }

                    // Receipts & Refunds History Action
                    IconButton(onClick = { showReceiptsDialog = true }) {
                        Icon(Icons.Default.History, contentDescription = "Receipts & Refunds")
                    }

                    // Open Tickets Action
                    BadgedBox(
                        badge = {
                            if (openTickets.isNotEmpty()) {
                                Badge { Text(openTickets.size.toString()) }
                            }
                        }
                    ) {
                        IconButton(onClick = { showTicketsDialog = true }) {
                            Icon(Icons.AutoMirrored.Filled.ReceiptLong, contentDescription = strings.openTickets)
                        }
                    }

                    // Shift Report Action
                    IconButton(onClick = { showShiftDialog = true }) {
                        Icon(Icons.Default.Assessment, contentDescription = strings.shiftReport)
                    }

                    // Settings Action
                    IconButton(onClick = { showSettingsDialog = true }) {
                        Icon(Icons.Default.Settings, contentDescription = strings.settingsTitle)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceColorAtElevation(2.dp)
                )
            )
        },
        bottomBar = {
            // Floating 9:16 Cart & Checkout Dock when cart is not empty
            AnimatedVisibility(
                visible = cart.isNotEmpty() && activeTab == PosTab.CATALOG,
                enter = slideInVertically(initialOffsetY = { h -> h }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { h -> h }) + fadeOut()
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 8.dp,
                    shadowElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.clickable { activeTab = PosTab.CART }) {
                            Text(
                                "$totalCartItems ${strings.itemsCount}",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                currencyFormat.format(grandTotal),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }

                        Button(
                            onClick = { activeTab = PosTab.CART },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)
                        ) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(strings.viewCartAndPay, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // 9:16 Portrait Navigation Tabs: [ Catalog ] / [ Cart ]
            PrimaryTabRow(
                selectedTabIndex = activeTab.ordinal,
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary
            ) {
                Tab(
                    selected = activeTab == PosTab.CATALOG,
                    onClick = { activeTab = PosTab.CATALOG },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Storefront, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(strings.catalogTab, fontWeight = FontWeight.SemiBold)
                        }
                    }
                )

                Tab(
                    selected = activeTab == PosTab.CART,
                    onClick = { activeTab = PosTab.CART },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            BadgedBox(
                                badge = {
                                    if (totalCartItems > 0) {
                                        Badge { Text(totalCartItems.toString()) }
                                    }
                                }
                            ) {
                                Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                            Spacer(Modifier.width(6.dp))
                            Text(
                                if (grandTotal > 0) "${strings.cartTab} • ${currencyFormat.format(grandTotal)}" else strings.cartTab,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                )
            }

            // Tab Content
            when (activeTab) {
                PosTab.CATALOG -> {
                    CatalogView(
                        items = filteredItems,
                        categories = categories,
                        selectedCategoryId = selectedCategoryId,
                        currencyFormat = currencyFormat,
                        strings = strings,
                        onSelectCategory = { selectedCategoryId = it },
                        onAddItem = { showAddProductDialog = true },
                        onItemClick = { item ->
                            if (item.modifiers.isNotEmpty()) {
                                itemForModifierDialog = item
                            } else {
                                repository.addItemToCart(item)
                            }
                        },
                        onItemLongClick = { item ->
                            itemToDelete = item
                        }
                    )
                }

                PosTab.CART -> {
                    CartView(
                        cart = cart,
                        subtotal = subtotal,
                        taxRatePercent = settings.taxRatePercent,
                        taxAmount = taxAmount,
                        grandTotal = grandTotal,
                        currencyFormat = currencyFormat,
                        strings = strings,
                        onClearCart = { repository.clearCart() },
                        onUpdateQuantity = { cartItemId, qty -> repository.updateQuantity(cartItemId, qty) },
                        onSaveTicket = { showSaveTicketDialog = true },
                        onCheckout = { showPaymentDialog = true },
                        onContinueShopping = { activeTab = PosTab.CATALOG }
                    )
                }
            }
        }
    }

    // Add Product Dialog (Custom Merchant Products)
    if (showAddProductDialog) {
        AddProductDialog(
            strings = strings,
            existingCategories = categories,
            onDismiss = { showAddProductDialog = false },
            onSave = { newItem, categoryName ->
                if (categoryName.isNotBlank() && categories.none { it.name.equals(categoryName, ignoreCase = true) }) {
                    val newCat = Category(name = categoryName, color = newItem.color)
                    repository.addNewCategory(newCat)
                    repository.addNewItem(newItem.copy(categoryId = newCat.id))
                } else {
                    repository.addNewItem(newItem)
                }
                showAddProductDialog = false
            }
        )
    }

    // Delete Product Confirmation Dialog
    itemToDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { itemToDelete = null },
            title = { Text(item.name) },
            text = { Text("Delete this product from catalog?") },
            confirmButton = {
                Button(
                    onClick = {
                        repository.deleteItem(item.id)
                        itemToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { itemToDelete = null }) {
                    Text(strings.cancel)
                }
            }
        )
    }

    // Modifier Dialog
    itemForModifierDialog?.let { item ->
        ModifierSelectionDialog(
            item = item,
            currencyFormat = currencyFormat,
            strings = strings,
            onDismiss = { itemForModifierDialog = null },
            onConfirm = { selectedMods ->
                repository.addItemToCart(item, selectedMods)
                itemForModifierDialog = null
            }
        )
    }

    // Payment Dialog
    if (showPaymentDialog) {
        PaymentDialog(
            totalAmount = grandTotal,
            currencyFormat = currencyFormat,
            strings = strings,
            onDismiss = { showPaymentDialog = false },
            onCheckout = { payments ->
                val receipt = repository.checkout(payments)
                lastReceipt = receipt
                showPaymentDialog = false
                activeTab = PosTab.CATALOG
            }
        )
    }

    // Save Ticket Dialog
    if (showSaveTicketDialog) {
        SaveTicketDialog(
            strings = strings,
            onDismiss = { showSaveTicketDialog = false },
            onSave = { name ->
                repository.saveCartAsOpenTicket(name)
                showSaveTicketDialog = false
                activeTab = PosTab.CATALOG
            }
        )
    }

    // Open Tickets Dialog
    if (showTicketsDialog) {
        OpenTicketsDialog(
            tickets = openTickets,
            currencyFormat = currencyFormat,
            strings = strings,
            itemLabel = strings.itemsCount,
            onDismiss = { showTicketsDialog = false },
            onSelectTicket = { ticketId ->
                repository.loadOpenTicket(ticketId)
                showTicketsDialog = false
                activeTab = PosTab.CART
            }
        )
    }

    // Receipts & Refunds History Dialog
    if (showReceiptsDialog) {
        ReceiptsHistoryDialog(
            receipts = receipts,
            currencyFormat = currencyFormat,
            strings = strings,
            onDismiss = { showReceiptsDialog = false },
            onSelectReceipt = { r ->
                receiptToInspect = r
            }
        )
    }

    // Inspect Past Receipt & Refund Flow
    receiptToInspect?.let { receipt ->
        ReceiptDetailsDialog(
            receipt = receipt,
            currencyFormat = currencyFormat,
            strings = strings,
            isHistoryMode = true,
            onDismiss = { receiptToInspect = null },
            onPrintThermal = {
                lastReceipt = receipt
                showPrinterSelectionDialog = true
            },
            onRefund = {
                repository.refundReceipt(receipt.id)
                receiptToInspect = null
            }
        )
    }

    // Shift Report Dialog (with Z-Report Shift Closing)
    if (showShiftDialog) {
        ShiftReportDialog(
            shift = currentShift,
            currencyFormat = currencyFormat,
            strings = strings,
            onDismiss = { showShiftDialog = false },
            onEndShift = { countedCash ->
                repository.closeActiveShift(countedCash)
                repository.startNewShift(0.0)
                showShiftDialog = false
            }
        )
    }

    // Camera Barcode Scanner Dialog
    if (showBarcodeScannerDialog) {
        BarcodeScannerDialog(
            items = items,
            onDismiss = { showBarcodeScannerDialog = false },
            onBarcodeScanned = { scannedItem ->
                repository.addItemToCart(scannedItem)
            }
        )
    }

    // Bluetooth Thermal Printer Selection Dialog
    if (showPrinterSelectionDialog) {
        BluetoothPrinterSelectionDialog(
            printers = repository.printer?.getPairedPrinters() ?: emptyList(),
            strings = strings,
            onDismiss = { showPrinterSelectionDialog = false },
            onSelectPrinter = { device ->
                coroutineScope.launch {
                    val r = lastReceipt
                    if (r != null) {
                        repository.printer?.printReceipt(device, r)
                    } else {
                        repository.printer?.printTestReceipt(device, settings.storeName)
                    }
                    repository.updateSettings(settings.copy(defaultPrinterMac = device.address))
                    showPrinterSelectionDialog = false
                }
            }
        )
    }

    // Receipt Completed Dialog (Fresh Checkout)
    lastReceipt?.let { receipt ->
        ReceiptDetailsDialog(
            receipt = receipt,
            currencyFormat = currencyFormat,
            strings = strings,
            onDismiss = { lastReceipt = null },
            onPrintThermal = { showPrinterSelectionDialog = true }
        )
    }

    // Settings Dialog
    if (showSettingsDialog) {
        SettingsDialog(
            settings = settings,
            strings = strings,
            syncStatus = syncStatus,
            pendingSyncCount = pendingSyncCount,
            onDismiss = { showSettingsDialog = false },
            onSave = { newSettings -> repository.updateSettings(newSettings) },
            onSyncNow = {
                repository.syncManager?.triggerSync()
            },
            onOpenPrinterSettings = {
                showPrinterSelectionDialog = true
            },
            onResetData = {
                repository.resetAllData()
            }
        )
    }
}

@Composable
fun CatalogView(
    items: List<Item>,
    categories: List<Category>,
    selectedCategoryId: String?,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onSelectCategory: (String?) -> Unit,
    onAddItem: () -> Unit,
    onItemClick: (Item) -> Unit,
    onItemLongClick: (Item) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Category chips row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            LazyRow(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                item {
                    FilterChip(
                        selected = selectedCategoryId == null,
                        onClick = { onSelectCategory(null) },
                        label = { Text("All") }
                    )
                }

                items(categories) { category ->
                    FilterChip(
                        selected = selectedCategoryId == category.id,
                        onClick = { onSelectCategory(category.id) },
                        label = { Text(category.name) },
                        leadingIcon = {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(Color(category.color))
                            )
                        }
                    )
                }
            }

            Spacer(Modifier.width(6.dp))

            FilledTonalIconButton(onClick = onAddItem, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Default.Add, contentDescription = strings.addProduct, modifier = Modifier.size(20.dp))
            }
        }

        // Empty state or Items Grid
        if (items.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(72.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Inventory2,
                                contentDescription = null,
                                modifier = Modifier.size(36.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    Text(
                        strings.noProductsYet,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    Text(
                        strings.addFirstProductPrompt,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )

                    Button(
                        onClick = onAddItem,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(strings.addProduct)
                    }
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(items, key = { it.id }) { item ->
                    ItemCard(
                        item = item,
                        currencyFormat = currencyFormat,
                        extraLabel = "+Mod",
                        onClick = { onItemClick(item) },
                        onLongClick = { onItemLongClick(item) }
                    )
                }
            }
        }
    }
}

@Composable
fun CartView(
    cart: List<CartItem>,
    subtotal: Double,
    taxRatePercent: Double,
    taxAmount: Double,
    grandTotal: Double,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onClearCart: () -> Unit,
    onUpdateQuantity: (String, Int) -> Unit,
    onSaveTicket: () -> Unit,
    onCheckout: () -> Unit,
    onContinueShopping: () -> Unit
) {
    if (cart.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Icon(
                    Icons.Default.RemoveShoppingCart,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )

                Text(
                    strings.emptyCartTitle,
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedButton(onClick = onContinueShopping) {
                    Icon(Icons.Default.Storefront, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(strings.catalogTab)
                }
            }
        }
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "${strings.cartTitle} (${cart.sumOf { it.quantity }})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                TextButton(onClick = onClearCart) {
                    Text(strings.clearAll, color = MaterialTheme.colorScheme.error)
                }
            }

            Spacer(Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(cart, key = { it.cartItemId }) { cartItem ->
                    CartItemRow(
                        cartItem = cartItem,
                        currencyFormat = currencyFormat,
                        onPlus = { onUpdateQuantity(cartItem.cartItemId, cartItem.quantity + 1) },
                        onMinus = { onUpdateQuantity(cartItem.cartItemId, cartItem.quantity - 1) }
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            // Financial Summary
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(strings.subtotal, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(currencyFormat.format(subtotal))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${strings.taxRateLabel} (${taxRatePercent}%):", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(currencyFormat.format(taxAmount))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(strings.totalToPay, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        currencyFormat.format(grandTotal),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onSaveTicket,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(strings.saveTicket)
                }

                Button(
                    onClick = onCheckout,
                    modifier = Modifier.weight(1.5f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Payment, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(strings.checkoutButton, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ItemCard(
    item: Item,
    currencyFormat: DecimalFormat,
    extraLabel: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(115.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(10.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(Color(item.color))
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        item.name,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = when {
                        item.stockQuantity <= 0 -> Color(0xFFFFEBEE)
                        item.stockQuantity <= 5 -> Color(0xFFFFF3E0)
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                ) {
                    Text(
                        text = if (item.stockQuantity <= 0) "0" else "${item.stockQuantity}",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            item.stockQuantity <= 0 -> Color(0xFFD32F2F)
                            item.stockQuantity <= 5 -> Color(0xFFE65100)
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    currencyFormat.format(item.price),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 15.sp
                )
                if (item.modifiers.isNotEmpty()) {
                    Text(
                        extraLabel,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        }
    }
}

@Composable
fun CartItemRow(
    cartItem: CartItem,
    currencyFormat: DecimalFormat,
    onPlus: () -> Unit,
    onMinus: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    cartItem.item.name,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp
                )
                if (cartItem.selectedModifiers.isNotEmpty()) {
                    Text(
                        cartItem.selectedModifiers.joinToString(", ") { it.name },
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    currencyFormat.format(cartItem.totalPrice),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Quantity Control
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(onClick = onMinus, modifier = Modifier.size(28.dp)) {
                    Icon(
                        if (cartItem.quantity == 1) Icons.Default.Delete else Icons.Default.Remove,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = if (cartItem.quantity == 1) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    )
                }
                Text(
                    "${cartItem.quantity}",
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
                IconButton(onClick = onPlus, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
fun AddProductDialog(
    strings: PosStrings,
    existingCategories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (Item, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var priceText by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }
    var categoryName by remember { mutableStateOf("") }
    var selectedColor by remember { mutableStateOf(0xFF2196F3) }

    val colors = listOf(0xFF2196F3, 0xFF4CAF50, 0xFFFF9800, 0xFFE91E63, 0xFF9C27B0, 0xFF009688)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.addProduct) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(strings.productName) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = priceText,
                    onValueChange = { priceText = it },
                    label = { Text(strings.price) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text(strings.barcodeLabel) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = categoryName,
                    onValueChange = { categoryName = it },
                    label = { Text(strings.categoryLabel) },
                    placeholder = { Text("e.g. Drinks, Food") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Color choices
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    colors.forEach { colorVal ->
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(Color(colorVal))
                                .clickable { selectedColor = colorVal }
                                .then(
                                    if (selectedColor == colorVal) Modifier.border(2.dp, Color.Black, CircleShape)
                                    else Modifier
                                )
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val price = priceText.toDoubleOrNull() ?: 0.0
                    if (name.isNotBlank() && price > 0) {
                        val newItem = Item(
                            name = name.trim(),
                            price = price,
                            categoryId = "cat_${System.currentTimeMillis() % 10000}",
                            barcode = barcode.trim().ifEmpty { null },
                            color = selectedColor
                        )
                        onSave(newItem, categoryName.trim())
                    }
                },
                enabled = name.isNotBlank() && (priceText.toDoubleOrNull() ?: 0.0) > 0
            ) {
                Text(strings.save)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )
}

@Composable
fun ModifierSelectionDialog(
    item: Item,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onConfirm: (List<ModifierOption>) -> Unit
) {
    val selected = remember { mutableStateListOf<ModifierOption>() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${strings.modifiersTitle} ${item.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item.modifiers.forEach { mod ->
                    val isChecked = selected.contains(mod)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                if (isChecked) selected.remove(mod) else selected.add(mod)
                            }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = isChecked,
                            onCheckedChange = { check ->
                                if (check) selected.add(mod) else selected.remove(mod)
                            }
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(mod.name, modifier = Modifier.weight(1f))
                        if (mod.additionalPrice > 0) {
                            Text("+${currencyFormat.format(mod.additionalPrice)}", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(selected.toList()) }) {
                Text(strings.addToOrder)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )
}

@Composable
fun SaveTicketDialog(
    strings: PosStrings,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var ticketName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.saveTicket) },
        text = {
            Column {
                Text(strings.saveTicketPrompt, fontSize = 14.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = ticketName,
                    onValueChange = { ticketName = it },
                    placeholder = { Text(strings.tableOrCustomerPlaceholder) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = { onSave(ticketName) }) {
                Text(strings.save)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )
}

@Composable
fun OpenTicketsDialog(
    tickets: List<OpenTicket>,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    itemLabel: String,
    onDismiss: () -> Unit,
    onSelectTicket: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${strings.openTickets} (${tickets.size})") },
        text = {
            if (tickets.isEmpty()) {
                Text(strings.noOpenTickets)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tickets) { ticket ->
                        val sum = ticket.items.sumOf { it.totalPrice } * 1.17
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelectTicket(ticket.id) }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(ticket.name, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text("${ticket.items.sumOf { it.quantity }} $itemLabel", fontSize = 12.sp)
                                }
                                Text(
                                    currencyFormat.format(sum),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.close)
            }
        }
    )
}

@Composable
fun ShiftReportDialog(
    shift: Shift?,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onEndShift: (actualCash: Double) -> Unit = {}
) {
    var isEndingShift by remember { mutableStateOf(false) }
    var countedCashText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Assessment, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(strings.shiftReportTitle)
            }
        },
        text = {
            if (shift == null) {
                Text(strings.noOpenTickets)
            } else {
                val totalSales = shift.cashPayments + shift.cardPayments
                val expectedCashInDrawer = shift.startingCash + shift.cashPayments - shift.totalRefunds

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("${strings.shiftManager} ${shift.employeeName}", fontWeight = FontWeight.SemiBold)
                    HorizontalDivider()
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.startingCashDrawer)
                        Text(currencyFormat.format(shift.startingCash))
                    }
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.cashSales)
                        Text(currencyFormat.format(shift.cashPayments))
                    }
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.cardSales)
                        Text(currencyFormat.format(shift.cardPayments))
                    }
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.totalShiftSales)
                        Text(currencyFormat.format(totalSales), fontWeight = FontWeight.Bold)
                    }
                    if (shift.totalRefunds > 0) {
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                            Text(strings.refundsTotal)
                            Text("-${currencyFormat.format(shift.totalRefunds)}", color = MaterialTheme.colorScheme.error)
                        }
                    }
                    HorizontalDivider()
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.expectedCashInDrawer, fontWeight = FontWeight.Bold)
                        Text(
                            currencyFormat.format(expectedCashInDrawer),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    if (isEndingShift) {
                        HorizontalDivider(Modifier.padding(vertical = 4.dp))
                        Text("Counted Cash in Drawer:", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        OutlinedTextField(
                            value = countedCashText,
                            onValueChange = { countedCashText = it },
                            placeholder = { Text("0.00") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        val counted = countedCashText.toDoubleOrNull() ?: 0.0
                        val diff = counted - expectedCashInDrawer
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                            Text("Cash Over / Short:", fontWeight = FontWeight.Bold)
                            Text(
                                (if (diff > 0) "+" else "") + currencyFormat.format(diff),
                                fontWeight = FontWeight.Bold,
                                color = when {
                                    diff == 0.0 -> Color(0xFF2E7D32)
                                    diff < 0.0 -> MaterialTheme.colorScheme.error
                                    else -> Color(0xFF1976D2)
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (shift != null) {
                    if (!isEndingShift) {
                        OutlinedButton(
                            onClick = { isEndingShift = true },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("End Shift (Z-Report)")
                        }
                    } else {
                        Button(
                            onClick = {
                                val counted = countedCashText.toDoubleOrNull() ?: 0.0
                                onEndShift(counted)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("Finalize Z-Report")
                        }
                    }
                }
                Button(onClick = onDismiss) {
                    Text(strings.close)
                }
            }
        }
    )
}

@Composable
fun PaymentDialog(
    totalAmount: Double,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onCheckout: (List<PaymentRecord>) -> Unit
) {
    var selectedType by remember { mutableStateOf(PaymentType.CASH) }
    var cashReceivedText by remember { mutableStateOf(totalAmount.toInt().toString()) }

    val cashReceived = cashReceivedText.toDoubleOrNull() ?: 0.0
    val change = (cashReceived - totalAmount).coerceAtLeast(0.0)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${strings.paymentTitle} ${currencyFormat.format(totalAmount)}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Payment Method Selector
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PaymentType.entries.forEach { type ->
                        FilterChip(
                            selected = selectedType == type,
                            onClick = { selectedType = type },
                            label = { Text(getLocalizedPaymentTypeName(type, strings)) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                if (selectedType == PaymentType.CASH) {
                    Text(strings.cashReceivedLabel, fontSize = 13.sp)
                    OutlinedTextField(
                        value = cashReceivedText,
                        onValueChange = { cashReceivedText = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    // Quick Cash Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(totalAmount.toInt(), 50, 100, 200).distinct().forEach { amt ->
                            OutlinedButton(
                                onClick = { cashReceivedText = amt.toString() },
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(2.dp)
                            ) {
                                Text(currencyFormat.format(amt.toDouble()), fontSize = 11.sp)
                            }
                        }
                    }

                    if (cashReceived >= totalAmount) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(strings.changeToReturn, fontWeight = FontWeight.Bold)
                                Text(
                                    currencyFormat.format(change),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                } else if (selectedType == PaymentType.CARD) {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            strings.tapCardNotice,
                            modifier = Modifier.padding(16.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val payRecord = if (selectedType == PaymentType.CASH) {
                        PaymentRecord(PaymentType.CASH, cashReceived.coerceAtLeast(totalAmount))
                    } else {
                        PaymentRecord(selectedType, totalAmount)
                    }
                    onCheckout(listOf(payRecord))
                },
                enabled = selectedType != PaymentType.CASH || cashReceived >= totalAmount
            ) {
                Text(strings.confirmAndFinish)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )
}

@Composable
fun ReceiptsHistoryDialog(
    receipts: List<Receipt>,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onSelectReceipt: (Receipt) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val filteredReceipts = remember(searchQuery, receipts) {
        if (searchQuery.isBlank()) receipts
        else receipts.filter {
            it.id.contains(searchQuery, ignoreCase = true) ||
            (it.customerName?.contains(searchQuery, ignoreCase = true) == true) ||
            it.employeeName.contains(searchQuery, ignoreCase = true)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text("Receipts & Transactions (${receipts.size})", fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search by receipt # or customer...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                if (filteredReceipts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text("No receipts found.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 400.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredReceipts) { r ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (r.isRefund) Color(0xFFFFEBEE) else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectReceipt(r) }
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(r.id, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                            if (r.isRefund) {
                                                Spacer(Modifier.width(6.dp))
                                                Surface(
                                                    shape = RoundedCornerShape(4.dp),
                                                    color = MaterialTheme.colorScheme.error
                                                ) {
                                                    Text(
                                                        "REFUND",
                                                        color = Color.White,
                                                        fontSize = 9.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }
                                        }
                                        val dateStr = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm").format(r.timestamp)
                                        Text("$dateStr • ${r.employeeName}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("${r.items.sumOf { it.quantity }} items", fontSize = 11.sp)
                                    }
                                    Text(
                                        currencyFormat.format(r.grandTotal),
                                        fontWeight = FontWeight.Bold,
                                        color = if (r.isRefund) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                                        fontSize = 15.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.close)
            }
        }
    )
}

@Composable
fun ReceiptDetailsDialog(
    receipt: Receipt,
    currencyFormat: DecimalFormat,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onPrintThermal: () -> Unit = {},
    isHistoryMode: Boolean = false,
    onRefund: () -> Unit = {}
) {
    var showRefundConfirm by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (receipt.isRefund) Icons.Default.Warning else Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = if (receipt.isRefund) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)
                )
                Spacer(Modifier.width(8.dp))
                Text(if (receipt.isRefund) "Refund Transaction" else strings.receiptCompleteTitle)
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (receipt.isRefund) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.errorContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "REFUNDED / CREDIT VOUCHER",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(8.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Text("${strings.receiptNumber} ${receipt.id}", fontWeight = FontWeight.Bold)
                Text("${strings.dateAndTime} ${java.text.SimpleDateFormat("dd/MM/yyyy HH:mm").format(receipt.timestamp)}")
                Text("${strings.cashierLabel} ${receipt.employeeName}")
                receipt.customerName?.let { Text("Customer: $it") }
                receipt.originalReceiptId?.let { Text("Original Receipt: $it", fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary) }
                HorizontalDivider(Modifier.padding(vertical = 4.dp))

                receipt.items.forEach { item ->
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text("${item.quantity}x ${item.item.name}")
                        Text(currencyFormat.format(item.totalPrice))
                    }
                }

                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    Text(strings.totalToPay)
                    Text(currencyFormat.format(receipt.grandTotal), fontWeight = FontWeight.Bold)
                }
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    val methodNames = receipt.payments.joinToString { getLocalizedPaymentTypeName(it.type, strings) }
                    Text("${strings.paidWith} ($methodNames):")
                    Text(currencyFormat.format(receipt.totalPaid))
                }
                if (receipt.changeAmount > 0) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(strings.changeToReturn, fontWeight = FontWeight.Bold)
                        Text(
                            currencyFormat.format(receipt.changeAmount),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isHistoryMode && !receipt.isRefund) {
                    Button(
                        onClick = { showRefundConfirm = true },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Refund")
                    }
                }
                OutlinedButton(onClick = onPrintThermal) {
                    Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(strings.printThermalButton)
                }
                Button(onClick = onDismiss) {
                    Text(strings.close)
                }
            }
        }
    )

    if (showRefundConfirm) {
        AlertDialog(
            onDismissRequest = { showRefundConfirm = false },
            title = { Text("Confirm Refund") },
            text = { Text("Are you sure you want to refund receipt ${receipt.id}? This will restore all items into stock and record the refund.") },
            confirmButton = {
                Button(
                    onClick = {
                        onRefund()
                        showRefundConfirm = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Confirm Refund")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRefundConfirm = false }) {
                    Text(strings.cancel)
                }
            }
        )
    }
}

@Composable
fun BluetoothPrinterSelectionDialog(
    printers: List<BluetoothDevice>,
    strings: PosStrings,
    onDismiss: () -> Unit,
    onSelectPrinter: (BluetoothDevice) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Print, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(strings.selectThermalPrinter)
            }
        },
        text = {
            if (printers.isEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(strings.noPairedPrinters)
                    Text(
                        strings.pairPrinterInstructions,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(printers) { device ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelectPrinter(device) }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    @SuppressLint("MissingPermission")
                                    val name = device.name ?: "Unknown Printer"
                                    Text(name, fontWeight = FontWeight.Bold)
                                    Text(device.address, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Icon(Icons.Default.ChevronRight, contentDescription = null)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )
}

@Composable
fun SettingsDialog(
    settings: AppSettings,
    strings: PosStrings,
    syncStatus: SyncStatus,
    pendingSyncCount: Int,
    onDismiss: () -> Unit,
    onSave: (AppSettings) -> Unit,
    onSyncNow: () -> Unit,
    onOpenPrinterSettings: () -> Unit,
    onResetData: () -> Unit
) {
    var storeName by remember { mutableStateOf(settings.storeName) }
    var taxRate by remember { mutableStateOf(settings.taxRatePercent.toString()) }
    var currencySymbol by remember { mutableStateOf(settings.currencySymbol) }
    var syncUrl by remember { mutableStateOf(settings.syncServerUrl) }
    var apiKey by remember { mutableStateOf(settings.apiKey) }
    var managerPin by remember { mutableStateOf(settings.managerPin) }
    var cashierName by remember { mutableStateOf(settings.cashierName) }
    var receiptFooter by remember { mutableStateOf(settings.receiptFooter) }
    var showResetConfirm by remember { mutableStateOf(false) }
    var enteredPin by remember { mutableStateOf("") }
    var pinError by remember { mutableStateOf(false) }

    val quickCurrencies = listOf("$", "₪", "€", "£", "₹", "¥")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(strings.settingsTitle, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Text(
                        "General Store Profile",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    OutlinedTextField(
                        value = storeName,
                        onValueChange = { storeName = it },
                        label = { Text(strings.storeName) },
                        leadingIcon = { Icon(Icons.Default.Storefront, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    OutlinedTextField(
                        value = cashierName,
                        onValueChange = { cashierName = it },
                        label = { Text(strings.cashierLabel) },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Text(
                        "Tax & Currency",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    OutlinedTextField(
                        value = taxRate,
                        onValueChange = { taxRate = it },
                        label = { Text(strings.taxRateLabel) },
                        leadingIcon = { Icon(Icons.Default.Percent, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(strings.currencyLabel, style = MaterialTheme.typography.bodyMedium)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            quickCurrencies.forEach { symbol ->
                                FilterChip(
                                    selected = currencySymbol == symbol,
                                    onClick = { currencySymbol = symbol },
                                    label = { Text(symbol, fontWeight = FontWeight.Bold) }
                                )
                            }
                        }
                        OutlinedTextField(
                            value = currencySymbol,
                            onValueChange = { currencySymbol = it },
                            label = { Text("Custom Currency Symbol") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }
                }

                item {
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Text(
                        "Cloud & Back Office Sync",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    OutlinedTextField(
                        value = syncUrl,
                        onValueChange = { syncUrl = it },
                        label = { Text(strings.backOfficeUrlLabel) },
                        leadingIcon = { Icon(Icons.Default.CloudSync, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        supportingText = {
                            Text("e.g. https://openpos-liart.vercel.app or local IP")
                        }
                    )
                }

                item {
                    OutlinedTextField(
                        value = apiKey,
                        onValueChange = { apiKey = it },
                        label = { Text("Cloud API Security Key (x-api-key)") },
                        leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    OutlinedTextField(
                        value = managerPin,
                        onValueChange = { managerPin = it },
                        label = { Text("Manager PIN (for reset & admin actions)") },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            val statusText = when (syncStatus) {
                                SyncStatus.SYNCED -> strings.cloudSynced
                                SyncStatus.SYNCING -> strings.cloudSyncing
                                SyncStatus.OFFLINE -> strings.cloudOffline
                                SyncStatus.ERROR -> "Sync Error"
                            }
                            Text(statusText, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            if (pendingSyncCount > 0) {
                                Text("$pendingSyncCount ${strings.pendingUpload}", fontSize = 11.sp, color = MaterialTheme.colorScheme.secondary)
                            }
                        }
                        OutlinedButton(
                            onClick = onSyncNow,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Sync Now")
                        }
                    }
                }

                item {
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Text(
                        "Receipt & Hardware",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    OutlinedTextField(
                        value = receiptFooter,
                        onValueChange = { receiptFooter = it },
                        label = { Text(strings.receiptFooterLabel) },
                        leadingIcon = { Icon(Icons.Default.Receipt, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    OutlinedButton(
                        onClick = onOpenPrinterSettings,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.Print, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(strings.selectThermalPrinter)
                    }
                }

                item {
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Text(
                        "Danger Zone",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    Button(
                        onClick = {
                            enteredPin = ""
                            pinError = false
                            showResetConfirm = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.DeleteForever, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(strings.resetDatabase)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val parsedTax = taxRate.toDoubleOrNull() ?: settings.taxRatePercent
                    onSave(
                        settings.copy(
                            storeName = storeName.ifBlank { "OpenPOS Store" },
                            taxRatePercent = parsedTax,
                            currencySymbol = currencySymbol.ifBlank { "$" },
                            syncServerUrl = syncUrl.trim(),
                            cashierName = cashierName.ifBlank { "Cashier" },
                            receiptFooter = receiptFooter,
                            apiKey = apiKey.trim(),
                            managerPin = managerPin.trim()
                        )
                    )
                    onDismiss()
                }
            ) {
                Text(strings.saveSettings)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(strings.cancel)
            }
        }
    )

    if (showResetConfirm) {
        AlertDialog(
            onDismissRequest = {
                showResetConfirm = false
                enteredPin = ""
                pinError = false
            },
            title = { Text(strings.resetDatabase) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Danger: This will erase all catalog items, categories, receipts, and shifts permanently.")
                    Text("Enter Manager PIN to authorize reset:", fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = enteredPin,
                        onValueChange = {
                            enteredPin = it
                            pinError = false
                        },
                        label = { Text("Manager PIN") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        isError = pinError,
                        supportingText = if (pinError) { { Text("Incorrect Manager PIN", color = MaterialTheme.colorScheme.error) } } else null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (enteredPin == managerPin) {
                            onResetData()
                            showResetConfirm = false
                            onDismiss()
                        } else {
                            pinError = true
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Authorize & Reset")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showResetConfirm = false
                    enteredPin = ""
                    pinError = false
                }) {
                    Text(strings.cancel)
                }
            }
        )
    }
}

