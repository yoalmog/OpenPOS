const test = require("node:test");
const assert = require("node:assert/strict");
const { listIngredients, saveIngredient, updateIngredientStock, listRecipes, saveRecipe } = require("../api/lib/recipe-repository");

function fakePool(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT") && sql.includes("FROM ingredients")) {
        return { rows: [{ id: "ing1", name: "Coffee", unit: "g", unit_cost: "0.04", current_stock: "500", min_threshold: "50" }] };
      }
      if (sql.startsWith("SELECT") && sql.includes("FROM recipes")) {
        return { rows: [{ item_id: "item1", item_name: "Coffee", station: "BAR", prep_time_minutes: 3, ingredients: [{ ingredientId: "ing1", name: "Coffee", quantity: 18, unit: "g" }], labor_cost: "0.5", allergens: "", instructions: "" }] };
      }
      if (sql.includes("RETURNING") && sql.includes("ingredients")) {
        return { rowCount: 1, rows: [{ id: values[0], name: "Coffee", unit: "g", unit_cost: "0.04", current_stock: sql.includes("GREATEST") ? "450" : String(values[1] ?? 500), min_threshold: "50" }] };
      }
      if (sql.includes("RETURNING") && sql.includes("recipes")) {
        return { rowCount: 1, rows: [{ item_id: "item1", item_name: "Coffee", station: "BAR", prep_time_minutes: 3, ingredients: JSON.parse(values[4]), labor_cost: String(values[5]), allergens: values[6], instructions: values[7] }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
}

test("maps PostgreSQL ingredient numeric columns to camelCase API fields", async () => {
  const result = await listIngredients(fakePool());
  assert.deepEqual(result[0], { id: "ing1", name: "Coffee", unit: "g", unitCost: 0.04, currentStock: 500, minThreshold: 50 });
});

test("saves an ingredient with an upsert", async () => {
  const pool = fakePool();
  await saveIngredient(pool, { id: "ing1", name: "Coffee", unit: "g", unitCost: 0.04, currentStock: 500, minThreshold: 50 });
  assert.match(pool.calls[0].sql, /ON CONFLICT \(id\) DO UPDATE/);
});

test("applies stock deltas atomically in one SQL UPDATE", async () => {
  const pool = fakePool();
  await updateIngredientStock(pool, "ing1", { change: -50 });
  assert.match(pool.calls[0].sql, /GREATEST\(0, current_stock \+ \$2\)/);
  assert.equal(pool.calls.length, 1);
});

test("saves and reads recipes as JSONB", async () => {
  const pool = fakePool();
  const recipe = { itemId: "item1", itemName: "Coffee", station: "BAR", prepTimeMinutes: 3, laborCost: 0.5, allergens: "", instructions: "", ingredients: [{ ingredientId: "ing1", quantity: 18, unit: "g" }] };
  await saveRecipe(pool, recipe);
  assert.match(pool.calls[0].sql, /\$5::jsonb/);
  const listed = await listRecipes(pool);
  assert.equal(listed[0].itemId, "item1");
  assert.equal(listed[0].ingredients[0].ingredientId, "ing1");
});
