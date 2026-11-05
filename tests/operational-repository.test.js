const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureOperationalTables,
  getStoreSettings,
  saveStoreSettings,
  listOperationalRecords,
  upsertOperationalRecord,
  deleteOperationalRecord
} = require("../api/lib/operational-repository");

function mockPool(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [], rowCount: 0 };
    }
  };
}

test("operational schema creates durable records and an ordered lookup index", async () => {
  const pool = mockPool();
  await ensureOperationalTables(pool);
  assert.match(pool.calls[0].sql, /CREATE TABLE IF NOT EXISTS operational_records/);
  assert.match(pool.calls[0].sql, /PRIMARY KEY \(collection, record_id\)/);
  assert.match(pool.calls[0].sql, /CREATE INDEX IF NOT EXISTS idx_operational_records_collection_created/);
});

test("store settings are absent until explicitly saved; no sample settings are seeded", async () => {
  const pool = mockPool(() => ({ rows: [], rowCount: 0 }));
  assert.equal(await getStoreSettings(pool), null);
  assert.deepEqual(pool.calls[0].params, ["storeInfo"]);
});

test("store settings are saved as JSONB and returned from PostgreSQL", async () => {
  const settings = { name: "My real store", currency: "PEN", taxRate: 18 };
  const pool = mockPool((_sql, params) => ({
    rows: [{ value: JSON.parse(params[1]) }],
    rowCount: 1
  }));
  assert.deepEqual(await saveStoreSettings(pool, settings), settings);
  assert.deepEqual(JSON.parse(pool.calls[0].params[1]), settings);
});

test("operational collections are allowlisted and list from PostgreSQL", async () => {
  const record = { id: "w-1", name: "Milk", timestamp: 100 };
  const pool = mockPool(() => ({ rows: [{ record }], rowCount: 1 }));
  assert.deepEqual(await listOperationalRecords(pool, "waste_logs", 25), [record]);
  assert.deepEqual(pool.calls[0].params, ["waste_logs", 25]);
  await assert.rejects(
    () => listOperationalRecords(pool, "items"),
    /Unsupported operational collection/
  );
});

test("operational records require an id and upsert using parameterized SQL", async () => {
  const record = { id: "temp-1", unitName: "Cooler", timestamp: 123 };
  const pool = mockPool((_sql, params) => ({
    rows: [{ record: JSON.parse(params[2]) }],
    rowCount: 1
  }));
  assert.deepEqual(await upsertOperationalRecord(pool, "temperature_logs", record), record);
  assert.deepEqual(pool.calls[0].params.slice(0, 4), [
    "temperature_logs", "temp-1", JSON.stringify(record), 123
  ]);
  await assert.rejects(
    () => upsertOperationalRecord(pool, "checklists", { title: "No id" }),
    /non-empty id/
  );
});

test("operational records can be deleted by collection and id", async () => {
  const pool = mockPool(() => ({ rows: [], rowCount: 1 }));
  assert.equal(await deleteOperationalRecord(pool, "checklists", "opening"), true);
  assert.deepEqual(pool.calls[0].params, ["checklists", "opening"]);
});
