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

// -------------------------------------------------------------
// DEFAULT DATA SCHEMA (Commercial Restaurant & Cafe Edition)
// -------------------------------------------------------------
const DEFAULT_DATA = {
  storeInfo: {
    name: "Artisan Cafe & Bistro",
    currency: "$",
    taxRate: 17.0,
    address: "Online Store / Cloud Back Office",
    apiKey: API_KEY
  },
  categories: [
    { id: "cat_coffee", name: "Coffee & Espresso", color: -16744448 },
    { id: "cat_beverages", name: "Cold Drinks & Juices", color: -14298642 },
    { id: "cat_bakery", name: "Bakery & Pastries", color: -1499549 },
    { id: "cat_sandwiches", name: "Sandwiches & Toast", color: -6987 },
    { id: "cat_salads", name: "Fresh Salads", color: -16738680 }
  ],
  items: [
    { id: "item_cappuccino", name: "Artisan Cappuccino", price: 4.50, categoryId: "cat_coffee", barcode: "1001", color: -16744448, stockQuantity: 95, station: "COFFEE_BAR", prepTimeMinutes: 3 },
    { id: "item_espresso", name: "Double Espresso", price: 3.20, categoryId: "cat_coffee", barcode: "1002", color: -16744448, stockQuantity: 120, station: "COFFEE_BAR", prepTimeMinutes: 2 },
    { id: "item_iced_latte", name: "Iced Vanilla Latte", price: 5.20, categoryId: "cat_coffee", barcode: "1003", color: -16744448, stockQuantity: 80, station: "COFFEE_BAR", prepTimeMinutes: 3 },
    { id: "item_croissant", name: "Butter Croissant", price: 3.80, categoryId: "cat_bakery", barcode: "2001", color: -1499549, stockQuantity: 45, station: "DESSERTS", prepTimeMinutes: 2 },
    { id: "item_avocado_toast", name: "Sourdough Avocado Toast", price: 8.90, categoryId: "cat_sandwiches", barcode: "3001", color: -6987, stockQuantity: 40, station: "HOT_KITCHEN", prepTimeMinutes: 6 },
    { id: "item_salmon_bagel", name: "Smoked Salmon Bagel", price: 10.50, categoryId: "cat_sandwiches", barcode: "3002", color: -6987, stockQuantity: 35, station: "HOT_KITCHEN", prepTimeMinutes: 7 },
    { id: "item_greek_salad", name: "Mediterranean Greek Salad", price: 9.50, categoryId: "cat_salads", barcode: "4001", color: -16738680, stockQuantity: 30, station: "SALADS", prepTimeMinutes: 5 }
  ],
  ingredients: [
    { id: "ing_coffee_beans", name: "Espresso Roast Beans", unit: "g", unitCost: 0.045, currentStock: 8000, minThreshold: 1500 },
    { id: "ing_whole_milk", name: "Fresh Dairy Milk 3%", unit: "ml", unitCost: 0.0025, currentStock: 30000, minThreshold: 5000 },
    { id: "ing_oat_milk", name: "Barista Oat Milk", unit: "ml", unitCost: 0.0065, currentStock: 12000, minThreshold: 3000 },
    { id: "ing_sourdough", name: "Artisan Sourdough Slice", unit: "pcs", unitCost: 0.35, currentStock: 80, minThreshold: 20 },
    { id: "ing_avocado", name: "Hass Avocado", unit: "pcs", unitCost: 1.15, currentStock: 50, minThreshold: 15 },
    { id: "ing_feta", name: "Greek Feta Cheese", unit: "g", unitCost: 0.024, currentStock: 4000, minThreshold: 800 },
    { id: "ing_croissant_dough", name: "Butter Croissant Pre-bake", unit: "pcs", unitCost: 0.90, currentStock: 60, minThreshold: 20 },
    { id: "ing_salmon", name: "Smoked Salmon Slices", unit: "g", unitCost: 0.065, currentStock: 3500, minThreshold: 700 },
    { id: "ing_bagel", name: "Toasted Sesame Bagel", unit: "pcs", unitCost: 0.45, currentStock: 55, minThreshold: 15 },
    { id: "ing_cream_cheese", name: "Whipped Cream Cheese", unit: "g", unitCost: 0.018, currentStock: 4500, minThreshold: 800 }
  ],
  recipes: [
    {
      itemId: "item_cappuccino",
      itemName: "Artisan Cappuccino",
      station: "COFFEE_BAR",
      prepTimeMinutes: 3,
      laborCost: 0.50,
      allergens: "Dairy",
      instructions: "Extract 18g espresso dose (36ml yield), steam 180ml whole milk with microfoam, pour with latte art heart.",
      ingredients: [
        { ingredientId: "ing_coffee_beans", name: "Espresso Roast Beans", quantity: 18, unit: "g" },
        { ingredientId: "ing_whole_milk", name: "Fresh Dairy Milk 3%", quantity: 180, unit: "ml" }
      ]
    },
    {
      itemId: "item_espresso",
      itemName: "Double Espresso",
      station: "COFFEE_BAR",
      prepTimeMinutes: 2,
      laborCost: 0.30,
      allergens: "None",
      instructions: "Tamp 18g fine grind, 9 bar pressure extraction for 26-28 seconds. Serve with sparkling water side.",
      ingredients: [
        { ingredientId: "ing_coffee_beans", name: "Espresso Roast Beans", quantity: 18, unit: "g" }
      ]
    },
    {
      itemId: "item_iced_latte",
      itemName: "Iced Vanilla Latte",
      station: "COFFEE_BAR",
      prepTimeMinutes: 3,
      laborCost: 0.50,
      allergens: "Dairy",
      instructions: "Glass full of ice, 200ml cold milk, float freshly pulled double espresso over top.",
      ingredients: [
        { ingredientId: "ing_coffee_beans", name: "Espresso Roast Beans", quantity: 18, unit: "g" },
        { ingredientId: "ing_whole_milk", name: "Fresh Dairy Milk 3%", quantity: 200, unit: "ml" }
      ]
    },
    {
      itemId: "item_croissant",
      itemName: "Butter Croissant",
      station: "DESSERTS",
      prepTimeMinutes: 2,
      laborCost: 0.20,
      allergens: "Gluten, Dairy",
      instructions: "Warm in convection oven for 90 seconds at 180°C. Serve warm and flaky with butter portion.",
      ingredients: [
        { ingredientId: "ing_croissant_dough", name: "Butter Croissant Pre-bake", quantity: 1, unit: "pcs" }
      ]
    },
    {
      itemId: "item_avocado_toast",
      itemName: "Sourdough Avocado Toast",
      station: "HOT_KITCHEN",
      prepTimeMinutes: 6,
      laborCost: 1.20,
      allergens: "Gluten, Dairy",
      instructions: "Grill 2 thick sourdough slices with olive oil. Mash 1 avocado with lemon and sea salt. Crumble 30g feta and chili flakes.",
      ingredients: [
        { ingredientId: "ing_sourdough", name: "Artisan Sourdough Slice", quantity: 2, unit: "pcs" },
        { ingredientId: "ing_avocado", name: "Hass Avocado", quantity: 1, unit: "pcs" },
        { ingredientId: "ing_feta", name: "Greek Feta Cheese", quantity: 30, unit: "g" }
      ]
    },
    {
      itemId: "item_salmon_bagel",
      itemName: "Smoked Salmon Bagel",
      station: "HOT_KITCHEN",
      prepTimeMinutes: 7,
      laborCost: 1.40,
      allergens: "Gluten, Fish, Dairy",
      instructions: "Lightly toast sesame bagel. Spread 30g cream cheese, layer 60g smoked salmon with capers, pickled red onions and fresh dill.",
      ingredients: [
        { ingredientId: "ing_bagel", name: "Toasted Sesame Bagel", quantity: 1, unit: "pcs" },
        { ingredientId: "ing_cream_cheese", name: "Whipped Cream Cheese", quantity: 30, unit: "g" },
        { ingredientId: "ing_salmon", name: "Smoked Salmon Slices", quantity: 60, unit: "g" }
      ]
    },
    {
      itemId: "item_greek_salad",
      itemName: "Mediterranean Greek Salad",
      station: "SALADS",
      prepTimeMinutes: 5,
      laborCost: 1.00,
      allergens: "Dairy",
      instructions: "Toss crisp cucumbers, vine tomatoes, kalamata olives, red onions with oregano dressing. Top with 70g slab of Greek feta.",
      ingredients: [
        { ingredientId: "ing_feta", name: "Greek Feta Cheese", quantity: 70, unit: "g" }
      ]
    }
  ],
  kitchenOrders: [
    {
      id: "ticket_101",
      orderNumber: "101",
      receiptId: "REC-DEMO-1",
      channel: "POS",
      tableNumber: "Table 4",
      customerName: "David Cohen",
      station: "COFFEE_BAR",
      status: "PREPARING",
      createdAt: Date.now() - (2 * 60 * 1000),
      targetReadyAt: Date.now() + (1 * 60 * 1000),
      items: [
        { name: "Artisan Cappuccino", quantity: 2, notes: "Oat milk, extra hot", prepTimeMinutes: 3 }
      ]
    },
    {
      id: "ticket_102",
      orderNumber: "101",
      receiptId: "REC-DEMO-1",
      channel: "POS",
      tableNumber: "Table 4",
      customerName: "David Cohen",
      station: "HOT_KITCHEN",
      status: "PENDING",
      createdAt: Date.now() - (2 * 60 * 1000),
      targetReadyAt: Date.now() + (4 * 60 * 1000),
      items: [
        { name: "Sourdough Avocado Toast", quantity: 1, notes: "No chili flakes", prepTimeMinutes: 6 }
      ]
    },
    {
      id: "ticket_103",
      orderNumber: "102",
      receiptId: "REC-WEB-90",
      channel: "WEB_ORDER",
      tableNumber: "Takeaway #102",
      customerName: "Sarah Levi (050-1234567)",
      station: "SALADS",
      status: "READY",
      createdAt: Date.now() - (8 * 60 * 1000),
      targetReadyAt: Date.now() - (3 * 60 * 1000),
      items: [
        { name: "Mediterranean Greek Salad", quantity: 1, notes: "Dressing on the side", prepTimeMinutes: 5 }
      ]
    }
  ],
  onlineOrders: [
    {
      id: "ord_web_901",
      orderNumber: "W-901",
      channel: "WEB_STOREFRONT",
      deliveryType: "TAKEAWAY",
      customerName: "Sarah Levi",
      customerPhone: "050-1234567",
      pickupTime: "12:30",
      subtotal: 18.40,
      tax: 3.13,
      total: 21.53,
      paymentMethod: "ONLINE_CREDIT",
      paymentStatus: "PAID",
      status: "PREPARING",
      items: [
        { name: "Artisan Cappuccino", quantity: 2, price: 4.50 },
        { name: "Mediterranean Greek Salad", quantity: 1, price: 9.50 }
      ],
      createdAt: Date.now() - (15 * 60 * 1000)
    }
  ],
  wasteLogs: [
    {
      id: 1,
      itemOrIngredientId: "ing_whole_milk",
      name: "Fresh Dairy Milk 3%",
      quantity: 1000,
      unit: "ml",
      cost: 2.50,
      reason: "EXPIRED",
      loggedBy: "Barista Alex",
      timestamp: Date.now() - (3600 * 1000 * 24)
    },
    {
      id: 2,
      itemOrIngredientId: "item_croissant",
      name: "Butter Croissant",
      quantity: 3,
      unit: "pcs",
      cost: 2.70,
      reason: "OVERPREP",
      loggedBy: "Shift Lead",
      timestamp: Date.now() - (3600 * 1000 * 12)
    }
  ],
  temperatureLogs: [
    { id: 1, unitName: "Main Walk-in Fridge", targetTempC: 4.0, actualTempC: 3.2, status: "NORMAL", checkedBy: "Morning Lead", timestamp: Date.now() - (3600 * 1000 * 4) },
    { id: 2, unitName: "Bar Milk Cooler", targetTempC: 4.0, actualTempC: 3.8, status: "NORMAL", checkedBy: "Barista Alex", timestamp: Date.now() - (3600 * 1000 * 4) },
    { id: 3, unitName: "Bakery Freezer", targetTempC: -18.0, actualTempC: -18.5, status: "NORMAL", checkedBy: "Morning Lead", timestamp: Date.now() - (3600 * 1000 * 4) }
  ],
  checklists: [
    {
      id: "chk_open",
      type: "OPENING",
      title: "Morning Opening Inspection",
      items: [
        { id: "o1", text: "Check fridge and freezer temperatures (All < 4°C / -18°C)", done: true, time: "07:15" },
        { id: "o2", text: "Calibrate espresso grinder & dial in espresso recipe", done: true, time: "07:22" },
        { id: "o3", text: "Inspect fresh dairy, milk jugs and sanitize steam wands", done: true, time: "07:30" },
        { id: "o4", text: "Bake morning croissant batches and display in bakery vitrine", done: true, time: "07:45" },
        { id: "o5", text: "Count register starting cash float ($150.00)", done: true, time: "07:55" }
      ]
    },
    {
      id: "chk_close",
      type: "CLOSING",
      title: "Evening Closing Protocol",
      items: [
        { id: "c1", text: "Chemical backflush espresso machine group heads", done: false },
        { id: "c2", text: "Wrap, date-label and seal all food bins in cold storage", done: false },
        { id: "c3", text: "Sanitize kitchen prep stations, grill and knife blocks", done: false },
        { id: "c4", text: "Run Z-Report, count cash drawer and reconcile card terminal", done: false },
        { id: "c5", text: "Lock rear delivery doors and set premise alarm", done: false }
      ]
    }
  ],
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
      // Ensure all restaurant modules are initialized gracefully
      if (!inMemoryStore.ingredients || inMemoryStore.ingredients.length === 0) {
        inMemoryStore.ingredients = JSON.parse(JSON.stringify(DEFAULT_DATA.ingredients));
      }
      if (!inMemoryStore.recipes || inMemoryStore.recipes.length === 0) {
        inMemoryStore.recipes = JSON.parse(JSON.stringify(DEFAULT_DATA.recipes));
      }
      if (!inMemoryStore.kitchenOrders) inMemoryStore.kitchenOrders = JSON.parse(JSON.stringify(DEFAULT_DATA.kitchenOrders));
      if (!inMemoryStore.onlineOrders) inMemoryStore.onlineOrders = JSON.parse(JSON.stringify(DEFAULT_DATA.onlineOrders));
      if (!inMemoryStore.wasteLogs) inMemoryStore.wasteLogs = JSON.parse(JSON.stringify(DEFAULT_DATA.wasteLogs));
      if (!inMemoryStore.temperatureLogs) inMemoryStore.temperatureLogs = JSON.parse(JSON.stringify(DEFAULT_DATA.temperatureLogs));
      if (!inMemoryStore.checklists) inMemoryStore.checklists = JSON.parse(JSON.stringify(DEFAULT_DATA.checklists));
      if (!inMemoryStore.items || inMemoryStore.items.length === 0) inMemoryStore.items = JSON.parse(JSON.stringify(DEFAULT_DATA.items));
      if (!inMemoryStore.categories || inMemoryStore.categories.length === 0) inMemoryStore.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
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
        station TEXT DEFAULT 'HOT_KITCHEN',
        prep_time_minutes INT DEFAULT 5,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        unit_cost NUMERIC NOT NULL,
        current_stock NUMERIC DEFAULT 0,
        min_threshold NUMERIC DEFAULT 0,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS recipes (
        item_id TEXT PRIMARY KEY,
        item_name TEXT NOT NULL,
        station TEXT DEFAULT 'HOT_KITCHEN',
        prep_time_minutes INT DEFAULT 5,
        ingredients JSONB NOT NULL,
        labor_cost NUMERIC DEFAULT 0,
        allergens TEXT,
        instructions TEXT,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS kitchen_orders (
        id TEXT PRIMARY KEY,
        receipt_id TEXT,
        channel TEXT DEFAULT 'POS',
        order_number TEXT NOT NULL,
        table_number TEXT,
        customer_name TEXT,
        station TEXT NOT NULL,
        items JSONB NOT NULL,
        status TEXT DEFAULT 'PENDING',
        created_at BIGINT NOT NULL,
        target_ready_at BIGINT NOT NULL,
        completed_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS online_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL,
        channel TEXT DEFAULT 'WEB_STOREFRONT',
        delivery_type TEXT DEFAULT 'TAKEAWAY',
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        pickup_time TEXT,
        subtotal NUMERIC NOT NULL,
        tax NUMERIC NOT NULL,
        total NUMERIC NOT NULL,
        payment_method TEXT,
        payment_status TEXT,
        status TEXT DEFAULT 'RECEIVED',
        items JSONB NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS waste_logs (
        id SERIAL PRIMARY KEY,
        item_or_ingredient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity NUMERIC NOT NULL,
        unit TEXT,
        cost NUMERIC NOT NULL,
        reason TEXT NOT NULL,
        logged_by TEXT,
        timestamp BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS temperature_logs (
        id SERIAL PRIMARY KEY,
        unit_name TEXT NOT NULL,
        target_temp_c NUMERIC NOT NULL,
        actual_temp_c NUMERIC NOT NULL,
        status TEXT NOT NULL,
        checked_by TEXT NOT NULL,
        timestamp BIGINT NOT NULL
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
    ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress) : 'SYSTEM'
  };
  const store = loadFileData();
  store.auditLogs = store.auditLogs || [];
  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 100) store.auditLogs = store.auditLogs.slice(0, 100);
  saveFileData(store);
}

// -------------------------------------------------------------
// RESTAURANT CORE: Automatic Recipe Depletion & KDS Dispatcher
// -------------------------------------------------------------
function processRecipeDepletionAndKDS(order, db) {
  if (!order || !Array.isArray(order.items)) return;

  // 1. Raw Ingredient Depletion
  order.items.forEach(orderItem => {
    const itemId = orderItem.itemId || orderItem.id;
    const orderQty = Number(orderItem.quantity || orderItem.qty || 1);
    const recipe = db.recipes.find(r => r.itemId === itemId || r.itemName === orderItem.name);
    if (recipe && Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach(ri => {
        const ing = db.ingredients.find(i => i.id === ri.ingredientId || i.name === ri.name);
        if (ing) {
          const usedQty = Number(ri.quantity || 0) * orderQty;
          ing.currentStock = Math.max(0, (Number(ing.currentStock) || 0) - usedQty);
        }
      });
    }
  });

  // 2. Dispatch to KDS Stations
  const stationGroups = {};
  order.items.forEach(orderItem => {
    const itemId = orderItem.itemId || orderItem.id;
    const recipe = db.recipes.find(r => r.itemId === itemId || r.itemName === orderItem.name);
    const catalogItem = db.items.find(i => i.id === itemId);
    const station = recipe?.station || catalogItem?.station || "HOT_KITCHEN";
    if (!stationGroups[station]) stationGroups[station] = [];
    stationGroups[station].push({
      name: orderItem.name || orderItem.itemName || catalogItem?.name || "Dish",
      quantity: Number(orderItem.quantity || orderItem.qty || 1),
      notes: orderItem.notes || (Array.isArray(orderItem.modifiers) ? orderItem.modifiers.map(m => m.name).join(", ") : "") || "",
      prepTimeMinutes: recipe?.prepTimeMinutes || catalogItem?.prepTimeMinutes || 5
    });
  });

  const now = Date.now();
  Object.entries(stationGroups).forEach(([station, items]) => {
    const maxPrep = Math.max(...items.map(i => i.prepTimeMinutes || 5), 5);
    const ticket = {
      id: `ticket_${now}_${Math.random().toString(36).substr(2, 4)}`,
      receiptId: order.id,
      orderNumber: String(order.orderNumber || order.receiptNumber || Math.floor(100 + Math.random() * 900)),
      channel: order.channel || "POS",
      tableNumber: order.tableNumber || (order.ticketNote?.includes("Table") ? order.ticketNote : null),
      customerName: order.customerName || "Guest",
      station,
      items,
      status: "PENDING",
      createdAt: now,
      targetReadyAt: now + (maxPrep * 60 * 1000),
      completedAt: null
    };
    db.kitchenOrders = db.kitchenOrders || [];
    db.kitchenOrders.unshift(ticket);
    if (db.kitchenOrders.length > 80) db.kitchenOrders = db.kitchenOrders.slice(0, 80);
  });
}

// -------------------------------------------------------------
// 1. Health & Store Info
// -------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  res.json({
    status: "online",
    storageEngine: pgPool ? "PostgreSQL (Persistent Cloud DB)" : (isVercel ? "Serverless /tmp + Memory" : "Local File System"),
    platform: isVercel ? "Vercel Serverless" : "Node Server",
    system: "OpenPOS Restaurant & Cafe Cloud Edition",
    version: "3.5.0",
    timestamp: Date.now(),
    storeName: db.storeInfo.name,
    currency: db.storeInfo.currency,
    taxRate: db.storeInfo.taxRate,
    counts: {
      items: (db.items || []).length,
      categories: (db.categories || []).length,
      receipts: (db.receipts || []).length,
      recipes: (db.recipes || []).length,
      ingredients: (db.ingredients || []).length,
      kitchenTickets: (db.kitchenOrders || []).filter(t => t.status !== 'SERVED').length,
      onlineOrders: (db.onlineOrders || []).length
    }
  });
});

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

// -------------------------------------------------------------
// 2. Real-time Dashboard Analytics with Date Range Filtering
// -------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  await initPgTables();
  const db = loadFileData();
  let receipts = db.receipts || [];
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

  const getReceiptTotal = r => Number(r.grandTotal !== undefined ? r.grandTotal : (r.total !== undefined ? r.total : (r.totalAmount || 0)));
  const totalRevenue = receipts.reduce((sum, r) => sum + getReceiptTotal(r), 0);
  const totalOrders = receipts.length;
  const averageTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

  let cashSales = 0;
  let cardSales = 0;
  let refundTotal = 0;

  receipts.forEach(r => {
    const rTot = getReceiptTotal(r);
    if (r.isRefund) refundTotal += Math.abs(rTot);
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

  const hourlySales = {};
  for (let i = 0; i < 24; i++) {
    hourlySales[`${String(i).padStart(2, '0')}:00`] = 0;
  }
  receipts.forEach(r => {
    const d = new Date(r.timestamp);
    const h = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (hourlySales[h] !== undefined) hourlySales[h] += getReceiptTotal(r);
  });

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

  res.json({
    filterPeriod: period,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageTicket: Math.round(averageTicket * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    refundTotal: Math.round(refundTotal * 100) / 100,
    hourlySales,
    topSelling
  });
});

// -------------------------------------------------------------
// 3. Catalog Items & Categories API
// -------------------------------------------------------------
app.get('/api/categories', async (req, res) => {
  const db = loadFileData();
  res.json(db.categories || []);
});

app.post('/api/categories', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: "Category name is required." });
  const newCat = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(),
    color: Number(color) || -16744448
  };
  db.categories.push(newCat);
  saveFileData(db);
  res.json({ success: true, category: newCat });
});

app.get('/api/items', async (req, res) => {
  const db = loadFileData();
  res.json(db.items || []);
});

app.post('/api/items', requireApiKey, async (req, res) => {
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
    barcode: item.barcode || "",
    color: Number(item.color) || -16744448,
    stockQuantity: Number(item.stockQuantity) || 100,
    station: item.station || "HOT_KITCHEN",
    prepTimeMinutes: Number(item.prepTimeMinutes) || 5
  };

  const existingIdx = db.items.findIndex(i => i.id === formattedItem.id);
  if (existingIdx >= 0) db.items[existingIdx] = formattedItem;
  else db.items.push(formattedItem);

  saveFileData(db);
  res.json({ success: true, item: formattedItem });
});

app.delete('/api/items/:id', requireApiKey, async (req, res) => {
  const db = loadFileData();
  db.items = db.items.filter(i => i.id !== req.params.id);
  saveFileData(db);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 4. Raw Ingredients & Inventory API
// -------------------------------------------------------------
app.get('/api/ingredients', async (req, res) => {
  const db = loadFileData();
  res.json(db.ingredients || []);
});

app.post('/api/ingredients', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { id, name, unit, unitCost, currentStock, minThreshold } = req.body;
  if (!name || unitCost === undefined) {
    return res.status(400).json({ error: "Ingredient name and unitCost are required." });
  }

  const ing = {
    id: id || `ing_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(),
    unit: unit || "g",
    unitCost: Number(unitCost),
    currentStock: Number(currentStock || 0),
    minThreshold: Number(minThreshold || 0)
  };

  const idx = (db.ingredients || []).findIndex(i => i.id === ing.id);
  if (idx >= 0) db.ingredients[idx] = ing;
  else db.ingredients.push(ing);

  saveFileData(db);
  res.json({ success: true, ingredient: ing });
});

app.put('/api/ingredients/:id/stock', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { change, newStock, reason } = req.body;
  const ing = (db.ingredients || []).find(i => i.id === req.params.id);
  if (!ing) return res.status(404).json({ error: "Ingredient not found." });

  if (newStock !== undefined) ing.currentStock = Number(newStock);
  else if (change !== undefined) ing.currentStock = Math.max(0, ing.currentStock + Number(change));

  saveFileData(db);
  logAudit("INGREDIENT_STOCK_ADJUSTED", { ingredient: ing.name, newStock: ing.currentStock, reason }, req);
  res.json({ success: true, ingredient: ing });
});

// -------------------------------------------------------------
// 5. Recipe Engine & Food Cost Profitability Matrix
// -------------------------------------------------------------
app.get('/api/recipes', async (req, res) => {
  const db = loadFileData();
  res.json(db.recipes || []);
});

app.post('/api/recipes', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { itemId, itemName, station, prepTimeMinutes, ingredients, laborCost, allergens, instructions } = req.body;
  if (!itemId || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "itemId and ingredients array are required." });
  }

  const recipe = {
    itemId,
    itemName: itemName || db.items.find(i => i.id === itemId)?.name || "Dish",
    station: station || "HOT_KITCHEN",
    prepTimeMinutes: Number(prepTimeMinutes) || 5,
    laborCost: Number(laborCost) || 0,
    allergens: allergens || "",
    instructions: instructions || "",
    ingredients: ingredients.map(ing => ({
      ingredientId: ing.ingredientId,
      name: ing.name,
      quantity: Number(ing.quantity),
      unit: ing.unit || "g"
    }))
  };

  const idx = (db.recipes || []).findIndex(r => r.itemId === itemId);
  if (idx >= 0) db.recipes[idx] = recipe;
  else db.recipes.push(recipe);

  saveFileData(db);
  res.json({ success: true, recipe });
});

app.get('/api/recipes/profitability', async (req, res) => {
  const db = loadFileData();
  const items = db.items || [];
  const ingredients = db.ingredients || [];
  const recipes = db.recipes || [];

  const matrix = items.map(item => {
    const recipe = recipes.find(r => r.itemId === item.id);
    let foodCost = 0;
    const ingredientDetails = [];

    if (recipe && Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach(ri => {
        const ing = ingredients.find(i => i.id === ri.ingredientId || i.name === ri.name);
        const unitCost = ing ? Number(ing.unitCost) : 0;
        const lineCost = unitCost * Number(ri.quantity);
        foodCost += lineCost;
        ingredientDetails.push({
          name: ri.name || ing?.name || "Ingredient",
          quantity: ri.quantity,
          unit: ri.unit || ing?.unit || "",
          unitCost,
          lineCost: Math.round(lineCost * 100) / 100
        });
      });
    }

    const price = Number(item.price) || 0;
    const laborCost = recipe ? Number(recipe.laborCost || 0) : 0;
    const totalCost = foodCost + laborCost;
    const grossMargin = price - foodCost;
    const foodCostPct = price > 0 ? (foodCost / price) * 100 : 0;
    const profitMarginPct = price > 0 ? (grossMargin / price) * 100 : 0;

    let healthStatus = "EXCELLENT"; // < 28% Food Cost
    if (foodCostPct > 38) healthStatus = "WARNING_HIGH_COST";
    else if (foodCostPct > 32) healthStatus = "AVERAGE";

    return {
      itemId: item.id,
      itemName: item.name,
      category: db.categories.find(c => c.id === item.categoryId)?.name || "General",
      station: recipe?.station || item.station || "HOT_KITCHEN",
      prepTimeMinutes: recipe?.prepTimeMinutes || item.prepTimeMinutes || 5,
      price: Math.round(price * 100) / 100,
      foodCost: Math.round(foodCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      profitMarginPct: Math.round(profitMarginPct * 10) / 10,
      healthStatus,
      ingredients: ingredientDetails,
      hasRecipe: !!recipe
    };
  });

  res.json({
    success: true,
    currency: db.storeInfo.currency,
    averageFoodCostPct: Math.round(matrix.filter(m => m.hasRecipe).reduce((acc, m) => acc + m.foodCostPct, 0) / (matrix.filter(m => m.hasRecipe).length || 1) * 10) / 10,
    items: matrix
  });
});

// -------------------------------------------------------------
// 6. Kitchen Display System (KDS) & Routing Stations API
// -------------------------------------------------------------
app.get('/api/kitchen/tickets', async (req, res) => {
  const db = loadFileData();
  let tickets = db.kitchenOrders || [];
  const { station, status } = req.query;

  if (station && station !== 'ALL') {
    tickets = tickets.filter(t => t.station === station);
  }
  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }

  res.json(tickets);
});

app.post('/api/kitchen/tickets', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { orderNumber, tableNumber, customerName, station, items, channel } = req.body;
  if (!items || !station) return res.status(400).json({ error: "station and items are required." });

  const now = Date.now();
  const ticket = {
    id: `ticket_${now}_${Math.random().toString(36).substr(2, 4)}`,
    orderNumber: String(orderNumber || Math.floor(100 + Math.random() * 900)),
    channel: channel || "POS",
    tableNumber: tableNumber || null,
    customerName: customerName || "Walk-in Guest",
    station,
    items,
    status: "PENDING",
    createdAt: now,
    targetReadyAt: now + (5 * 60 * 1000),
    completedAt: null
  };

  db.kitchenOrders.unshift(ticket);
  saveFileData(db);
  res.json({ success: true, ticket });
});

app.post('/api/kitchen/tickets/:id/status', async (req, res) => {
  const db = loadFileData();
  const { status } = req.body;
  const ticket = (db.kitchenOrders || []).find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });

  ticket.status = status; // PENDING, PREPARING, READY, SERVED
  if (status === 'READY' || status === 'SERVED') {
    ticket.completedAt = Date.now();
  }
  saveFileData(db);
  res.json({ success: true, ticket });
});

// -------------------------------------------------------------
// 7. Omnichannel Online Ordering API (Web Storefront / Deliveries)
// -------------------------------------------------------------
app.get('/api/online-orders', async (req, res) => {
  const db = loadFileData();
  res.json(db.onlineOrders || []);
});

app.post('/api/online-orders', async (req, res) => {
  const db = loadFileData();
  const { customerName, customerPhone, deliveryType, tableNumber, pickupTime, items, notes } = req.body;

  if (!customerName || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "customerName and items are required." });
  }

  const subtotal = items.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
  const tax = Math.round(subtotal * (db.storeInfo.taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const now = Date.now();
  const orderNumber = `W-${Math.floor(100 + Math.random() * 900)}`;

  const order = {
    id: `ord_${now}_${Math.random().toString(36).substr(2, 4)}`,
    orderNumber,
    channel: "WEB_STOREFRONT",
    deliveryType: deliveryType || "TAKEAWAY",
    tableNumber: tableNumber || null,
    customerName: customerName.trim(),
    customerPhone: customerPhone || "",
    pickupTime: pickupTime || "Immediate (15-20 min)",
    notes: notes || "",
    subtotal,
    tax,
    total,
    paymentMethod: "ONLINE_CHECKOUT",
    paymentStatus: "PAID",
    status: "RECEIVED",
    items,
    createdAt: now
  };

  db.onlineOrders.unshift(order);

  // Auto-generate formal Receipt for transaction log
  const receipt = {
    id: `REC-${now}`,
    timestamp: now,
    subtotal,
    taxRate: db.storeInfo.taxRate / 100,
    taxAmount: tax,
    grandTotal: total,
    employeeName: "Web Ordering Portal",
    customerName: order.customerName,
    ticketNote: `Online [${order.deliveryType}] - ${order.customerPhone}`,
    isRefund: false,
    payments: [{ type: "CARD", amount: total }],
    items: items.map(i => ({
      name: i.name,
      quantity: Number(i.quantity || 1),
      unitPrice: Number(i.price || 0),
      totalPrice: Number(i.price || 0) * Number(i.quantity || 1)
    }))
  };
  db.receipts.unshift(receipt);

  // Automatic ingredient depletion and KDS Station routing!
  processRecipeDepletionAndKDS({
    id: order.id,
    orderNumber: order.orderNumber,
    channel: "WEB",
    tableNumber: order.tableNumber || (order.deliveryType === 'DINE_IN' ? `Table ${order.tableNumber}` : order.deliveryType),
    customerName: `${order.customerName} (${order.customerPhone})`,
    items: order.items
  }, db);

  saveFileData(db);
  logAudit("ONLINE_ORDER_PLACED", { orderNumber, total, customer: order.customerName }, req);
  res.json({ success: true, order });
});

app.post('/api/online-orders/:id/status', async (req, res) => {
  const db = loadFileData();
  const { status } = req.body;
  const order = (db.onlineOrders || []).find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  order.status = status; // RECEIVED, PREPARING, READY, COMPLETED, CANCELLED
  saveFileData(db);
  res.json({ success: true, order });
});

// -------------------------------------------------------------
// 8. Food Waste & Spoilage Reporting API
// -------------------------------------------------------------
app.get('/api/waste', async (req, res) => {
  const db = loadFileData();
  const logs = db.wasteLogs || [];
  const totalLoss = logs.reduce((sum, w) => sum + (Number(w.cost) || 0), 0);
  res.json({
    totalWasteCost: Math.round(totalLoss * 100) / 100,
    currency: db.storeInfo.currency,
    logs
  });
});

app.post('/api/waste', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { itemOrIngredientId, name, quantity, unit, cost, reason, loggedBy } = req.body;

  if (!name || quantity === undefined) {
    return res.status(400).json({ error: "name and quantity are required." });
  }

  const wasteEntry = {
    id: Date.now(),
    itemOrIngredientId: itemOrIngredientId || "generic",
    name: name.trim(),
    quantity: Number(quantity),
    unit: unit || "units",
    cost: Number(cost || 0),
    reason: reason || "EXPIRED", // EXPIRED, OVERPREP, MISTAKE, STORAGE_FAIL, RETURN
    loggedBy: loggedBy || "Manager",
    timestamp: Date.now()
  };

  db.wasteLogs = db.wasteLogs || [];
  db.wasteLogs.unshift(wasteEntry);

  // Auto-deduct from stock if matching ingredient or item found
  const ing = (db.ingredients || []).find(i => i.id === itemOrIngredientId || i.name === name);
  if (ing) {
    ing.currentStock = Math.max(0, ing.currentStock - wasteEntry.quantity);
  }

  saveFileData(db);
  logAudit("FOOD_WASTE_LOGGED", wasteEntry, req);
  res.json({ success: true, wasteEntry });
});

// -------------------------------------------------------------
// 9. Smart Staffing & Shift Demand Forecast API
// -------------------------------------------------------------
app.get('/api/forecast', async (req, res) => {
  const db = loadFileData();
  const receipts = db.receipts || [];
  const now = new Date();

  // Hourly order density estimation
  const hourlyCount = {};
  for (let h = 7; h <= 22; h++) {
    hourlyCount[`${String(h).padStart(2, '0')}:00`] = 0;
  }

  receipts.forEach(r => {
    const d = new Date(r.timestamp);
    const hStr = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (hourlyCount[hStr] !== undefined) hourlyCount[hStr]++;
  });

  const hourlyForecast = Object.entries(hourlyCount).map(([hour, count]) => {
    const predictedOrders = Math.max(count * 2, Math.floor(8 + Math.random() * 12));
    let baristas = 1;
    let kitchenCooks = 1;
    let floorStaff = 1;

    if (predictedOrders > 25) {
      baristas = 3;
      kitchenCooks = 2;
      floorStaff = 3;
    } else if (predictedOrders > 15) {
      baristas = 2;
      kitchenCooks = 2;
      floorStaff = 2;
    }

    return {
      hour,
      predictedOrders,
      recommendedStaff: {
        total: baristas + kitchenCooks + floorStaff,
        baristas,
        kitchenCooks,
        floorStaff
      }
    };
  });

  res.json({
    day: now.toLocaleDateString(undefined, { weekday: 'long' }),
    totalPredictedOrders: hourlyForecast.reduce((s, h) => s + h.predictedOrders, 0),
    peakHour: "12:00",
    hourlyForecast
  });
});

// -------------------------------------------------------------
// 10. Food Safety & Daily Checklists API
// -------------------------------------------------------------
app.get('/api/safety/temperature', async (req, res) => {
  const db = loadFileData();
  res.json(db.temperatureLogs || []);
});

app.post('/api/safety/temperature', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { unitName, targetTempC, actualTempC, checkedBy } = req.body;
  if (!unitName || actualTempC === undefined) {
    return res.status(400).json({ error: "unitName and actualTempC are required." });
  }

  const actual = Number(actualTempC);
  const target = Number(targetTempC || 4.0);
  let status = "NORMAL";
  if (actual > target + 2) status = "CRITICAL";
  else if (actual > target) status = "WARNING";

  const log = {
    id: Date.now(),
    unitName: unitName.trim(),
    targetTempC: target,
    actualTempC: actual,
    status,
    checkedBy: checkedBy || "Staff Member",
    timestamp: Date.now()
  };

  db.temperatureLogs = db.temperatureLogs || [];
  db.temperatureLogs.unshift(log);
  saveFileData(db);
  res.json({ success: true, log });
});

app.get('/api/safety/checklists', async (req, res) => {
  const db = loadFileData();
  res.json(db.checklists || []);
});

app.post('/api/safety/checklists/:id/toggle', requireApiKey, async (req, res) => {
  const db = loadFileData();
  const { itemId, done } = req.body;
  const list = (db.checklists || []).find(c => c.id === req.params.id);
  if (!list) return res.status(404).json({ error: "Checklist not found." });

  const item = list.items.find(i => i.id === itemId);
  if (item) {
    item.done = !!done;
    item.time = done ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  }
  saveFileData(db);
  res.json({ success: true, checklist: list });
});

// -------------------------------------------------------------
// 11. POS Synchronization & Delta Engine
// -------------------------------------------------------------
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
        } catch (err) {
          console.error("[CloudSync] Postgres receipt insert error:", err.message);
        }
      }

      // 2. In-Memory Store Update & Deduplication
      const existingIdx = db.receipts.findIndex(r => r.id === receipt.id);
      if (existingIdx >= 0) db.receipts[existingIdx] = receipt;
      else db.receipts.unshift(receipt);

      // 3. Process Automatic Ingredient Depletion & KDS Station Routing!
      if (!receipt.isRefund) {
        processRecipeDepletionAndKDS(receipt, db);
      }

      acknowledgedIds.push(eventId);
    } else {
      acknowledgedIds.push(eventId);
    }
  }

  saveFileData(db);

  res.json({
    success: true,
    message: "Delta sync completed successfully",
    syncedAt: Date.now(),
    acknowledgedIds,
    items: db.items,
    categories: db.categories
  });
});

// -------------------------------------------------------------
// 12. Receipts Log & CSV Exports
// -------------------------------------------------------------
app.get('/api/receipts', async (req, res) => {
  const db = loadFileData();
  const sorted = [...(db.receipts || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json(sorted);
});

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
  let csv = "Item ID,Name,Price,Category,Barcode,Stock Quantity,Prep Station,Prep Time Minutes\n";

  items.forEach(i => {
    csv += `"${i.id}","${i.name}",${i.price},"${i.categoryId || ''}","${i.barcode || ''}",${i.stockQuantity || 0},"${i.station || 'HOT_KITCHEN'}",${i.prepTimeMinutes || 5}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="openpos_catalog_export.csv"');
  res.send(csv);
});

// -------------------------------------------------------------
// 13. Danger Zone Reset
// -------------------------------------------------------------
app.post('/api/reset', requireManagerPin, async (req, res) => {
  await initPgTables();
  if (pgPool) {
    try {
      await pgPool.query('TRUNCATE TABLE receipts, items, categories, shifts, audit_logs');
    } catch (_) {}
  }

  const db = JSON.parse(JSON.stringify(DEFAULT_DATA));
  saveFileData(db);
  logAudit("STORE_RESET_EXECUTED", { reason: "Admin requested full reset" }, req);

  res.json({ success: true, message: "All cloud store data reset to clean restaurant default template." });
});

module.exports = app;
