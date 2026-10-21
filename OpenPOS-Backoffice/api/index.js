const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Determine environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store_data.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create data dir, using in-memory store:", e.message);
}

// Initial default state
const DEFAULT_DATA = {
  storeInfo: {
    name: "OpenPOS Store",
    currency: "$",
    taxRate: 17.0,
    address: "Online Store / Cloud Back Office"
  },
  categories: [],
  items: [],
  receipts: [],
  shifts: [],
  syncLog: []
};

// In-memory fallback
let inMemoryStore = JSON.parse(JSON.stringify(DEFAULT_DATA));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      inMemoryStore = JSON.parse(raw);
      return inMemoryStore;
    }
  } catch (err) {
    console.error("Error reading data file:", err.message);
  }
  saveData(inMemoryStore);
  return inMemoryStore;
}

function saveData(data) {
  inMemoryStore = data;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn("Notice: Saved to memory only (read-only environment):", err.message);
  }
}

// Initialize
let db = loadData();

app.use(cors());
app.use(express.json());

// 1. Health & Store Info
app.get('/api/status', (req, res) => {
  db = loadData();
  res.json({
    status: "online",
    platform: isVercel ? "Vercel Serverless" : "Local Node Server",
    system: "OpenPOS Cloud Back Office",
    version: "2.0.0",
    timestamp: Date.now(),
    storeName: db.storeInfo.name,
    currency: db.storeInfo.currency,
    taxRate: db.storeInfo.taxRate,
    counts: {
      items: db.items.length,
      categories: db.categories.length,
      receipts: db.receipts.length
    }
  });
});

// Update Store Profile
app.post('/api/store', (req, res) => {
  db = loadData();
  const { name, currency, taxRate, address } = req.body;
  if (name) db.storeInfo.name = name;
  if (currency) db.storeInfo.currency = currency;
  if (taxRate !== undefined) db.storeInfo.taxRate = Number(taxRate);
  if (address) db.storeInfo.address = address;
  saveData(db);
  res.json({ success: true, storeInfo: db.storeInfo });
});

// 2. Real-time Dashboard Analytics / Stats
app.get('/api/stats', (req, res) => {
  db = loadData();
  const receipts = db.receipts || [];
  const items = db.items || [];

  const totalRevenue = receipts.reduce((sum, r) => sum + (Number(r.grandTotal) || 0), 0);
  const totalOrders = receipts.length;
  const averageTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

  let cashSales = 0;
  let cardSales = 0;
  receipts.forEach(r => {
    if (Array.isArray(r.payments)) {
      r.payments.forEach(p => {
        if (p.type === 'CASH' || p.type === 'מזומן') cashSales += Number(p.amount) || 0;
        else if (p.type === 'CARD' || p.type === 'אשראי') cardSales += Number(p.amount) || 0;
        else cashSales += Number(p.amount) || 0;
      });
    } else {
      cashSales += Number(r.grandTotal) || 0;
    }
  });

  // Hourly distribution
  const hourlySales = {};
  for (let i = 0; i < 24; i++) {
    const label = `${String(i).padStart(2, '0')}:00`;
    hourlySales[label] = 0;
  }
  receipts.forEach(r => {
    const d = new Date(r.timestamp);
    const h = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (hourlySales[h] !== undefined) {
      hourlySales[h] += Number(r.grandTotal) || 0;
    }
  });

  // Top selling products
  const productSalesCount = {};
  receipts.forEach(r => {
    if (Array.isArray(r.items)) {
      r.items.forEach(ci => {
        const name = ci.name || (ci.item && ci.item.name) || "Item";
        const qty = Number(ci.quantity) || 1;
        productSalesCount[name] = (productSalesCount[name] || 0) + qty;
      });
    }
  });

  const topSelling = Object.entries(productSalesCount)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  res.json({
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageTicket: Math.round(averageTicket * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    itemCount: items.length,
    categoryCount: db.categories.length,
    currency: db.storeInfo.currency,
    hourlySales,
    topSelling
  });
});

// 3. Products Catalog Management
app.get('/api/items', (req, res) => {
  db = loadData();
  res.json(db.items || []);
});

app.post('/api/items', (req, res) => {
  db = loadData();
  const item = req.body;
  if (!item.name || item.price === undefined) {
    return res.status(400).json({ error: "Name and price are required." });
  }

  const existingIndex = db.items.findIndex(i => i.id === item.id);
  const formattedItem = {
    id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: item.name.trim(),
    price: Number(item.price),
    categoryId: item.categoryId || "general",
    categoryName: item.categoryName || "General",
    barcode: item.barcode ? String(item.barcode).trim() : "",
    stockQuantity: item.stockQuantity !== undefined ? Number(item.stockQuantity) : 100,
    color: item.color || "#2E7D32",
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    db.items[existingIndex] = formattedItem;
  } else {
    db.items.push(formattedItem);
  }

  saveData(db);
  res.json({ success: true, item: formattedItem });
});

app.delete('/api/items/:id', (req, res) => {
  db = loadData();
  const { id } = req.params;
  db.items = db.items.filter(i => i.id !== id);
  saveData(db);
  res.json({ success: true, message: "Item deleted" });
});

// 4. Categories Management
app.get('/api/categories', (req, res) => {
  db = loadData();
  res.json(db.categories || []);
});

app.post('/api/categories', (req, res) => {
  db = loadData();
  const cat = req.body;
  if (!cat.name) return res.status(400).json({ error: "Category name required" });

  const existingIndex = db.categories.findIndex(c => c.id === cat.id);
  const formattedCat = {
    id: cat.id || `cat_${Date.now()}`,
    name: cat.name.trim(),
    color: cat.color || "#1976D2"
  };

  if (existingIndex >= 0) {
    db.categories[existingIndex] = formattedCat;
  } else {
    db.categories.push(formattedCat);
  }

  saveData(db);
  res.json({ success: true, category: formattedCat });
});

// 5. Receipts & Transactions Log
app.get('/api/receipts', (req, res) => {
  db = loadData();
  const sorted = [...(db.receipts || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json(sorted);
});

app.post('/api/receipts', (req, res) => {
  db = loadData();
  const r = req.body;
  if (!r.grandTotal && !r.subtotal) {
    return res.status(400).json({ error: "Invalid receipt payload" });
  }

  const receipt = {
    id: r.id || `REC-${Date.now() % 100000}`,
    timestamp: r.timestamp || Date.now(),
    subtotal: Number(r.subtotal) || 0,
    taxAmount: Number(r.taxAmount) || 0,
    grandTotal: Number(r.grandTotal) || 0,
    employeeName: r.employeeName || "Cashier",
    customerName: r.customerName || null,
    payments: Array.isArray(r.payments) ? r.payments : [{ type: "CASH", amount: r.grandTotal }],
    items: Array.isArray(r.items) ? r.items : []
  };

  db.receipts.unshift(receipt);
  saveData(db);
  res.json({ success: true, receipt });
});

// 6. POS Cloud Synchronization (Target of Android App CloudSyncManager)
app.post('/api/sync', (req, res) => {
  db = loadData();
  const payload = req.body || {};
  console.log(`[CloudSync] Sync packet received:`, payload);

  if (Array.isArray(payload.receipts)) {
    payload.receipts.forEach(newR => {
      if (!db.receipts.some(existing => existing.id === newR.id)) {
        db.receipts.unshift(newR);
      }
    });
  }

  db.syncLog.unshift({
    timestamp: Date.now(),
    client: payload.client || "Android-POS",
    pendingCount: payload.pendingCount || 0,
    eventCount: (payload.receipts?.length || 0) + (payload.events?.length || 0)
  });

  if (db.syncLog.length > 50) db.syncLog = db.syncLog.slice(0, 50);

  saveData(db);

  res.json({
    success: true,
    message: "Delta sync completed successfully",
    syncedAt: Date.now(),
    serverStoreName: db.storeInfo.name,
    items: db.items,
    categories: db.categories
  });
});

// 7. Reset Data (Danger Zone)
app.post('/api/reset', (req, res) => {
  db = {
    storeInfo: {
      name: "OpenPOS Store",
      currency: "$",
      taxRate: 17.0,
      address: "Online Store / Cloud Back Office"
    },
    categories: [],
    items: [],
    receipts: [],
    shifts: [],
    syncLog: []
  };
  saveData(db);
  res.json({ success: true, message: "All data cleared successfully." });
});

module.exports = app;
