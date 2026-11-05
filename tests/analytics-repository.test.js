const test = require("node:test");
const assert = require("node:assert/strict");
const { listReceipts, getHourlyReceiptCounts } = require("../api/lib/analytics-repository");

function mockPool(rows) {
  return { calls: [], async query(sql, params) {
    this.calls.push({ sql, params });
    return { rows };
  } };
}

test("listReceipts maps PostgreSQL rows into the API receipt shape", async () => {
  const pool = mockPool([{
    id: "r-1", timestamp: "1000", subtotal: "10", tax_rate: "0.1",
    tax_amount: "1", grand_total: "11", employee_name: "Alex",
    customer_name: null, ticket_note: null, is_refund: false,
    original_receipt_id: null, payments: '[{"type":"CASH","amount":11}]',
    items: '[{"name":"Coffee","quantity":1}]'
  }]);
  const rows = await listReceipts(pool, { from: 500, to: 1500 });
  assert.equal(rows[0].grandTotal, 11);
  assert.equal(rows[0].timestamp, 1000);
  assert.equal(rows[0].payments[0].amount, 11);
  assert.equal(rows[0].items[0].name, "Coffee");
  assert.deepEqual(pool.calls[0].params, [500, 1500]);
  assert.match(pool.calls[0].sql, /timestamp >= \$1 AND timestamp <= \$2/);
});

test("listReceipts can query all receipts without a date filter", async () => {
  const pool = mockPool([]);
  assert.deepEqual(await listReceipts(pool), []);
  assert.deepEqual(pool.calls[0].params, []);
  assert.doesNotMatch(pool.calls[0].sql, /WHERE/);
});

test("getHourlyReceiptCounts returns only observed hourly counts", async () => {
  const pool = mockPool([{ hour: 9, orders: 4 }, { hour: 13, orders: 7 }]);
  assert.deepEqual(await getHourlyReceiptCounts(pool, 123), [
    { hour: 9, orders: 4 }, { hour: 13, orders: 7 }
  ]);
  assert.deepEqual(pool.calls[0].params, [123]);
  assert.match(pool.calls[0].sql, /is_refund = FALSE/);
});
