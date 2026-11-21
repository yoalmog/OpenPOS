const test = require("node:test");
const assert = require("node:assert/strict");
const { buildKitchenTicketsForOrder } = require("../lib/online-order-kds");

test("routes online order items to recipe stations and groups by station", () => {
  const tickets = buildKitchenTicketsForOrder({
    id: "order-1",
    orderNumber: "W-123",
    channel: "WEB",
    tableNumber: "TAKEAWAY",
    customerName: "Test Guest",
    items: [
      { itemId: "coffee", name: "Coffee", quantity: 2, notes: "Oat milk" },
      { itemId: "toast", name: "Toast", quantity: 1 }
    ]
  }, {
    now: 1000,
    recipes: [
      { itemId: "coffee", station: "COFFEE_BAR", prepTimeMinutes: 3 },
      { itemId: "toast", station: "HOT_KITCHEN", prepTimeMinutes: 7 }
    ],
    items: [
      { id: "coffee", name: "Coffee", station: "OTHER" },
      { id: "toast", name: "Toast", station: "OTHER" }
    ]
  });

  assert.equal(tickets.length, 2);
  assert.deepEqual(tickets.map((ticket) => ticket.station).sort(), ["COFFEE_BAR", "HOT_KITCHEN"]);
  const coffeeTicket = tickets.find((ticket) => ticket.station === "COFFEE_BAR");
  assert.equal(coffeeTicket.items[0].quantity, 2);
  assert.equal(coffeeTicket.items[0].notes, "Oat milk");
  assert.equal(coffeeTicket.status, "PENDING");
  assert.equal(coffeeTicket.targetReadyAt, 1000 + 3 * 60 * 1000);
});

test("falls back to catalog station and safe default station when recipe is absent", () => {
  const tickets = buildKitchenTicketsForOrder({
    id: "order-2",
    items: [
      { itemId: "catalog-item", name: "Catalog item", quantity: 1 },
      { itemId: "unknown", name: "Unknown", quantity: 1 }
    ]
  }, {
    now: 2000,
    items: [{ id: "catalog-item", name: "Catalog item", station: "DESSERTS", prepTimeMinutes: 4 }]
  });

  assert.deepEqual(tickets.map((ticket) => ticket.station).sort(), ["DESSERTS", "HOT_KITCHEN"]);
});

test("does not mutate inventory or create payment/receipt records", () => {
  const inventory = [{ id: "milk", currentStock: 500 }];
  const order = {
    id: "order-3",
    paymentStatus: "UNPAID",
    items: [{ itemId: "latte", name: "Latte", quantity: 1 }]
  };
  const tickets = buildKitchenTicketsForOrder(order, {
    now: 3000,
    recipes: [{ itemId: "latte", station: "COFFEE_BAR", ingredients: [{ ingredientId: "milk", quantity: 200 }] }],
    items: [{ id: "latte", name: "Latte" }]
  });

  assert.equal(inventory[0].currentStock, 500);
  assert.equal(order.paymentStatus, "UNPAID");
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].status, "PENDING");
});
