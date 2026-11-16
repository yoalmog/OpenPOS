function buildKitchenTicketsForOrder(order, { recipes = [], items = [], now = Date.now() } = {}) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) return [];

  const recipeList = Array.isArray(recipes) ? recipes : [];
  const catalog = Array.isArray(items) ? items : [];
  const stationGroups = new Map();

  for (const orderItem of order.items) {
    const itemId = orderItem.itemId || orderItem.id;
    const recipe = recipeList.find((entry) => entry.itemId === itemId || entry.itemName === orderItem.name);
    const catalogItem = catalog.find((entry) => entry.id === itemId);
    const station = recipe?.station || catalogItem?.station || "HOT_KITCHEN";
    const prepTimeMinutes = Number(recipe?.prepTimeMinutes || catalogItem?.prepTimeMinutes || 5);
    if (!stationGroups.has(station)) stationGroups.set(station, []);
    stationGroups.get(station).push({
      name: orderItem.name || orderItem.itemName || catalogItem?.name || "Dish",
      quantity: Number(orderItem.quantity || orderItem.qty || 1),
      notes: orderItem.notes || (Array.isArray(orderItem.modifiers)
        ? orderItem.modifiers.map((modifier) => modifier.name).join(", ")
        : "") || "",
      prepTimeMinutes: Number.isFinite(prepTimeMinutes) && prepTimeMinutes > 0 ? prepTimeMinutes : 5
    });
  }

  return [...stationGroups.entries()].map(([station, ticketItems]) => {
    const maxPrep = Math.max(...ticketItems.map((item) => item.prepTimeMinutes), 5);
    return {
      id: `ticket_${now}_${Math.random().toString(36).slice(2, 6)}`,
      receiptId: order.id,
      orderNumber: String(order.orderNumber || Math.floor(100 + Math.random() * 900)),
      channel: order.channel || "WEB",
      tableNumber: order.tableNumber || null,
      customerName: order.customerName || "Guest",
      station,
      items: ticketItems,
      status: "PENDING",
      createdAt: now,
      targetReadyAt: now + (maxPrep * 60 * 1000),
      completedAt: null
    };
  });
}

module.exports = { buildKitchenTicketsForOrder };
