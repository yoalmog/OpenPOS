const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Security Credentials (configurable via environment variables)
const API_KEY = process.env.OPENPOS_API_KEY || "openpos_sec_key_2026";
const MANAGER_PIN = process.env.OPENPOS_MANAGER_PIN || "8888";

// Determine environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store_data.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Notice: Data dir setup warning:", e.message);
}

// Default Data Schema
const DEFAULT_DATA = {
  storeInfo: {
    name: "OpenPOS Store",
    currency: "$",
    taxRate: 17.0,
    address: "Online Store / Cloud Back Office",
    apiKey: API_KEY
  },
  categories: [],
  items: [],
  receipts: [],
  shifts: [],
  syncLog: [],
  auditLogs: []
};

// PostgreSQL Connection Pool Setup
let pgPool = null;
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (dbUrl) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000
    });
    console.log("[DB] Initializing PostgreSQL client connection pool...");
  } catch (err) {
    console.error("[DB] Failed to load pg module or create pool:", err.message);
    pgPool = null;
  }
}

// In-Memory / File Fallback State
let inMemoryStore = JSON.parse(JSON.stringify(DEFAULT_DATA));

function loadFileData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      inMemoryStore = JSON.parse(raw);
      return inMemoryStore;
    }
  } catch (err) {
    console.error("[FileStore] Read error:", err.message);
  }
  saveFileData(inMemoryStore);
  return inMemoryStore;
}

function saveFileData(data) {
  inMemoryStore = data;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn("[FileStore] Memory only mode:", err.message);
  }
}

// Auto-create database tables on PostgreSQL
let tablesInitialized = false;
async function initPgTables() {
  if (!pgPool || tablesInitialized) return;
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color BIGINT NOT NULL,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL,
        category_id TEXT,
        barcode TEXT,
        color BIGINT,
        stock_quantity INT DEFAULT 100,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        subtotal NUMERIC NOT NULL,
        tax_rate NUMERIC DEFAULT 0.17,
        tax_amount NUMERIC DEFAULT 0.0,
        grand_total NUMERIC NOT NULL,
        employee_name TEXT,
        customer_name TEXT,
        ticket_note TEXT,
        is_refund BOOLEAN DEFAULT FALSE,
        original_receipt_id TEXT,
        payments JSONB NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        employee_name TEXT NOT NULL,
        start_time BIGINT NOT NULL,
        end_time BIGINT,
        starting_cash NUMERIC NOT NULL,
        cash_payments NUMERIC DEFAULT 0.0,
        card_payments NUMERIC DEFAULT 0.0,
        total_refunds NUMERIC DEFAULT 0.0,
        actual_closing_cash NUMERIC,
        is_open BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        details JSONB,
        timestamp BIGINT NOT NULL,
        ip TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pg_receipts_ts ON receipts (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_pg_items_cat ON items (category_id);
    `);
    tablesInitialized = true;
    console.log("[DB] PostgreSQL schema initialized successfully.");
  } catch (err) {
    console.error("[DB] PostgreSQL table init error:", err.message);
  } finally {
    client.release();
  }
}

// Middleware: CORS & Body Parser
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Security Middleware: API Key check for sensitive POS and API calls
function requireApiKey(req, res, next) {
  const incomingKey = req.headers['x-api-key'] || req.query.apiKey || (req.body && req.body.apiKey);
  if (!incomingKey || incomingKey !== API_KEY) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "A valid x-api-key header or apiKey query parameter is required."
    });
  }
  next();
}

// Security Middleware: Manager PIN check for Administrative / Danger actions
function requireManagerPin(req, res, next) {
  const pin = req.headers['x-manager-pin'] || req.query.managerPin || (req.body && req.body.managerPin);
  if (!pin || pin !== MANAGER_PIN) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Manager PIN authorization failed."
    });
  }
  next();
}

// Audit Logger
function logAudit(action, details, req) {
  const entry = {
    timestamp: Date.now(),
    action,
    details: details || {},
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  };
  const store = loadFileData();
  store.auditLogs = store.auditLogs || [];
  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 100) store.auditLogs = store.auditLogs.slice(0, 100);
  saveFileData(store);
}

// 1. Health & Store Info
app.get('/api/status', async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  res.json({
    status: "online",
    storageEngine: pgPool ? "PostgreSQL (Persistent Cloud DB)" : (isVercel ? "Serverless /tmp + Memory" : "Local File System"),
    platform: isVercel ? "Vercel Serverless" : "Node Server",
    system: "OpenPOS Cloud Back Office",
    version: "3.0.0",
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

// Update Store Profile (Protected by Manager PIN or API Key)
app.post('/api/store', async (req, res) => {
  const incomingPin = req.headers['x-manager-pin'] || req.body.managerPin;
  const incomingKey = req.headers['x-api-key'] || req.body.apiKey;
  if (incomingPin !== MANAGER_PIN && incomingKey !== API_KEY) {
    return res.status(403).json({ error: "Manager PIN or API Key required to change store configuration." });
  }

  const db = loadFileData();
  const { name, currency, taxRate, address } = req.body;
  if (name) db.storeInfo.name = name;
  if (currency) db.storeInfo.currency = currency;
  if (taxRate !== undefined) db.storeInfo.taxRate = Number(taxRate);
  if (address) db.storeInfo.address = address;
  saveFileData(db);

  logAudit("STORE_CONFIG_UPDATED", { name, currency, taxRate }, req);
  res.json({ success: true, storeInfo: db.storeInfo });
});

// 2. Real-time Dashboard Analytics with Date Range Filtering
app.get('/api/stats', async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  let receipts = db.receipts || [];
  const items = db.items || [];

  // Date Range Filtering: period=today | yesterday | week | month | all or from & to timestamps
  const period = req.query.period || 'all';
  const now = new Date();

  if (req.query.from && req.query.to) {
    const fromTs = Number(req.query.from);
    const toTs = Number(req.query.to);
    receipts = receipts.filter(r => r.timestamp >= fromTs && r.timestamp <= toTs);
  } else if (period === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    receipts = receipts.filter(r => r.timestamp >= startOfDay);
  } else if (period === 'yesterday') {
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
    receipts = receipts.filter(r => r.timestamp >= startOfYesterday && r.timestamp <= endOfYesterday);
  } else if (period === 'week') {
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();
    receipts = receipts.filter(r => r.timestamp >= startOfWeek);
  } else if (period === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    receipts = receipts.filter(r => r.timestamp >= startOfMonth);
  }

  // Helper for receipt total
  const getReceiptTotal = r => Number(r.grandTotal !== undefined ? r.grandTotal : (r.total !== undefined ? r.total : (r.totalAmount || 0)));

  // Calculate totals
  const totalRevenue = receipts.reduce((sum, r) => sum + getReceiptTotal(r), 0);
  const totalOrders = receipts.length;
  const averageTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

  let cashSales = 0;
  let cardSales = 0;
  let refundTotal = 0;

  receipts.forEach(r => {
    const rTot = getReceiptTotal(r);
    if (r.isRefund) {
      refundTotal += Math.abs(rTot);
    }
    if (Array.isArray(r.payments) && r.payments.length > 0) {
      r.payments.forEach(p => {
        const amt = Number(p.amount) || 0;
        if (p.type === 'CASH' || p.type === 'מזומן') cashSales += amt;
        else if (p.type === 'CARD' || p.type === 'אשראי') cardSales += amt;
        else cashSales += amt;
      });
    } else {
      cashSales += rTot;
    }
  });

  // Hourly distribution strictly for filtered receipts
  const hourlySales = {};
  for (let i = 0; i < 24; i++) {
    const label = `${String(i).padStart(2, '0')}:00`;
    hourlySales[label] = 0;
  }
  receipts.forEach(r => {
    const d = new Date(r.timestamp);
    const h = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (hourlySales[h] !== undefined) {
      hourlySales[h] += getReceiptTotal(r);
    }
  });

  // Top selling products in filtered period
  const productSalesCount = {};
  receipts.forEach(r => {
    if (Array.isArray(r.items)) {
      r.items.forEach(ci => {
        const name = ci.name || ci.itemName || (ci.item && ci.item.name) || "Item";
        const qty = Number(ci.quantity !== undefined ? ci.quantity : (ci.qty || 1));
        productSalesCount[name] = (productSalesCount[name] || 0) + qty;
      });
    }
  });

  const topSelling = Object.entries(productSalesCount)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  // Sales by employee in filtered period
  const employeeSales = {};
  receipts.forEach(r => {
    const emp = r.employeeName || "Cashier";
    employeeSales[emp] = (employeeSales[emp] || 0) + (Number(r.grandTotal) || 0);
  });

  res.json({
    filterPeriod: period,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageTicket: Math.round(averageTicket * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    refundTotal: Math.round(refundTotal * 100) / 100,
    itemCount: items.length,
    categoryCount: db.categories.length,
    currency: db.storeInfo.currency,
    hourlySales,
    topSelling,
    employeeSales
  });
});

// 3. Products Catalog Management
app.get('/api/items', async (req, res) => {
  await initPgTables();
  if (pgPool) {
    try {
      const { rows } = await pgPool.query('SELECT * FROM items ORDER BY name ASC');
      return res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        categoryId: r.category_id,
        barcode: r.barcode,
        color: Number(r.color),
        stockQuantity: Number(r.stock_quantity)
      })));
    } catch (_) {}
  }
  const db = loadFileData();
  res.json(db.items || []);
});

app.post('/api/items', requireApiKey, async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  const item = req.body;
  if (!item.name || item.price === undefined) {
    return res.status(400).json({ error: "Name and price are required." });
  }

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

  if (pgPool) {
    try {
      await pgPool.query(`
        INSERT INTO items (id, name, price, category_id, barcode, color, stock_quantity, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          category_id = EXCLUDED.category_id,
          barcode = EXCLUDED.barcode,
          color = EXCLUDED.color,
          stock_quantity = EXCLUDED.stock_quantity,
          updated_at = EXCLUDED.updated_at
      `, [
        formattedItem.id, formattedItem.name, formattedItem.price, formattedItem.categoryId,
        formattedItem.barcode, formattedItem.color, formattedItem.stockQuantity, formattedItem.updatedAt
      ]);
    } catch (err) {
      console.error("[DB] Insert item error:", err.message);
    }
  }

  const existingIndex = db.items.findIndex(i => i.id === formattedItem.id);
  if (existingIndex >= 0) db.items[existingIndex] = formattedItem;
  else db.items.push(formattedItem);
  saveFileData(db);

  res.json({ success: true, item: formattedItem });
});

app.delete('/api/items/:id', requireApiKey, async (req, res) => {
  await initPgTables();
  const { id } = req.params;
  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM items WHERE id = $1', [id]);
    } catch (_) {}
  }
  const db = loadFileData();
  db.items = db.items.filter(i => i.id !== id);
  saveFileData(db);
  res.json({ success: true, message: "Item deleted" });
});

// 4. Categories Management
app.get('/api/categories', async (req, res) => {
  await initPgTables();
  if (pgPool) {
    try {
      const { rows } = await pgPool.query('SELECT * FROM categories ORDER BY name ASC');
      return res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        color: Number(r.color)
      })));
    } catch (_) {}
  }
  const db = loadFileData();
  res.json(db.categories || []);
});

app.post('/api/categories', requireApiKey, async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  const cat = req.body;
  if (!cat.name) return res.status(400).json({ error: "Category name required" });

  const formattedCat = {
    id: cat.id || `cat_${Date.now()}`,
    name: cat.name.trim(),
    color: cat.color || "#1976D2"
  };

  if (pgPool) {
    try {
      await pgPool.query(`
        INSERT INTO categories (id, name, color, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          color = EXCLUDED.color,
          updated_at = EXCLUDED.updated_at
      `, [formattedCat.id, formattedCat.name, formattedCat.color, Date.now()]);
    } catch (_) {}
  }

  const existingIndex = db.categories.findIndex(c => c.id === formattedCat.id);
  if (existingIndex >= 0) db.categories[existingIndex] = formattedCat;
  else db.categories.push(formattedCat);
  saveFileData(db);

  res.json({ success: true, category: formattedCat });
});

// 5. Receipts & Transactions Log
app.get('/api/receipts', async (req, res) => {
  await initPgTables();
  if (pgPool) {
    try {
      const { rows } = await pgPool.query('SELECT * FROM receipts ORDER BY timestamp DESC LIMIT 200');
      return res.json(rows.map(r => ({
        id: r.id,
        timestamp: Number(r.timestamp),
        subtotal: Number(r.subtotal),
        taxRate: Number(r.tax_rate),
        taxAmount: Number(r.tax_amount),
        grandTotal: Number(r.grand_total),
        employeeName: r.employee_name,
        customerName: r.customer_name,
        ticketNote: r.ticket_note,
        isRefund: r.is_refund,
        originalReceiptId: r.original_receipt_id,
        payments: r.payments,
        items: r.items
      })));
    } catch (_) {}
  }
  const db = loadFileData();
  const sorted = [...(db.receipts || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json(sorted);
});

// 6. POS CLOUD DELTA SYNCHRONIZATION (Commercial-Grade Data Reliability)
// Accepts real batch payloads from Android POS, deduplicates, decrements inventory, returns acknowledgedIds
app.post('/api/sync', requireApiKey, async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  const body = req.body || {};
  const events = Array.isArray(body.events) ? body.events : [];
  const acknowledgedIds = [];

  console.log(`[CloudSync] Incoming sync packet from ${body.client || 'POS'} with ${events.length} delta events`);

  for (const ev of events) {
    const eventId = ev.id;
    const type = ev.type;
    let payload = ev.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }

    if (!payload || typeof payload !== 'object') continue;

    if (type === 'RECEIPT_CREATED' || type === 'RECEIPT_REFUNDED') {
      const gTot = Number(payload.grandTotal !== undefined ? payload.grandTotal : (payload.total !== undefined ? payload.total : 0));
      const subTot = Number(payload.subtotal !== undefined ? payload.subtotal : gTot);
      const receipt = {
        id: payload.id || `REC-${Date.now()}`,
        timestamp: Number(payload.timestamp) || Date.now(),
        subtotal: subTot,
        taxRate: Number(payload.taxRate) || 0.17,
        taxAmount: Number(payload.taxAmount) || (gTot - subTot),
        grandTotal: gTot,
        employeeName: payload.employeeName || "Cashier",
        customerName: payload.customerName || null,
        ticketNote: payload.ticketNote || null,
        isRefund: !!payload.isRefund || type === 'RECEIPT_REFUNDED',
        originalReceiptId: payload.originalReceiptId || null,
        payments: Array.isArray(payload.payments) ? payload.payments : [],
        items: Array.isArray(payload.items) ? payload.items : []
      };

      // 1. PostgreSQL Persistent Atomic Upsert
      if (pgPool) {
        try {
          await pgPool.query(`
            INSERT INTO receipts (
              id, timestamp, subtotal, tax_rate, tax_amount, grand_total,
              employee_name, customer_name, ticket_note, is_refund, original_receipt_id,
              payments, items
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
              subtotal = EXCLUDED.subtotal,
              grand_total = EXCLUDED.grand_total,
              is_refund = EXCLUDED.is_refund
          `, [
            receipt.id, receipt.timestamp, receipt.subtotal, receipt.taxRate, receipt.taxAmount, receipt.grandTotal,
            receipt.employeeName, receipt.customerName, receipt.ticketNote, receipt.isRefund, receipt.originalReceiptId,
            JSON.stringify(receipt.payments), JSON.stringify(receipt.items)
          ]);

          // Inventory Adjustment in Postgres
          if (Array.isArray(receipt.items)) {
            for (const item of receipt.items) {
              const qty = Number(item.quantity) || 1;
              const change = receipt.isRefund ? qty : -qty;
              await pgPool.query(`
                UPDATE items SET stock_quantity = GREATEST(0, stock_quantity + $1)
                WHERE id = $2 OR name = $3
              `, [change, item.itemId || item.id, item.name]);
            }
          }
        } catch (err) {
          console.error("[CloudSync] Postgres receipt insert error:", err.message);
        }
      }

      // 2. In-Memory / File Store Update & Deduplication
      const existingIdx = db.receipts.findIndex(r => r.id === receipt.id);
      if (existingIdx >= 0) {
        db.receipts[existingIdx] = receipt;
      } else {
        db.receipts.unshift(receipt);
      }

      // Stock adjustment in file store
      if (Array.isArray(receipt.items)) {
        receipt.items.forEach(ci => {
          const qty = Number(ci.quantity) || 1;
          const target = db.items.find(i => i.id === ci.itemId || i.name === ci.name);
          if (target) {
            target.stockQuantity = receipt.isRefund
              ? (target.stockQuantity || 0) + qty
              : Math.max(0, (target.stockQuantity || 0) - qty);
          }
        });
      }

      acknowledgedIds.push(eventId);
    } else {
      // General event acknowledged
      acknowledgedIds.push(eventId);
    }
  }

  // Update sync log
  db.syncLog.unshift({
    timestamp: Date.now(),
    client: body.client || "Android-POS",
    eventsProcessed: events.length,
    acknowledgedCount: acknowledgedIds.length
  });
  if (db.syncLog.length > 50) db.syncLog = db.syncLog.slice(0, 50);

  saveFileData(db);

  // Return server acknowledgement and catalog items for two-way sync
  res.json({
    success: true,
    message: "Delta sync completed successfully",
    syncedAt: Date.now(),
    acknowledgedIds,
    items: db.items,
    categories: db.categories
  });
});

// 7. CSV Export Endpoints (Sales & Inventory)
app.get('/api/export/receipts', async (req, res) => {
  const db = loadFileData();
  const receipts = db.receipts || [];
  let csv = "Receipt ID,Timestamp,Date,Employee,Customer,Subtotal,Tax,Grand Total,Payment Methods,Items Summary,Is Refund\n";

  receipts.forEach(r => {
    const d = new Date(r.timestamp).toISOString();
    const paymentsStr = Array.isArray(r.payments) ? r.payments.map(p => `${p.type}: ${p.amount}`).join(" | ") : "";
    const itemsStr = Array.isArray(r.items) ? r.items.map(i => `${i.name} (x${i.quantity})`).join(" ; ") : "";
    csv += `"${r.id}",${r.timestamp},"${d}","${r.employeeName || ''}","${r.customerName || ''}",${r.subtotal},${r.taxAmount},${r.grandTotal},"${paymentsStr}","${itemsStr}",${r.isRefund ? 'YES' : 'NO'}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="openpos_receipts_export.csv"');
  res.send(csv);
});

app.get('/api/export/items', async (req, res) => {
  const db = loadFileData();
  const items = db.items || [];
  let csv = "Item ID,Name,Price,Category,Barcode,Stock Quantity\n";

  items.forEach(i => {
    csv += `"${i.id}","${i.name}",${i.price},"${i.categoryId || ''}","${i.barcode || ''}",${i.stockQuantity || 0}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="openpos_catalog_export.csv"');
  res.send(csv);
});

// 8. Reset Data (Protected by Manager PIN)
app.post('/api/reset', requireManagerPin, async (req, res) => {
  await initPgTables();
  if (pgPool) {
    try {
      await pgPool.query('TRUNCATE TABLE receipts, items, categories, shifts, audit_logs');
    } catch (_) {}
  }

  const db = {
    storeInfo: {
      name: "OpenPOS Store",
      currency: "$",
      taxRate: 17.0,
      address: "Online Store / Cloud Back Office",
      apiKey: API_KEY
    },
    categories: [],
    items: [],
    receipts: [],
    shifts: [],
    syncLog: [],
    auditLogs: []
  };
  saveFileData(db);
  logAudit("STORE_RESET_EXECUTED", { reason: "Admin requested full reset" }, req);

  res.json({ success: true, message: "All cloud store data reset successfully." });
});

module.exports = app;
