package com.example.openpos.model

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
    val taxRate: Double = 0.17, // 17% מע"מ לדוגמה
    val payments: List<PaymentRecord>,
    val employeeName: String = "עובד ראשי",
    val customerName: String? = null,
    val ticketNote: String? = null
) {
    val taxAmount: Double get() = subtotal * taxRate
    val grandTotal: Double get() = subtotal + taxAmount
    val totalPaid: Double get() = payments.sumOf { it.amount }
    val changeAmount: Double get() = (totalPaid - grandTotal).coerceAtLeast(0.0)
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
    val startingCash: Double = 500.0,
    var cashPayments: Double = 0.0,
    var cardPayments: Double = 0.0,
    var totalRefunds: Double = 0.0,
    val isOpen: Boolean = true
)

data class Employee(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val pin: String,
    val role: String = "קופאי"
)
