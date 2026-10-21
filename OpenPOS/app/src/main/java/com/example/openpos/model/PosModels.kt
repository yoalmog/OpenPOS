package com.example.openpos.model

import java.security.MessageDigest
import java.util.UUID

data class Category(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val color: Long = 0xFF4CAF50
)

data class ModifierOption(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val additionalPrice: Double = 0.0
)

data class Item(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val price: Double,
    val categoryId: String,
    val barcode: String? = null,
    val color: Long = 0xFF2196F3,
    val modifiers: List<ModifierOption> = emptyList(),
    val stockQuantity: Int = 100
)

data class CartItem(
    val cartItemId: String = UUID.randomUUID().toString(),
    val item: Item,
    var quantity: Int = 1,
    val selectedModifiers: List<ModifierOption> = emptyList(),
    val discountPercent: Double = 0.0
) {
    val unitPrice: Double
        get() = item.price + selectedModifiers.sumOf { it.additionalPrice }

    val totalPrice: Double
        get() {
            val base = unitPrice * quantity
            return base * (1.0 - (discountPercent / 100.0))
        }
}

fun sha256(input: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
}

enum class PaymentType(val displayName: String) {
    CASH("מזומן"),
    CARD("אשראי"),
    OTHER("אחר")
}

data class PaymentRecord(
    val type: PaymentType,
    val amount: Double
)

data class Receipt(
    val id: String = "REC-${System.currentTimeMillis() % 100000}",
    val timestamp: Long = System.currentTimeMillis(),
    val items: List<CartItem>,
    val subtotal: Double,
    val taxRate: Double = 0.17, // e.g. 17% VAT
    val payments: List<PaymentRecord>,
    val employeeName: String = "Cashier",
    val customerName: String? = null,
    val ticketNote: String? = null,
    val isRefund: Boolean = false,
    val originalReceiptId: String? = null
) {
    val taxAmount: Double get() = Math.round(subtotal * taxRate * 100.0) / 100.0
    val grandTotal: Double get() = Math.round((subtotal + taxAmount) * 100.0) / 100.0
    val totalPaid: Double get() = Math.round(payments.sumOf { it.amount } * 100.0) / 100.0
    val changeAmount: Double get() = Math.round((totalPaid - grandTotal).coerceAtLeast(0.0) * 100.0) / 100.0
}

data class OpenTicket(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val items: List<CartItem>,
    val updatedAt: Long = System.currentTimeMillis()
)

data class Shift(
    val id: String = UUID.randomUUID().toString(),
    val employeeName: String,
    val startTime: Long = System.currentTimeMillis(),
    var endTime: Long? = null,
    val startingCash: Double = 0.0,
    var cashPayments: Double = 0.0,
    var cardPayments: Double = 0.0,
    var totalRefunds: Double = 0.0,
    var actualClosingCash: Double? = null,
    val isOpen: Boolean = true
) {
    val expectedCash: Double get() = Math.round((startingCash + cashPayments - totalRefunds) * 100.0) / 100.0
    val cashDifference: Double? get() = actualClosingCash?.let { Math.round((it - expectedCash) * 100.0) / 100.0 }
}

data class Employee(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val pinHash: String = sha256("1234"),
    val role: String = "Cashier"
)

data class SyncQueueEvent(
    val id: Long,
    val eventType: String,
    val payloadJson: String,
    val createdAt: Long
)

data class StockMovement(
    val id: Long = 0,
    val itemId: String,
    val itemName: String,
    val changeQuantity: Int,
    val resultingStock: Int,
    val reason: String,
    val timestamp: Long = System.currentTimeMillis()
)
