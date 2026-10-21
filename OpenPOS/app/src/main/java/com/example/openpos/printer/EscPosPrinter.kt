package com.example.openpos.printer

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import com.example.openpos.model.Receipt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.*

class EscPosPrinter(private val context: Context) {

    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val currencyFormat = DecimalFormat("₪#,##0.00")
    private val dateFormat = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    // פקודות ESC/POS תקניות
    private val CMD_INIT = byteArrayOf(0x1B, 0x40) // אתחול מדפסת
    private val CMD_ALIGN_CENTER = byteArrayOf(0x1B, 0x61, 0x01)
    private val CMD_ALIGN_LEFT = byteArrayOf(0x1B, 0x61, 0x00)
    private val CMD_ALIGN_RIGHT = byteArrayOf(0x1B, 0x61, 0x02)
    private val CMD_BOLD_ON = byteArrayOf(0x1B, 0x45, 0x01)
    private val CMD_BOLD_OFF = byteArrayOf(0x1B, 0x45, 0x00)
    private val CMD_DOUBLE_SIZE = byteArrayOf(0x1D, 0x21, 0x11)
    private val CMD_NORMAL_SIZE = byteArrayOf(0x1D, 0x21, 0x00)
    private val CMD_FEED_LINE = byteArrayOf(0x0A)
    private val CMD_CUT_PAPER = byteArrayOf(0x1D, 0x56, 0x41, 0x10) // חיתוך נייר

    @SuppressLint("MissingPermission")
    fun getPairedPrinters(): List<BluetoothDevice> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        return adapter.bondedDevices.filter { device ->
            val name = device.name?.lowercase() ?: ""
            name.contains("printer") || name.contains("pos") || name.contains("thermal") || name.contains("rpp") || name.contains("mpt")
        }.ifEmpty {
            // אם אין זיהוי ספציפי של השם, מחזירים את כל המכשירים המזווגים לבחירת המשתמש
            adapter.bondedDevices.toList()
        }
    }

    suspend fun printReceipt(device: BluetoothDevice, receipt: Receipt): Result<Boolean> = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()

            val outputStream = socket.outputStream
            val bytes = buildReceiptBytes(receipt)
            outputStream.write(bytes)
            outputStream.flush()

            socket.close()
            Result.success(true)
        } catch (e: Exception) {
            try { socket?.close() } catch (_: Exception) {}
            Result.failure(e)
        }
    }

    suspend fun printTestReceipt(device: BluetoothDevice, storeName: String): Result<Boolean> = withContext(Dispatchers.IO) {
        var socket: BluetoothSocket? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()

            val stream = ByteArrayOutputStream()
            fun write(vararg byteArrays: ByteArray) = byteArrays.forEach { stream.write(it) }
            fun writeLine(text: String) {
                stream.write(text.toByteArray(charset("UTF-8")))
                stream.write(CMD_FEED_LINE)
            }

            write(CMD_INIT, CMD_ALIGN_CENTER, CMD_DOUBLE_SIZE, CMD_BOLD_ON)
            writeLine(storeName)
            write(CMD_NORMAL_SIZE, CMD_BOLD_OFF)
            writeLine("PRINTER TEST PAGE")
            writeLine("--------------------------------")
            writeLine("Status: SUCCESS / READY")
            writeLine("Date: ${dateFormat.format(Date())}")
            writeLine("ESC/POS Bluetooth Connected")
            writeLine("--------------------------------")
            write(CMD_FEED_LINE, CMD_FEED_LINE, CMD_CUT_PAPER)

            val outputStream = socket.outputStream
            outputStream.write(stream.toByteArray())
            outputStream.flush()
            socket.close()
            Result.success(true)
        } catch (e: Exception) {
            try { socket?.close() } catch (_: Exception) {}
            Result.failure(e)
        }
    }

    fun buildReceiptBytes(receipt: Receipt): ByteArray {
        val stream = ByteArrayOutputStream()

        fun write(vararg byteArrays: ByteArray) {
            byteArrays.forEach { stream.write(it) }
        }

        fun writeText(text: String, charsetName: String = "UTF-8") {
            stream.write(text.toByteArray(charset(charsetName)))
        }

        fun writeLine(text: String) {
            writeText(text)
            write(CMD_FEED_LINE)
        }

        // אתחול וכותרת עסק
        write(CMD_INIT)
        write(CMD_ALIGN_CENTER)
        write(CMD_DOUBLE_SIZE, CMD_BOLD_ON)
        writeLine("OpenPOS")
        write(CMD_NORMAL_SIZE, CMD_BOLD_OFF)
        writeLine("עמדת מכירה ראשית")
        writeLine("--------------------------------")

        // פרטי קבלה
        write(CMD_ALIGN_RIGHT)
        writeLine("מספר קבלה: ${receipt.id}")
        writeLine("תאריך: ${dateFormat.format(Date(receipt.timestamp))}")
        writeLine("קופאי: ${receipt.employeeName}")
        receipt.customerName?.let { writeLine("לקוח: $it") }
        writeLine("--------------------------------")

        // שורות פריטים
        write(CMD_BOLD_ON)
        writeLine(formatItemLine("פריט", "כמות", "מחיר"))
        write(CMD_BOLD_OFF)
        writeLine("--------------------------------")

        for (cartItem in receipt.items) {
            val name = cartItem.item.name
            val qty = "${cartItem.quantity}"
            val price = currencyFormat.format(cartItem.totalPrice)
            writeLine(formatItemLine(name, qty, price))

            if (cartItem.selectedModifiers.isNotEmpty()) {
                val mods = cartItem.selectedModifiers.joinToString(", ") { it.name }
                writeLine("  + $mods")
            }
        }

        writeLine("--------------------------------")

        // סיכום כספי
        write(CMD_ALIGN_RIGHT)
        writeLine("סה\"כ ביניים: ${currencyFormat.format(receipt.subtotal)}")
        writeLine("מע\"מ (17%): ${currencyFormat.format(receipt.taxAmount)}")
        write(CMD_BOLD_ON, CMD_DOUBLE_SIZE)
        writeLine("סה\"כ: ${currencyFormat.format(receipt.grandTotal)}")
        write(CMD_BOLD_OFF, CMD_NORMAL_SIZE)

        // תשלומים ועודף
        writeLine("--------------------------------")
        for (pay in receipt.payments) {
            writeLine("שולם ב${pay.type.displayName}: ${currencyFormat.format(pay.amount)}")
        }
        if (receipt.changeAmount > 0) {
            write(CMD_BOLD_ON)
            writeLine("עודף להחזיר: ${currencyFormat.format(receipt.changeAmount)}")
            write(CMD_BOLD_OFF)
        }

        // סיום וחיתוך נייר
        write(CMD_ALIGN_CENTER)
        write(CMD_FEED_LINE)
        writeLine("תודה שקניתם אצלנו!")
        writeLine("שמרו על קבלה זו לצורך החלפה")
        write(CMD_FEED_LINE, CMD_FEED_LINE, CMD_FEED_LINE)
        write(CMD_CUT_PAPER)

        return stream.toByteArray()
    }

    private fun formatItemLine(name: String, qty: String, price: String, totalWidth: Int = 32): String {
        // מרווחים מותאמים לרוחב 32 תווים (58 מ"מ) או 48 תווים (80 מ"מ)
        val trimmedName = if (name.length > 14) name.take(14) else name
        val left = trimmedName.padEnd(16)
        val middle = qty.padStart(4).padEnd(6)
        val right = price.padStart(10)
        return "$left$middle$right"
    }
}
