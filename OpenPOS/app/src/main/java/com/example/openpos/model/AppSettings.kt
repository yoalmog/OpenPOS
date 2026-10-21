package com.example.openpos.model

data class AppSettings(
    val storeName: String = "OpenPOS Store",
    val taxRatePercent: Double = 17.0,
    val currencySymbol: String = "$",
    val syncServerUrl: String = "http://10.0.2.2:3000",
    val cashierName: String = "Cashier",
    val receiptFooter: String = "Thank you for your visit!",
    val defaultPrinterMac: String? = null,
    val apiKey: String = "openpos_sec_key_2026",
    val managerPin: String = "8888"
)
