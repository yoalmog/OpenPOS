function ingredientFromRow(row) {
  return {
    id: row.id, name: row.name, unit: row.unit,
    unitCost: Number(row.unit_cost),
    currentStock: Number(row.current_stock || 0),
    minThreshold: Number(row.min_threshold || 0)
  };
}

function recipeFromRow(row) {
  let ingredients = row.ingredients;
  if (typeof ingredients === "string") ingredients = JSON.parse(ingredients);
  return {
    itemId: row.item_id, itemName: row.item_name, station: row.station || "HOT_KITCHEN",
    prepTimeMinutes: Number(row.prep_time_minutes || 5),
    laborCost: Number(row.labor_cost || 0), allergens: row.allergens || "",
    instructions: row.instructions || "", ingredients: Array.isArray(ingredients) ? ingredients : []
  };
}

async function listIngredients(pool) {
  const result = await pool.query(
    "SELECT id, name, unit, unit_cost, current_stock, min_threshold FROM ingredients ORDER BY name"
  );
  return result.rows.map(ingredientFromRow);
}

async function saveIngredient(pool, ingredient) {
  const result = await pool.query(
    `INSERT INTO ingredients (id, name, unit, unit_cost, current_stock, min_threshold, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, unit=EXCLUDED.unit,
       unit_cost=EXCLUDED.unit_cost, current_stock=EXCLUDED.current_stock,
       min_threshold=EXCLUDED.min_threshold, updated_at=EXCLUDED.updated_at
     RETURNING id, name, unit, unit_cost, current_stock, min_threshold`,
    [ingredient.id, ingredient.name, ingredient.unit, ingredient.unitCost,
      ingredient.currentStock, ingredient.minThreshold, Date.now()]
  );
  return ingredientFromRow(result.rows[0]);
}

async function updateIngredientStock(pool, id, update) {
  const result = update.newStock !== undefined
    ? await pool.query(
        `UPDATE ingredients SET current_stock=$2, updated_at=$3
         WHERE id=$1 RETURNING id, name, unit, unit_cost, current_stock, min_threshold`,
        [id, Number(update.newStock), Date.now()]
      )
    : await pool.query(
        `UPDATE ingredients SET current_stock=GREATEST(0, current_stock + $2), updated_at=$3
         WHERE id=$1 RETURNING id, name, unit, unit_cost, current_stock, min_threshold`,
        [id, Number(update.change), Date.now()]
      );
  return result.rowCount ? ingredientFromRow(result.rows[0]) : null;
}

async function listRecipes(pool) {
  const result = await pool.query(
    "SELECT item_id, item_name, station, prep_time_minutes, ingredients, labor_cost, allergens, instructions FROM recipes ORDER BY item_name"
  );
  return result.rows.map(recipeFromRow);
}

async function saveRecipe(pool, recipe) {
  const result = await pool.query(
    `INSERT INTO recipes
      (item_id, item_name, station, prep_time_minutes, ingredients, labor_cost, allergens, instructions, updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
     ON CONFLICT (item_id) DO UPDATE SET item_name=EXCLUDED.item_name,
       station=EXCLUDED.station, prep_time_minutes=EXCLUDED.prep_time_minutes,
       ingredients=EXCLUDED.ingredients, labor_cost=EXCLUDED.labor_cost,
       allergens=EXCLUDED.allergens, instructions=EXCLUDED.instructions, updated_at=EXCLUDED.updated_at
     RETURNING item_id, item_name, station, prep_time_minutes, ingredients, labor_cost, allergens, instructions`,
    [recipe.itemId, recipe.itemName, recipe.station, recipe.prepTimeMinutes,
      JSON.stringify(recipe.ingredients), recipe.laborCost, recipe.allergens, recipe.instructions, Date.now()]
  );
  return recipeFromRow(result.rows[0]);
}

module.exports = { listIngredients, saveIngredient, updateIngredientStock, listRecipes, saveRecipe };
