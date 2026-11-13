const test = require("node:test");
const assert = require("node:assert/strict");
const { buildIngredientStockHistory } = require("../api/lib/ingredient-history");

test("buildIngredientStockHistory reconstructs 30-day stock curve from audit, waste, and sales", () => {
  const now = Date.UTC(2026, 10, 13, 15, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  const ingredient = {
    id: "ing_milk",
    name: "Whole Milk",
    unit: "ml",
    currentStock: 8500,
    minThreshold: 2000
  };

  const auditLogs = [
    {
      id: "audit_1",
      action: "INGREDIENT_STOCK_ADJUSTED",
      timestamp: now - 2 * dayMs,
      details: {
        ingredientId: "ing_milk",
        ingredient: "Whole Milk",
        previousStock: 7000,
        delta: 2000,
        newStock: 9000,
        reason: "Supplier Delivery"
      }
    }
  ];

  const wasteLogs = [
    {
      id: "waste_1",
      itemOrIngredientId: "ing_milk",
      name: "Whole Milk",
      quantity: 500,
      reason: "EXPIRED",
      timestamp: now - 5 * dayMs
    }
  ];

  const recipes = [
    {
      itemId: "item_latte",
      itemName: "Caffe Latte",
      ingredients: [{ ingredientId: "ing_milk", name: "Whole Milk", quantity: 250, unit: "ml" }]
    }
  ];

  const receipts = [
    {
      id: "REC-1",
      timestamp: now - 1 * dayMs,
      isRefund: false,
      items: [{ itemId: "item_latte", name: "Caffe Latte", quantity: 2 }]
    },
    {
      id: "REC-REFUND",
      timestamp: now - 1 * dayMs,
      isRefund: true,
      items: [{ itemId: "item_latte", name: "Caffe Latte", quantity: 1 }]
    }
  ];

  const history = buildIngredientStockHistory({
    ingredient,
    auditLogs,
    wasteLogs,
    receipts,
    recipes,
    days: 30,
    now
  });

  assert.equal(history.days, 30);
  assert.equal(history.series.length, 30);
  assert.equal(history.summary.periodStartStock, 7500);
  assert.equal(history.summary.currentStock, 8500);
  assert.equal(history.summary.minObserved, 7000);
  assert.equal(history.summary.maxObserved, 9000);
  assert.equal(history.summary.totalMovements, 3);
  assert.equal(history.series[29].stockLevel, 8500);
  assert.equal(history.series[27].stockLevel, 9000);
  assert.equal(history.series[24].stockLevel, 7000);
});

test("buildIngredientStockHistory returns flat current stock when no movements occurred", () => {
  const now = Date.UTC(2026, 10, 13, 15, 0, 0);
  const ingredient = {
    id: "ing_beans",
    name: "Espresso Beans",
    unit: "g",
    currentStock: 4200,
    minThreshold: 1000
  };

  const history = buildIngredientStockHistory({
    ingredient,
    auditLogs: [],
    wasteLogs: [],
    receipts: [],
    recipes: [],
    days: 30,
    now
  });

  assert.equal(history.series.length, 30);
  assert.equal(history.summary.totalMovements, 0);
  assert.ok(history.series.every(point => point.stockLevel === 4200));
});
