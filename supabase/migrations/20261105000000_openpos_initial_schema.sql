-- OpenPOS baseline schema migration.
-- This migration is executed with the database migration/admin connection.
-- Runtime Worker credentials must never have DDL privileges.
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

CREATE TABLE IF NOT EXISTS operational_records (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (collection, record_id)
);
CREATE INDEX IF NOT EXISTS idx_operational_records_collection_created
  ON operational_records (collection, created_at DESC);

