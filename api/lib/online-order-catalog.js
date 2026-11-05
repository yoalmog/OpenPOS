function invalidOrderItem() {
  const error = new Error("An order item is invalid or unavailable.");
  error.code = "INVALID_ORDER_ITEM";
  return error;
}

async function buildOnlineOrderItems({ pool, requestedItems, localCatalog = [] }) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 100) {
    throw invalidOrderItem();
  }

  const normalized = requestedItems.map((item) => {
    const quantity = Number(item && item.quantity);
    if (!item || typeof item.itemId !== "string" || !item.itemId.trim() ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw invalidOrderItem();
    }
    return { itemId: item.itemId, quantity, notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : "" };
  });

  let catalogById;
  if (pool) {
    const ids = [...new Set(normalized.map(item => item.itemId))];
    const result = await pool.query(
      "SELECT id, name, price FROM items WHERE id = ANY($1::text[])",
      [ids]
    );
    catalogById = new Map(result.rows.map(row => [row.id, {
      id: row.id, name: row.name, price: Number(row.price)
    }]));
  } else {
    catalogById = new Map((Array.isArray(localCatalog) ? localCatalog : []).map(item => [item.id, item]));
  }

  return normalized.map(requested => {
    const catalogItem = catalogById.get(requested.itemId);
    const price = Number(catalogItem && catalogItem.price);
    if (!catalogItem || typeof catalogItem.name !== "string" || !catalogItem.name.trim() ||
        !Number.isFinite(price) || price < 0) {
      throw invalidOrderItem();
    }
    return {
      itemId: catalogItem.id,
      name: catalogItem.name,
      quantity: requested.quantity,
      price,
      notes: requested.notes
    };
  });
}

module.exports = { buildOnlineOrderItems };
