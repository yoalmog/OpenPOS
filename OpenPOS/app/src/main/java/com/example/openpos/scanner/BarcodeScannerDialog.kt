package com.example.openpos.scanner

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.openpos.i18n.LocalizationManager
import com.example.openpos.model.Item

@Composable
fun BarcodeScannerDialog(
    items: List<Item>,
    onDismiss: () -> Unit,
    onBarcodeScanned: (Item) -> Unit
) {
    val currentLang by LocalizationManager.currentLanguage.collectAsState()
    val strings = LocalizationManager.getStrings(currentLang)

    var manualBarcode by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Laser Animation
    val infiniteTransition = rememberInfiniteTransition(label = "laser")
    val laserOffsetY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 180f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "laser_y"
    )

    fun handleScan(code: String) {
        val trimmed = code.trim()
        val foundItem = items.find { it.barcode == trimmed || it.id == trimmed }
        if (foundItem != null) {
            onBarcodeScanned(foundItem)
            onDismiss()
        } else {
            errorMessage = "No item found for barcode: $trimmed"
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(strings.barcodeScanner)
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Viewfinder
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF1E1E1E)),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 220.dp, height = 110.dp)
                            .border(2.dp, Color(0xFF4CAF50), RoundedCornerShape(8.dp))
                    )

                    Box(
                        modifier = Modifier
                            .width(210.dp)
                            .height(2.dp)
                            .offset(y = (laserOffsetY - 80).dp)
                            .background(Color(0xFFFF3D00))
                    )

                    Text(
                        strings.scannerPrompt,
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 11.sp,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 8.dp)
                    )
                }

                if (errorMessage != null) {
                    Text(
                        errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center
                    )
                }

                OutlinedTextField(
                    value = manualBarcode,
                    onValueChange = {
                        manualBarcode = it
                        errorMessage = null
                    },
                    label = { Text(strings.manualBarcodeInput) },
                    placeholder = { Text("Barcode / SKU") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        if (manualBarcode.isNotEmpty()) {
                            IconButton(onClick = { handleScan(manualBarcode) }) {
                                Icon(Icons.Default.Search, contentDescription = null)
                            }
                        }
                    }
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { handleScan(manualBarcode) },
                enabled = manualBarcode.isNotBlank()
            ) {
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
