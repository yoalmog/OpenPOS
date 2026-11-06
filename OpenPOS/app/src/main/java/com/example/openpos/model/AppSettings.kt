package com.example.openpos.model

data class AppSettings(
    val storeName: String = "OpenPOS Store",
    val taxRatePercent: Double = 17.0,
    val currencySymbol: String = "$",
    val syncServerUrl: String = "https://openpos.b4u2store.workers.dev",
    val cashierName: String = "Cashier",
    val receiptFooter: String = "Thank you for your visit!",
    val defaultPrinterMac: String? = null,
    val managerPin: String = ""
)
