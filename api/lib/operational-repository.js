const ALLOWED_COLLECTIONS = new Set([
  "waste_logs",
  "temperature_logs",
  "checklists",
  "audit_logs"
]);

function assertCollection(collection) {
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Unsupported operational collection: ${collection}`);
  }
}

function parseJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

async function ensureOperationalTables(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  await pool.query(`
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
  `);
}

async function getStoreSettings(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  const result = await pool.query(
    "SELECT value FROM store_settings WHERE key = $1",
    ["storeInfo"]
  );
  if (!result.rowCount) return null;
  return parseJson(result.rows[0].value);
}

async function saveStoreSettings(pool, settings) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("Store settings must be an object.");
  }
  const result = await pool.query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
     RETURNING value`,
    ["storeInfo", JSON.stringify(settings), Date.now()]
  );
  return parseJson(result.rows[0].value);
}

async function listOperationalRecords(pool, collection, limit = 500) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  assertCollection(collection);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
  const result = await pool.query(
    `SELECT record
       FROM operational_records
      WHERE collection = $1
      ORDER BY created_at DESC, record_id ASC
      LIMIT $2`,
    [collection, safeLimit]
  );
  return result.rows.map(row => parseJson(row.record));
}

async function upsertOperationalRecord(pool, collection, record) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  assertCollection(collection);
  if (!record || typeof record !== "object" || Array.isArray(record) ||
      record.id === undefined || record.id === null || String(record.id).trim() === "") {
    throw new Error("An operational record with a non-empty id is required.");
  }
  const now = Date.now();
  const createdAt = Number(record.timestamp || record.createdAt || now);
  const result = await pool.query(
    `INSERT INTO operational_records
       (collection, record_id, record, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (collection, record_id) DO UPDATE
       SET record = EXCLUDED.record, updated_at = EXCLUDED.updated_at
     RETURNING record`,
    [collection, String(record.id), JSON.stringify(record), createdAt, now]
  );
  return parseJson(result.rows[0].record);
}

async function deleteOperationalRecord(pool, collection, recordId) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  assertCollection(collection);
  const result = await pool.query(
    "DELETE FROM operational_records WHERE collection = $1 AND record_id = $2",
    [collection, String(recordId)]
  );
  return result.rowCount > 0;
}

module.exports = {
  ensureOperationalTables,
  getStoreSettings,
  saveStoreSettings,
  listOperationalRecords,
  upsertOperationalRecord,
  deleteOperationalRecord
};
