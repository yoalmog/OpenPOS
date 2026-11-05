const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createOnlineOrderWithTickets,
  createKitchenTicket,
  listOnlineOrders,
  listKitchenTickets,
  updateOnlineOrderStatus,
  updateKitchenTicketStatus
} = require("../api/lib/order-repository");

function fakePool({ failOn } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) throw new Error("simulated database failure");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  return {
    calls,
    async connect() { return client; },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT") && sql.includes("online_orders")) {
        return { rows: [{ order_data: { id: "o1", status: "RECEIVED" } }] };
      }
      if (sql.startsWith("SELECT") && sql.includes("kitchen_orders")) {
        return { rows: [{ ticket_data: { id: "t1", station: "HOT" } }] };
      }
      return { rows: [{ order_data: { id: "o1", status: values[1] }, ticket_data: { id: "t1", status: values[1] } }], rowCount: 1 };
    }
  };
}

const order = {
  id: "o1", orderNumber: "W-123", channel: "WEB_STOREFRONT",
  deliveryType: "TAKEAWAY", customerName: "Test", customerPhone: "",
  pickupTime: "ASAP", subtotal: 10, tax: 1.7, total: 11.7,
  paymentMethod: "PAY_ON_PICKUP", paymentStatus: "UNPAID",
  status: "RECEIVED", items: [{ itemId: "i1", quantity: 1 }],
  createdAt: 123
};
const tickets = [{
  id: "t1", receiptId: "o1", orderNumber: "W-123", channel: "WEB",
  tableNumber: "TAKEAWAY", customerName: "Test", station: "HOT",
  items: [{ name: "Dish", quantity: 1 }], status: "PENDING",
  createdAt: 123, targetReadyAt: 456, completedAt: null
}];

test("writes order and KDS ticket in one transaction without payment or inventory writes", async () => {
  const pool = fakePool();
  await createOnlineOrderWithTickets(pool, order, tickets);
  const sql = pool.calls.map(call => call.sql);
  assert.equal(sql[0], "BEGIN");
  assert.ok(sql.some(q => q.includes("INSERT INTO online_orders")));
  assert.ok(sql.some(q => q.includes("INSERT INTO kitchen_orders")));
  assert.equal(sql.at(-2), "COMMIT");
  assert.ok(!sql.some(q => /receipts|ingredients|inventory/i.test(q)));
  assert.equal(order.paymentStatus, "UNPAID");
  assert.equal(order.paymentMethod, "PAY_ON_PICKUP");
});

test("rolls back both writes when KDS ticket insertion fails", async () => {
  const pool = fakePool({ failOn: "INSERT INTO kitchen_orders" });
  await assert.rejects(
    createOnlineOrderWithTickets(pool, order, tickets),
    /simulated database failure/
  );
  const sql = pool.calls.map(call => call.sql);
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
  assert.ok(sql.includes("RELEASE"));
});

test("persists standalone KDS tickets", async () => {
  const pool = fakePool();
  await createKitchenTicket(pool, tickets[0]);
  assert.ok(pool.calls.some(call => call.sql.includes("INSERT INTO kitchen_orders")));
});

test("reads persisted online orders and KDS tickets", async () => {
  const pool = fakePool();
  assert.deepEqual(await listOnlineOrders(pool), [{ id: "o1", status: "RECEIVED" }]);
  assert.deepEqual(await listKitchenTickets(pool, { station: "HOT" }), [{ id: "t1", station: "HOT" }]);
});

test("persists order and ticket status changes", async () => {
  const pool = fakePool();
  assert.deepEqual(await updateOnlineOrderStatus(pool, "o1", "PREPARING"), { id: "o1", status: "PREPARING" });
  assert.deepEqual(await updateKitchenTicketStatus(pool, "t1", "READY", 999), { id: "t1", status: "READY" });
});
