const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateBulkUpdatePayload,
  bulkUpdateItemsPg,
  mergeStoreSettings,
  sanitizePublicStoreInfo
} = require("../api/lib/catalog-repository");

test("validateBulkUpdatePayload requires non-empty ids and categoryId or station", () => {
  assert.equal(validateBulkUpdatePayload({}).valid, false);
  assert.equal(validateBulkUpdatePayload({ ids: ["item_1"] }).valid, false);
  assert.equal(validateBulkUpdatePayload({ ids: ["item_1"], station: "INVALID" }).valid, false);

  const ok = validateBulkUpdatePayload({
    ids: ["item_1", "item_1", " item_2 "],
    categoryId: "cat_coffee",
    station: "COFFEE_BAR"
  });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.ids, ["item_1", "item_2"]);
  assert.equal(ok.categoryId, "cat_coffee");
  assert.equal(ok.station, "COFFEE_BAR");
});

test("bulkUpdateItemsPg executes parameterized PostgreSQL UPDATE and maps rows", async () => {
  const queries = [];
  const fakePool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rows: [
          {
            id: "item_1",
            name: "Artisan Cappuccino",
            price: "4.50",
            category_id: "cat_coffee",
            barcode: "1001",
            color: -16744448,
            stock_quantity: 9,
            station: "COFFEE_BAR",
            prep_time_minutes: 3,
            price_variants: "[]"
          }
        ]
      };
    }
  };

  const updated = await bulkUpdateItemsPg(fakePool, {
    ids: ["item_1"],
    categoryId: "cat_coffee",
    station: "COFFEE_BAR"
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE public\.items/);
  assert.match(queries[0].sql, /category_id = \$2/);
  assert.match(queries[0].sql, /station = \$3/);
  assert.deepEqual(queries[0].params[0], ["item_1"]);
  assert.equal(queries[0].params[1], "cat_coffee");
  assert.equal(queries[0].params[2], "COFFEE_BAR");
  assert.equal(updated[0].categoryId, "cat_coffee");
  assert.equal(updated[0].station, "COFFEE_BAR");
  assert.equal(updated[0].stockQuantity, 9);
});

test("mergeStoreSettings validates and preserves existing settings", () => {
  const invalidTax = mergeStoreSettings({}, { taxRate: 150 });
  assert.equal(invalidTax.valid, false);

  const invalidThreshold = mergeStoreSettings({}, { lowStockThreshold: -5 });
  assert.equal(invalidThreshold.valid, false);

  const invalidEmail = mergeStoreSettings({}, { supportEmail: "not-an-email" });
  assert.equal(invalidEmail.valid, false);

  const merged = mergeStoreSettings(
    { name: "Artisan Cafe", currency: "$", taxRate: 17, apiKey: "secret-key" },
    {
      lowStockThreshold: 12,
      acceptOnlineOrders: false,
      defaultPrepTimeMinutes: 20,
      phone: "+1-555-0100",
      businessHours: "08:00 - 21:00",
      receiptFooter: "See you soon!"
    }
  );
  assert.equal(merged.valid, true);
  assert.equal(merged.settings.name, "Artisan Cafe");
  assert.equal(merged.settings.lowStockThreshold, 12);
  assert.equal(merged.settings.acceptOnlineOrders, false);
  assert.equal(merged.settings.defaultPrepTimeMinutes, 20);

  const sanitized = sanitizePublicStoreInfo(merged.settings);
  assert.equal("apiKey" in sanitized, false);
  assert.equal(sanitized.lowStockThreshold, 12);
  assert.equal(sanitized.acceptOnlineOrders, false);
});
