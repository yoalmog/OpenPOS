const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOnlineOrderItems } = require("../api/lib/online-order-catalog");

test("uses PostgreSQL catalog price and name, ignoring client-supplied price", async () => {
  const calls = [];
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ id: "item-real", name: "Real Coffee", price: "7.25" }] };
  }};
  const result = await buildOnlineOrderItems({
    pool,
    requestedItems: [{ itemId: "item-real", quantity: 2, price: 0.01, name: "Forged name" }]
  });
  assert.deepEqual(result, [{
    itemId: "item-real", name: "Real Coffee", quantity: 2, price: 7.25, notes: ""
  }]);
  assert.deepEqual(calls[0].values, [["item-real"]]);
  assert.match(calls[0].sql, /FROM items WHERE id = ANY/);
});

test("rejects item IDs missing from PostgreSQL", async () => {
  const pool = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    buildOnlineOrderItems({ pool, requestedItems: [{ itemId: "missing", quantity: 1 }] }),
    { code: "INVALID_ORDER_ITEM" }
  );
});

test("rejects invalid quantities before querying PostgreSQL", async () => {
  let queried = false;
  const pool = { query: async () => { queried = true; return { rows: [] }; } };
  await assert.rejects(
    buildOnlineOrderItems({ pool, requestedItems: [{ itemId: "item-real", quantity: 0 }] }),
    { code: "INVALID_ORDER_ITEM" }
  );
  assert.equal(queried, false);
});

test("local development fallback also uses catalog price, not client price", async () => {
  const result = await buildOnlineOrderItems({
    requestedItems: [{ itemId: "item-local", quantity: 1, price: 999 }],
    localCatalog: [{ id: "item-local", name: "Local Item", price: 3.5 }]
  });
  assert.equal(result[0].price, 3.5);
});

test("rejects missing items even when a client submits a price", async () => {
  await assert.rejects(
    buildOnlineOrderItems({
      pool: { query: async () => ({ rows: [] }) },
      requestedItems: [{ itemId: "deleted", quantity: 1, price: 0 }]
    }),
    { code: "INVALID_ORDER_ITEM" }
  );
});
