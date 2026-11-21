class InsufficientStockError extends Error {
  constructor(ingredientName, required, available) {
    super(`Insufficient stock for ${ingredientName}: required ${required}, available ${available}`);
    this.name = "InsufficientStockError";
    this.code = "INSUFFICIENT_STOCK";
    this.ingredientName = ingredientName;
    this.required = required;
    this.available = available;
  }
}

async function createPosSaleAtomically(pool, receipt) {
  if (!pool || !receipt || !receipt.id) throw new Error("A PostgreSQL pool and receipt id are required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO receipts (
        id, timestamp, subtotal, tax_rate, tax_amount, grand_total,
        employee_name, customer_name, ticket_note, is_refund, original_receipt_id,
        payments, items
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
      ON CONFLICT (id) DO NOTHING
      RETURNING id`,
      [
        receipt.id, receipt.timestamp, receipt.subtotal, receipt.taxRate,
        receipt.taxAmount, receipt.grandTotal, receipt.employeeName,
        receipt.customerName, receipt.ticketNote, receipt.isRefund,
        receipt.originalReceiptId, JSON.stringify(receipt.payments || []),
        JSON.stringify(receipt.items || [])
      ]
    );

    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { duplicate: true, tickets: [], depletedIngredients: [] };
    }

    // Refunds are recorded but do not consume stock or create production tickets.
    if (receipt.isRefund) {
      await client.query("COMMIT");
      return { duplicate: false, tickets: [], depletedIngredients: [] };
    }

    const lines = Array.isArray(receipt.items) ? receipt.items : [];
    const itemIds = [...new Set(lines.map(line => String(line.itemId || line.id || "")).filter(Boolean))];
    const [itemResult, recipeResult] = await Promise.all([
      itemIds.length
        ? client.query("SELECT id, name, station, prep_time_minutes FROM items WHERE id = ANY($1::text[])", [itemIds])
        : Promise.resolve({ rows: [] }),
      itemIds.length
        ? client.query("SELECT item_id, item_name, station, prep_time_minutes, ingredients FROM recipes WHERE item_id = ANY($1::text[])", [itemIds])
        : Promise.resolve({ rows: [] })
    ]);
    const itemsById = new Map(itemResult.rows.map(row => [row.id, row]));
    const recipesById = new Map(recipeResult.rows.map(row => {
      let ingredients = row.ingredients;
      if (typeof ingredients === "string") ingredients = JSON.parse(ingredients);
      return [row.item_id, { ...row, ingredients: Array.isArray(ingredients) ? ingredients : [] }];
    }));

    const stationGroups = new Map();
    const requiredByIngredient = new Map();
    const ingredientNames = new Map();

    for (const line of lines) {
      const itemId = String(line.itemId || line.id || "");
      const catalogItem = itemsById.get(itemId);
      const recipe = recipesById.get(itemId);
      const quantity = Number(line.quantity !== undefined ? line.quantity : (line.qty !== undefined ? line.qty : 1));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Receipt contains an invalid item quantity.");

      const station = recipe?.station || catalogItem?.station || "HOT_KITCHEN";
      const prepTimeMinutes = Number(recipe?.prep_time_minutes || catalogItem?.prep_time_minutes || 5);
      if (!stationGroups.has(station)) stationGroups.set(station, []);
      stationGroups.get(station).push({
        name: line.name || line.itemName || catalogItem?.name || "Dish",
        quantity,
        notes: line.notes || (Array.isArray(line.modifiers) ? line.modifiers.map(modifier => modifier.name).filter(Boolean).join(", ") : ""),
        prepTimeMinutes
      });

      for (const ingredient of recipe?.ingredients || []) {
        const ingredientId = String(ingredient.ingredientId || ingredient.id || "");
        const perItem = Number(ingredient.quantity);
        if (!ingredientId || !Number.isFinite(perItem) || perItem <= 0) {
          throw new Error(`Recipe for ${recipe.item_name} contains an invalid ingredient line.`);
        }
        requiredByIngredient.set(ingredientId, (requiredByIngredient.get(ingredientId) || 0) + perItem * quantity);
        ingredientNames.set(ingredientId, ingredient.name || ingredientId);
      }
    }

    const ingredientIds = [...requiredByIngredient.keys()];
    let depletedIngredients = [];
    if (ingredientIds.length) {
      const locked = await client.query(
        "SELECT id, name, current_stock FROM ingredients WHERE id = ANY($1::text[]) FOR UPDATE",
        [ingredientIds]
      );
      const stockById = new Map(locked.rows.map(row => [row.id, row]));
      for (const ingredientId of ingredientIds) {
        const row = stockById.get(ingredientId);
        const required = requiredByIngredient.get(ingredientId);
        if (!row) throw new Error(`Recipe ingredient not found in inventory: ${ingredientNames.get(ingredientId)}.`);
        const available = Number(row.current_stock || 0);
        if (available < required) throw new InsufficientStockError(row.name, required, available);
      }
      for (const ingredientId of ingredientIds) {
        const required = requiredByIngredient.get(ingredientId);
        const updated = await client.query(
          "UPDATE ingredients SET current_stock = current_stock - $2, updated_at = $3 WHERE id = $1 RETURNING id, name, current_stock",
          [ingredientId, required, Date.now()]
        );
        depletedIngredients.push({
          id: updated.rows[0].id,
          name: updated.rows[0].name,
          used: required,
          remaining: Number(updated.rows[0].current_stock)
        });
      }
    }

    const now = Date.now();
    const tickets = [];
    for (const [station, ticketItems] of stationGroups.entries()) {
      const maxPrep = Math.max(5, ...ticketItems.map(item => Number(item.prepTimeMinutes) || 5));
      const ticket = {
        id: `ticket_${receipt.id}_${station}`,
        receiptId: receipt.id,
        orderNumber: String(receipt.orderNumber || receipt.receiptNumber || receipt.id),
        channel: "POS",
        tableNumber: receipt.tableNumber || (receipt.ticketNote?.includes("Table") ? receipt.ticketNote : null),
        customerName: receipt.customerName || "Guest",
        station,
        items: ticketItems,
        status: "PENDING",
        createdAt: now,
        targetReadyAt: now + maxPrep * 60 * 1000,
        completedAt: null
      };
      await client.query(
        `INSERT INTO kitchen_orders (
          id, receipt_id, channel, order_number, table_number, customer_name,
          station, items, status, created_at, target_ready_at, completed_at, ticket_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb)
        ON CONFLICT (id) DO NOTHING`,
        [
          ticket.id, ticket.receiptId, ticket.channel, ticket.orderNumber,
          ticket.tableNumber, ticket.customerName, ticket.station,
          JSON.stringify(ticket.items), ticket.status, ticket.createdAt,
          ticket.targetReadyAt, ticket.completedAt, JSON.stringify(ticket)
        ]
      );
      tickets.push(ticket);
    }

    await client.query("COMMIT");
    return { duplicate: false, tickets, depletedIngredients };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createPosSaleAtomically, InsufficientStockError };
