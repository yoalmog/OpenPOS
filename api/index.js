const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createOnlineOrderWithTickets, createKitchenTicket, listOnlineOrders, listKitchenTickets, updateOnlineOrderStatus, updateKitchenTicketStatus } = require('./lib/order-repository');
const { listIngredients, saveIngredient, updateIngredientStock, listRecipes, saveRecipe } = require('./lib/recipe-repository');
const { createPosSaleAtomically, InsufficientStockError } = require('./lib/pos-sale-repository');
const { buildOnlineOrderItems } = require('./lib/online-order-catalog');
const { ensureOperationalTables, getStoreSettings, saveStoreSettings, listOperationalRecords, upsertOperationalRecord } = require('./lib/operational-repository');
const { listReceipts, getHourlyReceiptCounts } = require('./lib/analytics-repository');

const app = express();

// Supabase is the sole API identity provider. Missing configuration fails closed.
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const OPENPOS_OWNER_USER_ID = process.env.OPENPOS_OWNER_USER_ID || "";

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
    apiKey: null
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
        completed_at BIGINT,
        ticket_data JSONB
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
        created_at BIGINT NOT NULL,
        order_data JSONB
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

      ALTER TABLE kitchen_orders ADD COLUMN IF NOT EXISTS ticket_data JSONB;
      ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS order_data JSONB;

      CREATE INDEX IF NOT EXISTS idx_pg_receipts_ts ON receipts (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_pg_items_cat ON items (category_id);
    `);
    await ensureOperationalTables(pgPool);
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

// Public bootstrap endpoint: only the Supabase project URL and anon key are exposed.
app.get("/api/auth-config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// Validate every API request against Supabase Auth. Never trust a client-supplied role.
async function requireSupabaseAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Unauthorized", message: "A Supabase access token is required." });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[AUTH] Supabase server configuration is missing.");
    return res.status(503).json({ error: "Authentication unavailable", message: "Server authentication is not configured." });
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` }
    });
    if (!response.ok) {
      return res.status(401).json({ error: "Unauthorized", message: "The Supabase session is invalid or expired." });
    }
    req.authUser = await response.json();
    return next();
  } catch (error) {
    console.error("[AUTH] Supabase user verification failed:", error.message);
    return res.status(503).json({ error: "Authentication unavailable", message: "Could not verify the Supabase session." });
  }
}

function hasAdminRole(user) {
  const role = user && user.app_metadata && user.app_metadata.role;
  return Boolean(user && (
    (OPENPOS_OWNER_USER_ID && user.id === OPENPOS_OWNER_USER_ID) ||
    role === "owner" ||
    role === "admin"
  ));
}

// Public endpoints required by the customer storefront. All other API routes require
// a server-verified Supabase session. Never expose order management or POS data publicly.
function isPublicStorefrontRequest(req) {
  // Express strips the mounted "/api" prefix from req.path inside this middleware.
  // Use originalUrl so the allowlist matches the complete API pathname.
  const pathname = (req.originalUrl || req.path).split("?")[0];
  return (
    (req.method === "GET" && ["/api/status", "/api/categories", "/api/items"].includes(pathname)) ||
    (req.method === "POST" && pathname === "/api/online-orders")
  );
}

app.use("/api", (req, res, next) => {
  if (isPublicStorefrontRequest(req)) return next();
  return requireSupabaseAuth(req, res, (error) => {
    if (error) return next(error);
    // Until employee permissions are implemented, authenticated API access is owner/admin only.
    // This prevents ordinary authenticated accounts from reaching routes that lack local role checks.
    if (!hasAdminRole(req.authUser)) {
      return res.status(403).json({ error: "Forbidden", message: "Owner or admin role is required." });
    }
    return next();
  });
});

// Compatibility middleware name retained for existing route declarations.
// It now checks server-verified Supabase identity, not a shared API key.
function requireApiKey(req, res, next) {
  if (!hasAdminRole(req.authUser)) {
    return res.status(403).json({ error: "Forbidden", message: "Owner or admin role is required." });
  }
  return next();
}

function requireManagerPin(req, res, next) {
  if (!hasAdminRole(req.authUser)) {
    return res.status(403).json({ error: "Forbidden", message: "Owner or admin role is required." });
  }
  return next();
}

// Audit Logger
async function logAudit(action, details, req) {
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    action,
    details: details || {},
    ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress) : 'SYSTEM'
  };
  if (pgPool) {
    await initPgTables();
    await upsertOperationalRecord(pgPool, "audit_logs", entry);
    return entry;
  }
  if (isVercel) throw new Error("Persistent audit storage is unavailable.");
  const store = loadFileData();
  store.auditLogs = store.auditLogs || [];
  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 100) store.auditLogs = store.auditLogs.slice(0, 100);
  saveFileData(store);
  return entry;
}

// -------------------------------------------------------------
// RESTAURANT CORE: Automatic Recipe Depletion & KDS Dispatcher
// -------------------------------------------------------------
function processRecipeDepletionAndKDS(order, db, options = {}) {
  if (!order || !Array.isArray(order.items)) return;

  // 1. Raw Ingredient Depletion. Public online orders are not paid/accepted yet,
  // so they must not consume stock until staff confirms the order.
  // The legacy file-backed recipe/ingredient arrays are demo fallbacks in Vercel.
  // Never mutate them as if they were authoritative production inventory.
  if (options.depleteInventory !== false && !isVercel) order.items.forEach(orderItem => {
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
  let databaseConnected = false;
  if (pgPool) {
    try {
      await pgPool.query('SELECT 1 AS health_check');
      databaseConnected = true;
    } catch (error) {
      console.error("[DB] Health check failed:", error.message);
    }
  }
  if (isVercel && (!pgPool || !tablesInitialized || !databaseConnected)) {
    return res.status(503).json({
      status: "degraded",
      storageEngine: "PostgreSQL unavailable",
      database: { configured: Boolean(dbUrl), connected: databaseConnected },
      system: "OpenPOS Restaurant & Cafe Cloud Edition",
      version: "3.5.0",
      timestamp: Date.now()
    });
  }
  let storeInfo = null;
  let counts = { items: 0, categories: 0, receipts: 0, recipes: 0, ingredients: 0, kitchenTickets: 0, onlineOrders: 0 };
  if (databaseConnected) {
    try {
      storeInfo = await getStoreSettings(pgPool);
      const result = await pgPool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM items) AS items,
          (SELECT COUNT(*)::int FROM categories) AS categories,
          (SELECT COUNT(*)::int FROM receipts) AS receipts,
          (SELECT COUNT(*)::int FROM recipes) AS recipes,
          (SELECT COUNT(*)::int FROM ingredients) AS ingredients,
          (SELECT COUNT(*)::int FROM kitchen_orders WHERE status <> 'SERVED') AS kitchen_tickets,
          (SELECT COUNT(*)::int FROM online_orders) AS online_orders
      `);
      const row = result.rows[0] || {};
      counts = {
        items: Number(row.items || 0), categories: Number(row.categories || 0),
        receipts: Number(row.receipts || 0), recipes: Number(row.recipes || 0),
        ingredients: Number(row.ingredients || 0), kitchenTickets: Number(row.kitchen_tickets || 0),
        onlineOrders: Number(row.online_orders || 0)
      };
    } catch (error) {
      console.error("[DB] Persistent status read failed:", error.message);
      return res.status(503).json({ status: "degraded", error: "Persistent status data is unavailable." });
    }
  } else if (!isVercel) {
    const local = loadFileData();
    storeInfo = local.storeInfo || null;
    counts = {
      items: (local.items || []).length, categories: (local.categories || []).length,
      receipts: (local.receipts || []).length, recipes: (local.recipes || []).length,
      ingredients: (local.ingredients || []).length,
      kitchenTickets: (local.kitchenOrders || []).filter(t => t.status !== "SERVED").length,
      onlineOrders: (local.onlineOrders || []).length
    };
  }
  res.json({
    status: "online",
    storageEngine: databaseConnected ? "PostgreSQL (connection verified)" : "Local File System (development only)",
    database: { configured: Boolean(dbUrl), connected: databaseConnected },
    platform: isVercel ? "Vercel Serverless" : "Node Server",
    system: "OpenPOS Restaurant & Cafe Cloud Edition",
    version: "3.5.0",
    timestamp: Date.now(),
    storeName: storeInfo?.name || null,
    currency: storeInfo?.currency || null,
    taxRate: storeInfo?.taxRate ?? null,
    counts
  });
});

app.post('/api/store', async (req, res) => {
  if (!hasAdminRole(req.authUser)) {
    return res.status(403).json({ error: "Forbidden", message: "Owner or admin role is required to change store configuration." });
  }
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) {
    return res.status(503).json({ error: "Persistent store settings are unavailable." });
  }
  const { name, currency, taxRate, address } = req.body || {};
  let storeInfo;
  if (pgPool) {
    try {
      const current = await getStoreSettings(pgPool) || {};
      const updated = { ...current };
      if (name !== undefined) updated.name = String(name);
      if (currency !== undefined) updated.currency = String(currency);
      if (taxRate !== undefined) {
        const parsedTaxRate = Number(taxRate);
        if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 100) {
          return res.status(400).json({ error: "taxRate must be between 0 and 100." });
        }
        updated.taxRate = parsedTaxRate;
      }
      if (address !== undefined) updated.address = String(address);
      storeInfo = await saveStoreSettings(pgPool, updated);
    } catch (error) {
      console.error("[DB] Store settings save failed:", error.message);
      return res.status(503).json({ error: "Store settings could not be saved." });
    }
  } else {
    const db = loadFileData();
    if (name !== undefined) db.storeInfo.name = name;
    if (currency !== undefined) db.storeInfo.currency = currency;
    if (taxRate !== undefined) db.storeInfo.taxRate = Number(taxRate);
    if (address !== undefined) db.storeInfo.address = address;
    saveFileData(db);
    storeInfo = db.storeInfo;
  }
  try { await logAudit("STORE_CONFIG_UPDATED", { name, currency, taxRate }, req); }
  catch (error) { console.error("[Audit] Store config audit write failed:", error.message); }
  res.json({ success: true, storeInfo });
});

// -------------------------------------------------------------
// 2. Real-time Dashboard Analytics with Date Range Filtering
// -------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  await initPgTables();
  const period = req.query.period || 'all';
  const now = new Date();
  let fromTs;
  let toTs;
  if (req.query.from !== undefined || req.query.to !== undefined) {
    fromTs = Number(req.query.from);
    toTs = Number(req.query.to);
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || fromTs > toTs) {
      return res.status(400).json({ error: "A valid from/to timestamp range is required." });
    }
  } else if (period === 'today') {
    fromTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  } else if (period === 'yesterday') {
    fromTs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    toTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
  } else if (period === 'week') {
    fromTs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();
  } else if (period === 'month') {
    fromTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  let receipts;
  try {
    if (pgPool) receipts = await listReceipts(pgPool, { from: fromTs, to: toTs });
    else if (isVercel) return res.status(503).json({ error: "Persistent analytics data is unavailable." });
    else {
      receipts = (loadFileData().receipts || []).filter(receipt =>
        (fromTs === undefined || receipt.timestamp >= fromTs) &&
        (toTs === undefined || receipt.timestamp <= toTs)
      );
    }
  } catch (error) {
    console.error("[Analytics] Receipt query failed:", error.message);
    return res.status(503).json({ error: "Sales analytics are temporarily unavailable." });
  }

  const getReceiptTotal = receipt => Number(receipt.grandTotal !== undefined ? receipt.grandTotal : (receipt.total !== undefined ? receipt.total : (receipt.totalAmount || 0)));
  const totalRevenue = receipts.reduce((sum, receipt) => sum + getReceiptTotal(receipt), 0);
  const totalOrders = receipts.length;
  const averageTicket = totalOrders ? totalRevenue / totalOrders : 0;
  let cashSales = 0, cardSales = 0, refundTotal = 0;
  receipts.forEach(receipt => {
    const total = getReceiptTotal(receipt);
    if (receipt.isRefund) refundTotal += Math.abs(total);
    if (Array.isArray(receipt.payments) && receipt.payments.length) {
      receipt.payments.forEach(payment => {
        const amount = Number(payment.amount) || 0;
        if (payment.type === 'CASH' || payment.type === 'מזומן') cashSales += amount;
        else if (payment.type === 'CARD' || payment.type === 'אשראי') cardSales += amount;
        else cashSales += amount;
      });
    } else cashSales += total;
  });
  const hourlySales = {};
  for (let hour = 0; hour < 24; hour++) hourlySales[`${String(hour).padStart(2, '0')}:00`] = 0;
  receipts.forEach(receipt => {
    const hour = `${String(new Date(receipt.timestamp).getHours()).padStart(2, '0')}:00`;
    hourlySales[hour] += getReceiptTotal(receipt);
  });
  const productSalesCount = {};
  receipts.forEach(receipt => (Array.isArray(receipt.items) ? receipt.items : []).forEach(line => {
    const name = line.name || line.itemName || line.item?.name || "Item";
    const quantity = Number(line.quantity !== undefined ? line.quantity : (line.qty || 1));
    productSalesCount[name] = (productSalesCount[name] || 0) + quantity;
  }));
  const topSelling = Object.entries(productSalesCount)
    .map(([name, qty]) => ({ name, qty }))
    .sort((left, right) => right.qty - left.qty)
    .slice(0, 6);
  return res.json({
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

// PostgreSQL catalog repository helpers. API responses retain the existing camelCase contract.
async function listPgCategories() {
  const result = await pgPool.query('SELECT id, name, color FROM categories ORDER BY name');
  return result.rows.map(row => ({ id: row.id, name: row.name, color: Number(row.color) }));
}

async function savePgCategory(category) {
  await pgPool.query(
    `INSERT INTO categories (id, name, color, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = EXCLUDED.updated_at`,
    [category.id, category.name, category.color, Date.now()]
  );
}

async function listPgItems() {
  const result = await pgPool.query(
    'SELECT id, name, price, category_id, barcode, color, stock_quantity, station, prep_time_minutes FROM items ORDER BY name'
  );
  return result.rows.map(row => ({
    id: row.id, name: row.name, price: Number(row.price), categoryId: row.category_id,
    barcode: row.barcode || "", color: row.color === null ? null : Number(row.color),
    stockQuantity: Number(row.stock_quantity || 0), station: row.station || "HOT_KITCHEN",
    prepTimeMinutes: Number(row.prep_time_minutes || 5)
  }));
}

async function savePgItem(item) {
  await pgPool.query(
    `INSERT INTO items
      (id, name, price, category_id, barcode, color, stock_quantity, station, prep_time_minutes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, price=EXCLUDED.price, category_id=EXCLUDED.category_id,
      barcode=EXCLUDED.barcode, color=EXCLUDED.color, stock_quantity=EXCLUDED.stock_quantity,
      station=EXCLUDED.station, prep_time_minutes=EXCLUDED.prep_time_minutes, updated_at=EXCLUDED.updated_at`,
    [item.id, item.name, item.price, item.categoryId, item.barcode, item.color,
      item.stockQuantity, item.station, item.prepTimeMinutes, Date.now()]
  );
}

async function deletePgItem(id) {
  await pgPool.query('DELETE FROM items WHERE id = $1', [id]);
}

// -------------------------------------------------------------
// 3. Catalog Items & Categories API
// -------------------------------------------------------------
app.get('/api/categories', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent catalog storage is unavailable." });
  try {
    if (pgPool) return res.json(await listPgCategories());
    const db = loadFileData();
    return res.json(db.categories || []);
  } catch (error) {
    console.error("[DB] Category read failed:", error.message);
    return res.status(503).json({ error: "Could not read persistent categories." });
  }
});

app.post('/api/categories', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent catalog storage is unavailable." });
  const { name, color } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Category name is required." });
  const newCat = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(),
    color: Number(color) || -16744448
  };
  try {
    if (pgPool) await savePgCategory(newCat);
    else {
      const db = loadFileData();
      db.categories = db.categories || [];
      db.categories.push(newCat);
      saveFileData(db);
    }
    return res.json({ success: true, category: newCat });
  } catch (error) {
    console.error("[DB] Category save failed:", error.message);
    return res.status(503).json({ error: "Category could not be saved persistently." });
  }
});

app.get('/api/items', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent catalog storage is unavailable." });
  try {
    if (pgPool) return res.json(await listPgItems());
    const db = loadFileData();
    return res.json(db.items || []);
  } catch (error) {
    console.error("[DB] Item read failed:", error.message);
    return res.status(503).json({ error: "Could not read persistent items." });
  }
});

app.post('/api/items', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent catalog storage is unavailable." });
  const item = req.body || {};
  if (!item.name || typeof item.name !== "string" || !item.name.trim() ||
      item.price === undefined || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) {
    return res.status(400).json({ error: "A valid item name and non-negative price are required." });
  }

  const formattedItem = {
    id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: item.name.trim(),
    price: Number(item.price),
    categoryId: item.categoryId || "general",
    barcode: item.barcode || "",
    color: Number(item.color) || -16744448,
    stockQuantity: Number.isFinite(Number(item.stockQuantity)) ? Number(item.stockQuantity) : 100,
    station: item.station || "HOT_KITCHEN",
    prepTimeMinutes: Number(item.prepTimeMinutes) || 5
  };

  try {
    if (pgPool) await savePgItem(formattedItem);
    else {
      const db = loadFileData();
      db.items = db.items || [];
      const existingIdx = db.items.findIndex(i => i.id === formattedItem.id);
      if (existingIdx >= 0) db.items[existingIdx] = formattedItem;
      else db.items.push(formattedItem);
      saveFileData(db);
    }
    return res.json({ success: true, item: formattedItem });
  } catch (error) {
    console.error("[DB] Item save failed:", error.message);
    return res.status(503).json({ error: "Item could not be saved persistently." });
  }
});

app.delete('/api/items/:id', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent catalog storage is unavailable." });
  try {
    if (pgPool) await deletePgItem(req.params.id);
    else {
      const db = loadFileData();
      db.items = (db.items || []).filter(i => i.id !== req.params.id);
      saveFileData(db);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("[DB] Item delete failed:", error.message);
    return res.status(503).json({ error: "Item could not be deleted from persistent storage." });
  }
});

// -------------------------------------------------------------
// 4. Raw Ingredients & Inventory API
// -------------------------------------------------------------
app.get('/api/ingredients', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent ingredient storage is unavailable." });
  try {
    if (pgPool) return res.json(await listIngredients(pgPool));
    const db = loadFileData();
    return res.json(db.ingredients || []);
  } catch (error) {
    console.error("[DB] Ingredient read failed:", error.message);
    return res.status(503).json({ error: "Could not read persistent ingredients." });
  }
});

app.post('/api/ingredients', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent ingredient storage is unavailable." });
  const db = pgPool ? null : loadFileData();
  const { id, name, unit, unitCost, currentStock, minThreshold } = req.body;
  const cost = Number(unitCost);
  const stock = Number(currentStock ?? 0);
  const threshold = Number(minThreshold ?? 0);
  if (!name || typeof name !== "string" || !name.trim() || unitCost === undefined ||
      !Number.isFinite(cost) || cost < 0 || !Number.isFinite(stock) || stock < 0 ||
      !Number.isFinite(threshold) || threshold < 0) {
    return res.status(400).json({ error: "Valid name, non-negative unitCost, currentStock and minThreshold are required." });
  }

  const ing = {
    id: id || `ing_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim(), unit: unit || "g", unitCost: cost,
    currentStock: stock, minThreshold: threshold
  };
  try {
    if (pgPool) await saveIngredient(pgPool, ing);
    else {
      const idx = (db.ingredients || []).findIndex(i => i.id === ing.id);
      if (idx >= 0) db.ingredients[idx] = ing;
      else db.ingredients.push(ing);
      saveFileData(db);
    }
    return res.json({ success: true, ingredient: ing });
  } catch (error) {
    console.error("[DB] Ingredient save failed:", error.message);
    return res.status(503).json({ error: "Ingredient could not be saved persistently." });
  }
});

app.put('/api/ingredients/:id/stock', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent ingredient storage is unavailable." });
  const { change, newStock, reason } = req.body;
  if ((newStock === undefined && change === undefined) ||
      (newStock !== undefined && (!Number.isFinite(Number(newStock)) || Number(newStock) < 0)) ||
      (change !== undefined && !Number.isFinite(Number(change)))) {
    return res.status(400).json({ error: "A valid non-negative newStock or finite change is required." });
  }
  try {
    let ing;
    if (pgPool) ing = await updateIngredientStock(pgPool, req.params.id, { change, newStock });
    else {
      const db = loadFileData();
      const local = (db.ingredients || []).find(i => i.id === req.params.id);
      if (local) {
        if (newStock !== undefined) local.currentStock = Number(newStock);
        else local.currentStock = Math.max(0, Number(local.currentStock || 0) + Number(change));
        saveFileData(db);
        ing = local;
      }
    }
    if (!ing) return res.status(404).json({ error: "Ingredient not found." });
    await logAudit("INGREDIENT_STOCK_ADJUSTED", { ingredient: ing.name, newStock: ing.currentStock, reason }, req);
    return res.json({ success: true, ingredient: ing });
  } catch (error) {
    console.error("[DB] Ingredient stock update failed:", error.message);
    return res.status(503).json({ error: "Ingredient stock could not be updated persistently." });
  }
});

// -------------------------------------------------------------
// 5. Recipe Engine & Food Cost Profitability Matrix
// -------------------------------------------------------------
app.get('/api/recipes', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent recipe storage is unavailable." });
  try {
    if (pgPool) return res.json(await listRecipes(pgPool));
    const db = loadFileData();
    return res.json(db.recipes || []);
  } catch (error) {
    console.error("[DB] Recipe read failed:", error.message);
    return res.status(503).json({ error: "Could not read persistent recipes." });
  }
});

app.post('/api/recipes', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent recipe storage is unavailable." });
  const { itemId, itemName, station, prepTimeMinutes, ingredients, laborCost, allergens, instructions } = req.body;
  if (!itemId || !Array.isArray(ingredients) ||
      ingredients.some(ing => !ing || !ing.ingredientId || !Number.isFinite(Number(ing.quantity)) || Number(ing.quantity) <= 0)) {
    return res.status(400).json({ error: "itemId and valid ingredients with positive quantities are required." });
  }

  const db = pgPool ? null : loadFileData();
  let resolvedItemName = itemName;
  if (pgPool && !resolvedItemName) {
    const itemResult = await pgPool.query('SELECT name FROM items WHERE id = $1', [itemId]);
    resolvedItemName = itemResult.rows[0]?.name;
  } else if (!pgPool && !resolvedItemName) {
    resolvedItemName = db.items.find(i => i.id === itemId)?.name;
  }
  const recipe = {
    itemId, itemName: resolvedItemName || "Dish", station: station || "HOT_KITCHEN",
    prepTimeMinutes: Number(prepTimeMinutes) || 5,
    laborCost: Number(laborCost) || 0,
    allergens: allergens || "", instructions: instructions || "",
    ingredients: ingredients.map(ing => ({
      ingredientId: ing.ingredientId, name: ing.name || "",
      quantity: Number(ing.quantity), unit: ing.unit || "g"
    }))
  };
  if (!Number.isFinite(recipe.laborCost) || recipe.laborCost < 0) {
    return res.status(400).json({ error: "laborCost must be a non-negative number." });
  }
  try {
    if (pgPool) await saveRecipe(pgPool, recipe);
    else {
      const idx = (db.recipes || []).findIndex(r => r.itemId === itemId);
      if (idx >= 0) db.recipes[idx] = recipe;
      else db.recipes.push(recipe);
      saveFileData(db);
    }
    return res.json({ success: true, recipe });
  } catch (error) {
    console.error("[DB] Recipe save failed:", error.message);
    return res.status(503).json({ error: "Recipe could not be saved persistently." });
  }
});

app.get('/api/recipes/profitability', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent profitability data is unavailable." });
  const db = pgPool ? loadFileData() : loadFileData();
  let items = db.items || [];
  let categories = db.categories || [];
  let ingredients = db.ingredients || [];
  let recipes = db.recipes || [];
  try {
    if (pgPool) {
      [items, categories, ingredients, recipes] = await Promise.all([
        listPgItems(), listPgCategories(), listIngredients(pgPool), listRecipes(pgPool)
      ]);
    }
  } catch (error) {
    console.error("[DB] Profitability read failed:", error.message);
    return res.status(503).json({ error: "Could not read persistent profitability data." });
  }

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
      category: categories.find(c => c.id === item.categoryId)?.name || "General",
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
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent kitchen storage is unavailable." });
  if (pgPool) {
    try { return res.json(await listKitchenTickets(pgPool, req.query)); }
    catch (error) { console.error("[DB] KDS ticket read failed:", error.message); return res.status(503).json({ error: "Could not read persistent kitchen tickets." }); }
  }
  const db = loadFileData();
  let tickets = db.kitchenOrders || [];
  const { station, status } = req.query;
  if (station && station !== 'ALL') tickets = tickets.filter(t => t.station === station);
  if (status) tickets = tickets.filter(t => t.status === status);
  res.json(tickets);
});

app.post('/api/kitchen/tickets', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent kitchen storage is unavailable." });
  const { orderNumber, tableNumber, customerName, station, items, channel } = req.body;
  if (!items || !station) return res.status(400).json({ error: "station and items are required." });
  const now = Date.now();
  const ticket = {
    id: `ticket_${now}_${Math.random().toString(36).substr(2, 4)}`,
    orderNumber: String(orderNumber || Math.floor(100 + Math.random() * 900)),
    channel: channel || "POS", tableNumber: tableNumber || null,
    customerName: customerName || "Walk-in Guest", station, items,
    status: "PENDING", createdAt: now, targetReadyAt: now + (5 * 60 * 1000), completedAt: null
  };
  try {
    if (pgPool) await createKitchenTicket(pgPool, ticket);
    else { const db = loadFileData(); db.kitchenOrders.unshift(ticket); saveFileData(db); }
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[DB] KDS ticket insert failed:", error.message);
    return res.status(503).json({ error: "The kitchen ticket could not be safely saved." });
  }
});

app.post('/api/kitchen/tickets/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!["PENDING", "PREPARING", "READY", "SERVED"].includes(status)) return res.status(400).json({ error: "Invalid ticket status." });
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent kitchen storage is unavailable." });
  if (pgPool) {
    try {
      const completedAt = status === "READY" || status === "SERVED" ? Date.now() : null;
      const ticket = await updateKitchenTicketStatus(pgPool, req.params.id, status, completedAt);
      return ticket ? res.json({ success: true, ticket }) : res.status(404).json({ error: "Ticket not found." });
    } catch (error) { console.error("[DB] KDS status update failed:", error.message); return res.status(503).json({ error: "Could not update persistent kitchen ticket." }); }
  }
  const db = loadFileData();
  const ticket = (db.kitchenOrders || []).find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });
  ticket.status = status;
  if (status === "READY" || status === "SERVED") ticket.completedAt = Date.now();
  saveFileData(db);
  res.json({ success: true, ticket });
});

// -------------------------------------------------------------
// 7. Omnichannel Online Ordering API (Web Storefront / Deliveries)
// -------------------------------------------------------------
app.get('/api/online-orders', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent online-order storage is unavailable." });
  if (pgPool) {
    try { return res.json(await listOnlineOrders(pgPool)); }
    catch (error) { console.error("[DB] Online order read failed:", error.message); return res.status(503).json({ error: "Could not read persistent online orders." }); }
  }
  const db = loadFileData();
  res.json(db.onlineOrders || []);
});

app.post('/api/online-orders', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent online-order storage is unavailable." });
  const db = loadFileData();
  const { customerName, customerPhone, deliveryType, tableNumber, pickupTime, items, notes } = req.body;

  if (!customerName || !Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ error: "customerName and a valid items array are required." });
  }

  // The browser supplies only item IDs, quantities and notes. In Production,
  // PostgreSQL is the sole source of catalog names and prices.
  let orderItems;
  try {
    orderItems = await buildOnlineOrderItems({
      pool: pgPool,
      requestedItems: items,
      localCatalog: isVercel ? [] : (db.items || [])
    });
  } catch (error) {
    if (error.code === "INVALID_ORDER_ITEM") {
      return res.status(400).json({ error: "An order item is invalid or unavailable." });
    }
    console.error("[DB] Online order catalog lookup failed:", error.message);
    return res.status(503).json({ error: "The current catalog is unavailable. Please retry." });
  }

  const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
    paymentMethod: "PAY_ON_PICKUP",
    paymentStatus: "UNPAID",
    status: "RECEIVED",
    items: orderItems,
    createdAt: now
  };

  // An unpaid web order is not a completed sale: do not create a receipt
  // or record CARD revenue until a payment provider confirms settlement.

  // Generate station tickets without mutating inventory; persist both records atomically.
  const ticketDb = { ...db, kitchenOrders: [], ingredients: JSON.parse(JSON.stringify(db.ingredients || [])) };
  processRecipeDepletionAndKDS({
    id: order.id, orderNumber: order.orderNumber, channel: "WEB",
    tableNumber: order.tableNumber || order.deliveryType,
    customerName: order.customerName + (order.customerPhone ? " (" + order.customerPhone + ")" : ""),
    items: order.items
  }, ticketDb, { depleteInventory: false });
  const tickets = ticketDb.kitchenOrders || [];
  try {
    if (pgPool) await createOnlineOrderWithTickets(pgPool, order, tickets);
    else {
      db.onlineOrders.unshift(order);
      db.kitchenOrders = [...tickets, ...(db.kitchenOrders || [])].slice(0, 80);
      saveFileData(db);
    }
  } catch (error) {
    console.error("[DB] Atomic online order/KDS insert failed:", error.message);
    return res.status(503).json({ error: "The order could not be safely saved. Please retry." });
  }
  try { await logAudit("ONLINE_ORDER_PLACED", { orderNumber, total, customer: order.customerName }, req); } catch (error) { console.error("[Audit] Online order audit write failed:", error.message); }
  res.json({ success: true, order, kitchenTickets: tickets.length });
});

app.post('/api/online-orders/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!["RECEIVED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Invalid order status." });
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent online-order storage is unavailable." });
  if (pgPool) {
    try {
      const order = await updateOnlineOrderStatus(pgPool, req.params.id, status);
      return order ? res.json({ success: true, order }) : res.status(404).json({ error: "Order not found." });
    } catch (error) { console.error("[DB] Online order status update failed:", error.message); return res.status(503).json({ error: "Could not update persistent online order." }); }
  }
  const db = loadFileData();
  const order = (db.onlineOrders || []).find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  order.status = status;
  saveFileData(db);
  res.json({ success: true, order });
});

// -------------------------------------------------------------
// 8. Food Waste & Spoilage Reporting API
// -------------------------------------------------------------
app.get('/api/waste', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent waste-log storage is unavailable." });
  try {
    const logs = pgPool
      ? await listOperationalRecords(pgPool, "waste_logs")
      : (loadFileData().wasteLogs || []);
    const settings = pgPool ? await getStoreSettings(pgPool) : loadFileData().storeInfo;
    const totalLoss = logs.reduce((sum, entry) => sum + (Number(entry.cost) || 0), 0);
    return res.json({ totalWasteCost: Math.round(totalLoss * 100) / 100, currency: settings?.currency || null, logs });
  } catch (error) {
    console.error("[DB] Waste-log read failed:", error.message);
    return res.status(503).json({ error: "Waste logs are temporarily unavailable." });
  }
});

app.post('/api/waste', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent waste-log storage is unavailable." });
  const { itemOrIngredientId, name, quantity, unit, cost, reason, loggedBy } = req.body || {};
  const parsedQuantity = Number(quantity);
  const parsedCost = Number(cost || 0);
  if (!name || quantity === undefined || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 ||
      !Number.isFinite(parsedCost) || parsedCost < 0) {
    return res.status(400).json({ error: "A valid name, positive quantity and non-negative cost are required." });
  }
  const wasteEntry = {
    id: `waste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    itemOrIngredientId: itemOrIngredientId || "generic",
    name: String(name).trim(), quantity: parsedQuantity, unit: unit || "units",
    cost: parsedCost, reason: reason || "EXPIRED", loggedBy: loggedBy || "Manager",
    timestamp: Date.now()
  };
  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await upsertOperationalRecord(client, "waste_logs", wasteEntry);
      const ingredientResult = await client.query(
        "SELECT id FROM ingredients WHERE id = $1 OR LOWER(name) = LOWER($2) LIMIT 1",
        [itemOrIngredientId || null, String(name).trim()]
      );
      if (ingredientResult.rowCount) {
        await updateIngredientStock(client, ingredientResult.rows[0].id, { change: -parsedQuantity });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[DB] Waste-log transaction failed:", error.message);
      return res.status(503).json({ error: "Waste log and inventory adjustment could not be saved." });
    } finally { client.release(); }
  } else {
    const db = loadFileData();
    db.wasteLogs = db.wasteLogs || [];
    db.wasteLogs.unshift(wasteEntry);
    const ingredient = (db.ingredients || []).find(item => item.id === itemOrIngredientId || item.name === name);
    if (ingredient) ingredient.currentStock = Math.max(0, ingredient.currentStock - parsedQuantity);
    saveFileData(db);
  }
  try { await logAudit("FOOD_WASTE_LOGGED", wasteEntry, req); } catch (error) {
    console.error("[Audit] Waste log audit write failed:", error.message);
  }
  return res.json({ success: true, wasteEntry });
});

// -------------------------------------------------------------
// 9. Smart Staffing & Shift Demand Forecast API
// -------------------------------------------------------------
app.get('/api/forecast', async (req, res) => {
  await initPgTables();
  const now = new Date();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const since = now.getTime() - sevenDays;
  let hourlyCounts = Array(24).fill(0);
  try {
    if (pgPool) {
      const observed = await getHourlyReceiptCounts(pgPool, since);
      observed.forEach(row => { if (row.hour >= 0 && row.hour < 24) hourlyCounts[row.hour] = row.orders; });
    } else if (isVercel) {
      return res.status(503).json({ error: "Persistent forecast data is unavailable." });
    } else {
      (loadFileData().receipts || []).filter(receipt => Number(receipt.timestamp) >= since && !receipt.isRefund)
        .forEach(receipt => { const hour = new Date(receipt.timestamp).getHours(); hourlyCounts[hour]++; });
    }
  } catch (error) {
    console.error("[Forecast] Receipt history query failed:", error.message);
    return res.status(503).json({ error: "Forecast data is temporarily unavailable." });
  }
  const hourlyForecast = [];
  for (let hour = 7; hour <= 22; hour++) {
    const predictedOrders = Math.round(hourlyCounts[hour] / 7);
    let baristas = 0, kitchenCooks = 0, floorStaff = 0;
    if (predictedOrders > 25) { baristas = 3; kitchenCooks = 2; floorStaff = 3; }
    else if (predictedOrders > 15) { baristas = 2; kitchenCooks = 2; floorStaff = 2; }
    else if (predictedOrders > 0) { baristas = 1; kitchenCooks = 1; floorStaff = 1; }
    hourlyForecast.push({
      hour: `${String(hour).padStart(2, '0')}:00`,
      predictedOrders,
      recommendedStaff: { total: baristas + kitchenCooks + floorStaff, baristas, kitchenCooks, floorStaff }
    });
  }
  const peak = hourlyForecast.reduce((best, current) => current.predictedOrders > best.predictedOrders ? current : best, hourlyForecast[0]);
  return res.json({
    day: now.toLocaleDateString(undefined, { weekday: 'long' }),
    historicalWindowDays: 7,
    totalPredictedOrders: hourlyForecast.reduce((sum, hour) => sum + hour.predictedOrders, 0),
    peakHour: peak?.predictedOrders > 0 ? peak.hour : null,
    hourlyForecast
  });
});

// -------------------------------------------------------------
// 10. Food Safety & Daily Checklists API
// -------------------------------------------------------------
app.get('/api/safety/temperature', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent temperature-log storage is unavailable." });
  try {
    return res.json(pgPool
      ? await listOperationalRecords(pgPool, "temperature_logs")
      : (loadFileData().temperatureLogs || []));
  } catch (error) {
    console.error("[DB] Temperature-log read failed:", error.message);
    return res.status(503).json({ error: "Temperature logs are temporarily unavailable." });
  }
});

app.post('/api/safety/temperature', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent temperature-log storage is unavailable." });
  const { unitName, targetTempC, actualTempC, checkedBy } = req.body || {};
  if (!unitName || actualTempC === undefined || !Number.isFinite(Number(actualTempC))) {
    return res.status(400).json({ error: "unitName and a valid actualTempC are required." });
  }
  const actual = Number(actualTempC);
  const target = targetTempC === undefined ? 4 : Number(targetTempC);
  if (!Number.isFinite(target)) return res.status(400).json({ error: "targetTempC must be a number." });
  const log = {
    id: `temperature_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    unitName: String(unitName).trim(), targetTempC: target, actualTempC: actual,
    status: actual > target + 2 ? "CRITICAL" : (actual > target ? "WARNING" : "NORMAL"),
    checkedBy: checkedBy || "Staff Member", timestamp: Date.now()
  };
  try {
    if (pgPool) await upsertOperationalRecord(pgPool, "temperature_logs", log);
    else {
      const db = loadFileData();
      db.temperatureLogs = db.temperatureLogs || [];
      db.temperatureLogs.unshift(log);
      saveFileData(db);
    }
    return res.json({ success: true, log });
  } catch (error) {
    console.error("[DB] Temperature-log save failed:", error.message);
    return res.status(503).json({ error: "Temperature log could not be saved." });
  }
});

app.get('/api/safety/checklists', async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent checklist storage is unavailable." });
  try {
    return res.json(pgPool
      ? await listOperationalRecords(pgPool, "checklists")
      : (loadFileData().checklists || []));
  } catch (error) {
    console.error("[DB] Checklist read failed:", error.message);
    return res.status(503).json({ error: "Checklists are temporarily unavailable." });
  }
});

app.post('/api/safety/checklists/:id/toggle', requireApiKey, async (req, res) => {
  await initPgTables();
  if (isVercel && (!pgPool || !tablesInitialized)) return res.status(503).json({ error: "Persistent checklist storage is unavailable." });
  const { itemId, done } = req.body || {};
  try {
    if (pgPool) {
      const lists = await listOperationalRecords(pgPool, "checklists", 1000);
      const list = lists.find(entry => String(entry.id) === String(req.params.id));
      if (!list) return res.status(404).json({ error: "Checklist not found." });
      const item = (list.items || []).find(entry => String(entry.id) === String(itemId));
      if (!item) return res.status(404).json({ error: "Checklist item not found." });
      item.done = Boolean(done);
      item.time = done ? new Date().toISOString() : null;
      await upsertOperationalRecord(pgPool, "checklists", list);
      return res.json({ success: true, checklist: list });
    }
    const db = loadFileData();
    const list = (db.checklists || []).find(entry => entry.id === req.params.id);
    if (!list) return res.status(404).json({ error: "Checklist not found." });
    const item = (list.items || []).find(entry => entry.id === itemId);
    if (!item) return res.status(404).json({ error: "Checklist item not found." });
    item.done = Boolean(done);
    item.time = done ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    saveFileData(db);
    return res.json({ success: true, checklist: list });
  } catch (error) {
    console.error("[DB] Checklist update failed:", error.message);
    return res.status(503).json({ error: "Checklist update could not be saved." });
  }
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

      // PostgreSQL Production: receipt, recipe stock depletion and KDS tickets
      // commit together. A failure leaves the event unacknowledged for safe retry.
      if (isVercel && !pgPool) {
        return res.status(503).json({
          success: false,
          error: "Persistent POS storage is unavailable; receipt was not acknowledged.",
          acknowledgedIds
        });
      }

      if (pgPool) {
        try {
          await createPosSaleAtomically(pgPool, receipt);
        } catch (error) {
          console.error("[CloudSync] Atomic POS sale failed:", error.message);
          const insufficient = error instanceof InsufficientStockError || error.code === "INSUFFICIENT_STOCK";
          return res.status(insufficient ? 409 : 503).json({
            success: false,
            error: insufficient ? "Insufficient ingredient stock; sale was not committed." : "POS sale could not be committed; retry is safe.",
            ...(insufficient ? { ingredient: error.ingredientName, required: error.required, available: error.available } : {}),
            acknowledgedIds
          });
        }
      }

      // Keep the local development fallback, but never use it as Production storage.
      const existingIdx = db.receipts.findIndex(r => r.id === receipt.id);
      if (existingIdx >= 0) db.receipts[existingIdx] = receipt;
      else db.receipts.unshift(receipt);

      if (!pgPool && !receipt.isRefund) {
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
async function listReceiptsForApi() {
  await initPgTables();
  if (pgPool) {
    const result = await pgPool.query(`
      SELECT id, timestamp, subtotal, tax_rate, tax_amount, grand_total,
             employee_name, customer_name, ticket_note, is_refund,
             original_receipt_id, payments, items
      FROM receipts
      ORDER BY timestamp DESC
    `);
    return result.rows.map(row => ({
      id: row.id,
      timestamp: Number(row.timestamp),
      subtotal: Number(row.subtotal),
      taxRate: Number(row.tax_rate),
      taxAmount: Number(row.tax_amount),
      grandTotal: Number(row.grand_total),
      employeeName: row.employee_name || "Cashier",
      customerName: row.customer_name || null,
      ticketNote: row.ticket_note || null,
      isRefund: Boolean(row.is_refund),
      originalReceiptId: row.original_receipt_id || null,
      payments: typeof row.payments === "string" ? JSON.parse(row.payments) : (row.payments || []),
      items: typeof row.items === "string" ? JSON.parse(row.items) : (row.items || [])
    }));
  }
  if (isVercel) throw new Error("Persistent receipt storage is unavailable.");
  const db = loadFileData();
  return [...(db.receipts || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

app.get('/api/receipts', async (req, res) => {
  try {
    res.json(await listReceiptsForApi());
  } catch (error) {
    console.error("[Receipts] PostgreSQL read failed:", error.message);
    res.status(503).json({ error: "Receipt history is temporarily unavailable." });
  }
});

app.get('/api/export/receipts', async (req, res) => {
  try {
    const receipts = await listReceiptsForApi();
    let csv = "Receipt ID,Timestamp,Date,Employee,Customer,Subtotal,Tax,Grand Total,Payment Methods,Items Summary,Is Refund\\n";
    receipts.forEach(r => {
      const timestamp = Number(r.timestamp) || 0;
      const date = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
      const paymentsStr = Array.isArray(r.payments) ? r.payments.map(p => `${p.type}: ${p.amount}`).join(" | ") : "";
      const itemsStr = Array.isArray(r.items) ? r.items.map(i => `${i.name || i.itemName || i.itemId || "Item"} (x${i.quantity || 1})`).join(" ; ") : "";
      csv += [
        r.id, timestamp, date, r.employeeName, r.customerName,
        r.subtotal, r.taxAmount, r.grandTotal, paymentsStr, itemsStr,
        r.isRefund ? "YES" : "NO"
      ].map(csvEscape).join(",") + "\\n";
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="openpos_receipts_export.csv"');
    res.send(csv);
  } catch (error) {
    console.error("[Receipts] PostgreSQL export failed:", error.message);
    res.status(503).json({ error: "Receipt export is temporarily unavailable." });
  }
});

app.get('/api/export/items', async (req, res) => {
  await initPgTables();
  let items;
  try {
    if (pgPool) items = await listPgItems();
    else if (isVercel) return res.status(503).json({ error: "Persistent catalog export is unavailable." });
    else items = loadFileData().items || [];
  } catch (error) {
    console.error("[Catalog] Item export failed:", error.message);
    return res.status(503).json({ error: "Catalog export is temporarily unavailable." });
  }
  const csvEscape = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  let csv = "Item ID,Name,Price,Category,Barcode,Stock Quantity,Prep Station,Prep Time Minutes\\n";
  items.forEach(item => {
    csv += [
      csvEscape(item.id), csvEscape(item.name), Number(item.price) || 0,
      csvEscape(item.categoryId || ""), csvEscape(item.barcode || ""),
      Number(item.stockQuantity) || 0, csvEscape(item.station || ""),
      Number(item.prepTimeMinutes) || 0
    ].join(",") + "\\n";
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="openpos_catalog_export.csv"');
  return res.send(csv);
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
  try { await logAudit("STORE_RESET_EXECUTED", { reason: "Admin requested full reset" }, req); } catch (error) { console.error("[Audit] Reset audit write failed:", error.message); }

  res.json({ success: true, message: "All cloud store data reset to clean restaurant default template." });
});

module.exports = app;
