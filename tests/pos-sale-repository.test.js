const test = require("node:test");
const assert = require("node:assert/strict");
const { createPosSaleAtomically, InsufficientStockError } = require("../api/lib/pos-sale-repository");

function fakePool({ duplicate = false, stock = 100 } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (sql.includes("INSERT INTO receipts")) {
        return { rowCount: duplicate ? 0 : 1, rows: duplicate ? [] : [{ id: "r-1" }] };
      }
      if (sql.includes("FROM items")) {
        return { rowCount: 1, rows: [{ id: "item-1", name: "Coffee", station: "BAR", prep_time_minutes: 3 }] };
      }
      if (sql.includes("FROM recipes")) {
        return { rowCount: 1, rows: [{
          item_id: "item-1", item_name: "Coffee", station: "BAR", prep_time_minutes: 3,
          ingredients: [{ ingredientId: "ing-1", name: "Beans", quantity: 10, unit: "g" }]
        }] };
      }
      if (sql.includes("FROM ingredients") && sql.includes("FOR UPDATE")) {
        return { rowCount: 1, rows: [{ id: "ing-1", name: "Beans", current_stock: String(stock) }] };
      }
      if (sql.startsWith("UPDATE ingredients")) {
        return { rowCount: 1, rows: [{ id: "ing-1", name: "Beans", current_stock: String(stock - values[1]) }] };
      }
      if (sql.includes("INSERT INTO kitchen_orders")) return { rowCount: 1, rows: [] };
      throw new Error("Unexpected SQL: " + sql);
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  return { calls, async connect() { return client; } };
}

const receipt = {
  id: "r-1", timestamp: 1000, subtotal: 20, taxRate: 0.17, taxAmount: 3.4,
  grandTotal: 23.4, employeeName: "Cashier", customerName: "Guest",
  ticketNote: null, isRefund: false, originalReceiptId: null, payments: [{ type: "CASH", amount: 23.4 }],
  items: [{ itemId: "item-1", name: "Coffee", quantity: 2 }]
};

test("commits receipt, ingredient depletion and KDS ticket in one transaction", async () => {
  const pool = fakePool({ stock: 100 });
  const result = await createPosSaleAtomically(pool, receipt);
  assert.equal(result.duplicate, false);
  assert.equal(result.depletedIngredients[0].used, 20);
  assert.equal(result.depletedIngredients[0].remaining, 80);
  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0].id, "ticket_r-1_BAR");
  assert.equal(pool.calls[0].sql, "BEGIN");
  assert.equal(pool.calls.at(-2).sql, "COMMIT");
  assert.equal(pool.calls.at(-1).sql, "RELEASE");
});

test("does not repeat stock depletion or KDS tickets for duplicate receipt ids", async () => {
  const pool = fakePool({ duplicate: true });
  const result = await createPosSaleAtomically(pool, receipt);
  assert.equal(result.duplicate, true);
  assert.equal(pool.calls.filter(call => call.sql.startsWith("UPDATE ingredients")).length, 0);
  assert.equal(pool.calls.filter(call => call.sql.includes("INSERT INTO kitchen_orders")).length, 0);
  assert.equal(pool.calls.at(-2).sql, "COMMIT");
});

test("rolls back receipt and all sale effects when stock is insufficient", async () => {
  const pool = fakePool({ stock: 10 });
  await assert.rejects(
    createPosSaleAtomically(pool, receipt),
    error => error instanceof InsufficientStockError && error.code === "INSUFFICIENT_STOCK"
  );
  assert.equal(pool.calls.filter(call => call.sql.startsWith("UPDATE ingredients")).length, 0);
  assert.equal(pool.calls.some(call => call.sql === "ROLLBACK"), true);
  assert.equal(pool.calls.some(call => call.sql === "COMMIT"), false);
});

test("records refunds without depleting stock or creating KDS tickets", async () => {
  const pool = fakePool();
  const result = await createPosSaleAtomically(pool, { ...receipt, isRefund: true });
  assert.deepEqual(result.tickets, []);
  assert.deepEqual(result.depletedIngredients, []);
  assert.equal(pool.calls.filter(call => call.sql.includes("FROM ingredients")).length, 0);
  assert.equal(pool.calls.filter(call => call.sql.includes("INSERT INTO kitchen_orders")).length, 0);
});
