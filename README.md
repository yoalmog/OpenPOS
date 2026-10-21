# OpenPOS — Full-Stack Open Source Point-of-Sale System

A modern, open-source Point-of-Sale (POS) ecosystem designed as a free, customizable alternative to Loyverse POS.

![Android](https://img.shields.io/badge/Android-Kotlin%20%7C%20Jetpack%20Compose-green?logo=android)
![Vercel](https://img.shields.io/badge/Vercel-Back%20Office%20Online-black?logo=vercel)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🏗️ Repository Architecture

This repository contains both components of the OpenPOS ecosystem:

```
OpenPOS/
├── OpenPOS/               # Native Android POS Application (Kotlin + Jetpack Compose)
│   ├── app/src/main/      # UI, SQLite DB, ESC/POS Bluetooth Printer, Camera Barcode Scanner
│   └── build.gradle.kts   # Android Gradle configuration (9:16 portrait locked)
│
└── OpenPOS-Backoffice/    # Cloud Back Office & REST API (Vercel Ready)
    ├── api/index.js       # Serverless REST endpoints (/api/stats, /api/sync, /api/items, /api/receipts)
    ├── public/            # Modern Responsive Dashboard (HTML/CSS/JS + Chart.js)
    ├── vercel.json        # Vercel deployment & routing config
    └── server.js          # Local development server
```

---

## 📱 1. Android POS Application (`OpenPOS/`)

Built natively with **Kotlin**, **Jetpack Compose (Material3)**, and local **SQLite** storage:

* **9:16 Portrait Optimized**: Designed specifically for modern mobile smartphones and handheld POS terminals.
* **Catalog & Modifiers**: Customizable item catalog with categories, color tags, variants, and modifiers.
* **Shopping Cart & Checkout**: Real-time tax calculation, split payments (Cash / Card), and automatic change computation.
* **Hardware Support**:
  * Bluetooth ESC/POS 58mm/80mm thermal receipt printing.
  * Camera-based barcode scanner.
* **Open Tickets & Shifts**: Park orders by table or customer name; track cash drawer floats and X/Z shift closing reports.
* **Settings Dialog (`⚙️`)**:
  * Store name customization (shown on top bar and receipts).
  * Tax rate (%) and currency symbol (`$`, `₪`, `€`, `£`, `₹`, `¥`).
  * Cloud sync endpoint URL and instant "Sync Now" delta sync.
  * Test receipt printing and database reset.

### Build & Run Android App
```bash
cd OpenPOS
./gradlew assembleDebug
adb install -r -d -t app/build/outputs/apk/debug/app-debug.apk
```

---

## ☁️ 2. Cloud Back Office (`OpenPOS-Backoffice/`)

A high-performance management website and cloud synchronization target ready for **100% free hosting on [Vercel](https://vercel.com)**:

* **Real-time Analytics**: Gross revenue, completed orders, average ticket size, and payment breakdowns.
* **Sales Trends**: 24-hour hourly sales trend chart (Chart.js) and top selling products leaderboard.
* **Catalog & Stock Manager**: Add, edit, and delete products, manage inventory levels, and configure categories.
* **Receipts Ledger**: Full transaction history with itemized digital thermal receipt viewer.
* **Mobile POS Delta Sync API**: Receives sales events from the Android app and syncs catalog items.

### Run Back Office Locally
```bash
cd OpenPOS-Backoffice
npm install
npm start
```
Open **`http://localhost:3000`** in your browser.

### Local Web Routes

Run from the repository root:

```bash
npm install
npm start
```

Open these routes locally:

* **Back Office:** `http://localhost:3000/`
* **Customer Storefront:** `http://localhost:3000/order`
* **Fullscreen Kitchen Display (KDS):** `http://localhost:3000/kitchen`

### Deploy to Vercel

The repository is configured for deployment from the **repository root** using the root-level `vercel.json`. In the Vercel project settings, set **Root Directory** to the repository root (not `OpenPOS-Backoffice`) and deploy the `main` branch.

Production routes:

* **Back Office:** `https://openpos-liart.vercel.app/`
* **Customer Storefront:** `https://openpos-liart.vercel.app/order`
* **Fullscreen Kitchen Display (KDS):** `https://openpos-liart.vercel.app/kitchen`

The root `vercel.json` routes `/order` and `/kitchen` to their dedicated HTML pages, and forwards `/api/*` to the serverless API. After pushing changes to `main`, confirm that Vercel has created a new Production deployment and test all three routes.
---

## 📄 License
MIT License. Free to use, modify, and distribute.
