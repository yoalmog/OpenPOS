# OpenPOS Back Office — Vercel Deployment & Free Cloud POS

A modern, high-performance, Loyverse-style **Back Office & Cloud POS Synchronization Website**, specifically configured and optimized for **[Vercel.com](https://vercel.com)** deployment.

![OpenPOS Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)
![100% Free](https://img.shields.io/badge/Hosting-100%25%20Free-success)
![Platform](https://img.shields.io/badge/Node.js-Serverless%20API-blue)

---

## 🌟 Key Capabilities

1. **📊 Real-time Dashboard & KPI Analytics**:
   - Gross Revenue, Total Orders, Average Ticket Size.
   - Payment method breakdown: Cash vs Credit Card.
   - Live hourly sales trend line chart (Chart.js) and Top Selling Products leaderboard.

2. **📦 Products & Inventory Management**:
   - Clean, search-and-filter data table with stock quantity alerts.
   * **+ Add Product** and **Edit Product** modals with custom color badges, prices, and barcodes.
   * Categorize products with custom color-coded chips.

3. **🧾 Complete Sales & Receipts Log**:
   * Detailed ledger of every transaction completed on the Android POS or Web.
   * Interactive digital thermal receipt popup with itemized breakdown, tax computation, and print capability.

4. **⚡ Seamless Android POS Delta Sync**:
   * Built-in REST API target for the Android app (`/api/sync`, `/api/items`, `/api/receipts`, `/api/stats`).
   * Automatically synchronizes receipts and catalogs between your Samsung mobile phone and the back office.

5. **🎨 Modern Premium UI**:
   * Dark mode default with vibrant neon accents and glassmorphism.
   * One-click Light / Dark theme switcher.
   * Fully responsive on desktop, tablet, and mobile browsers.

---

## 🚀 How to Deploy to Vercel (100% Free)

### Method 1: Deploy with GitHub & Vercel Dashboard (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "OpenPOS Back Office ready for Vercel"
   git push origin main
   ```

2. **Import into Vercel**:
   * Go to **[vercel.com/new](https://vercel.com/new)** (Sign in with your free GitHub account).
   * Click **Import** next to your repository.
   * If your repository has multiple folders, set **Root Directory** to `OpenPOS-Backoffice`.
   * Keep Framework Preset as **Other** (Vercel automatically detects `vercel.json` and `api/index.js`).
   * Click **Deploy**.

3. **Your Live URL**:
   Within ~30 seconds, Vercel gives you an instant, free global HTTPS URL:
   `https://openpos-backoffice.vercel.app`

---

### Method 2: Deploy using Vercel CLI (Directly from Terminal)

You can deploy directly using Vercel CLI which is already installed:

```bash
cd OpenPOS-Backoffice
npx vercel
```
* Follow the quick terminal prompts:
  * Log in with GitHub or Email.
  * Confirm project name: `openpos-backoffice`.
  * Want to modify settings? -> Press `N` (Defaults are already configured in `vercel.json`).
* For production deployment:
  ```bash
  npx vercel --prod
  ```

---

## 📱 Connecting Android Mobile POS to your Vercel Website

Once deployed on Vercel:

1. Open the **OpenPOS** app on your Samsung phone.
2. Tap the **Settings icon (⚙️)** in the top right.
3. In **Back Office URL**, paste your Vercel URL:
   ```text
   https://your-project-name.vercel.app
   ```
4. Tap **Save Settings**.
5. Tap **Sync Now** to test the connection. You will see the status change to **Cloud Synced**!

---

## 💻 Running Locally

To run and preview the server locally on your computer:

```bash
cd OpenPOS-Backoffice
npm install
npm start
```

Open your browser at: **`http://localhost:3000`**
