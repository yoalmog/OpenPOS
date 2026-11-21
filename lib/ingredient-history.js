function roundStock(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toUtcDateKey(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatShortUtcDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function collectIngredientMovements({
  ingredient,
  auditLogs = [],
  wasteLogs = [],
  receipts = [],
  recipes = [],
  windowStartMs,
  now
}) {
  if (!ingredient || !ingredient.id) return [];

  const ingId = String(ingredient.id);
  const ingNameLower = String(ingredient.name || "").trim().toLowerCase();
  const events = [];

  const matchesIngredient = (candidateId, candidateName) => {
    if (candidateId && String(candidateId) === ingId) return true;
    if (ingNameLower && candidateName && String(candidateName).trim().toLowerCase() === ingNameLower) return true;
    return false;
  };

  for (const entry of Array.isArray(auditLogs) ? auditLogs : []) {
    if (!entry || entry.action !== "INGREDIENT_STOCK_ADJUSTED") continue;
    const ts = Number(entry.timestamp);
    if (!Number.isFinite(ts) || ts < windowStartMs || ts > now) continue;
    const details = entry.details || {};
    if (!matchesIngredient(details.ingredientId, details.ingredient)) continue;

    let delta = Number.isFinite(Number(details.delta)) ? Number(details.delta) : null;
    const newStock = Number.isFinite(Number(details.newStock)) ? Number(details.newStock) : null;
    const prevStock = Number.isFinite(Number(details.previousStock)) ? Number(details.previousStock) : null;
    if (delta === null && newStock !== null && prevStock !== null) {
      delta = newStock - prevStock;
    }

    events.push({
      id: entry.id || `audit_${ts}`,
      timestamp: ts,
      dateKey: toUtcDateKey(ts),
      type: "ADJUSTMENT",
      delta,
      newStock,
      reason: details.reason || "Manual Adjustment"
    });
  }

  for (const waste of Array.isArray(wasteLogs) ? wasteLogs : []) {
    if (!waste) continue;
    const ts = Number(waste.timestamp);
    if (!Number.isFinite(ts) || ts < windowStartMs || ts > now) continue;
    if (!matchesIngredient(waste.itemOrIngredientId, waste.name)) continue;
    const qty = Number(waste.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    events.push({
      id: waste.id || `waste_${ts}`,
      timestamp: ts,
      dateKey: toUtcDateKey(ts),
      type: "WASTE",
      delta: -qty,
      newStock: null,
      reason: `Waste (${waste.reason || "Spoilage"})`
    });
  }

  const recipeByItemId = new Map();
  const recipeByName = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    if (!recipe) continue;
    if (recipe.itemId) recipeByItemId.set(String(recipe.itemId), recipe);
    if (recipe.itemName) recipeByName.set(String(recipe.itemName).trim().toLowerCase(), recipe);
  }

  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    if (!receipt || receipt.isRefund) continue;
    const ts = Number(receipt.timestamp);
    if (!Number.isFinite(ts) || ts < windowStartMs || ts > now) continue;

    const lines = Array.isArray(receipt.items) ? receipt.items : [];
    let usedInReceipt = 0;
    for (const line of lines) {
      if (!line) continue;
      const lineItemId = line.itemId || line.id;
      const lineName = String(line.name || line.itemName || line.item?.name || "").trim().toLowerCase();
      const recipe = (lineItemId && recipeByItemId.get(String(lineItemId))) || (lineName && recipeByName.get(lineName));
      if (!recipe || !Array.isArray(recipe.ingredients)) continue;

      const qtySold = Number(line.quantity !== undefined ? line.quantity : (line.qty ?? 1));
      if (!Number.isFinite(qtySold) || qtySold <= 0) continue;

      for (const ri of recipe.ingredients) {
        if (!ri) continue;
        if (!matchesIngredient(ri.ingredientId || ri.id, ri.name)) continue;
        const perUnit = Number(ri.quantity || 0);
        if (Number.isFinite(perUnit) && perUnit > 0) {
          usedInReceipt += perUnit * qtySold;
        }
      }
    }

    if (usedInReceipt > 0) {
      events.push({
        id: `sale_${receipt.id || ts}`,
        timestamp: ts,
        dateKey: toUtcDateKey(ts),
        type: "SALE_DEPLETION",
        delta: -roundStock(usedInReceipt),
        newStock: null,
        reason: `POS Sale (${receipt.id || "Receipt"})`
      });
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

function buildIngredientStockHistory({
  ingredient,
  auditLogs = [],
  wasteLogs = [],
  receipts = [],
  recipes = [],
  days = 30,
  now = Date.now()
}) {
  if (!ingredient || !ingredient.id) {
    throw new Error("An ingredient object with an id is required.");
  }

  const parsedDays = Math.max(1, Math.min(Number(days) || 30, 90));
  const nowDate = new Date(now);
  const endDayStartUtc = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const windowStartMs = endDayStartUtc - (parsedDays - 1) * 24 * 60 * 60 * 1000;

  const dateKeys = [];
  for (let i = 0; i < parsedDays; i++) {
    dateKeys.push(toUtcDateKey(windowStartMs + i * 24 * 60 * 60 * 1000));
  }

  const windowEvents = collectIngredientMovements({
    ingredient,
    auditLogs,
    wasteLogs,
    receipts,
    recipes,
    windowStartMs,
    now
  });

  const currentStock = roundStock(ingredient.currentStock || 0);
  const minThreshold = roundStock(ingredient.minThreshold || 0);

  // Reconstruct opening stock at windowStartMs by walking backward from currentStock
  let runningStock = currentStock;
  for (let i = windowEvents.length - 1; i >= 0; i--) {
    const ev = windowEvents[i];
    if (Number.isFinite(ev.delta)) {
      ev.stockAfter = roundStock(runningStock);
      runningStock = Math.max(0, roundStock(runningStock - ev.delta));
      ev.stockBefore = roundStock(runningStock);
    } else if (Number.isFinite(ev.newStock)) {
      ev.stockAfter = roundStock(ev.newStock);
      ev.stockBefore = roundStock(ev.newStock);
      runningStock = roundStock(ev.newStock);
    } else {
      ev.stockAfter = roundStock(runningStock);
      ev.stockBefore = roundStock(runningStock);
    }
  }

  const eventsByDate = new Map();
  for (const ev of windowEvents) {
    if (!ev.dateKey) continue;
    if (!eventsByDate.has(ev.dateKey)) eventsByDate.set(ev.dateKey, []);
    eventsByDate.get(ev.dateKey).push(ev);
  }

  let cursorStock = runningStock;
  const series = dateKeys.map((dateKey, idx) => {
    const dayEvents = eventsByDate.get(dateKey) || [];
    let netChange = 0;
    for (const ev of dayEvents) {
      if (Number.isFinite(ev.delta)) {
        cursorStock = Math.max(0, roundStock(cursorStock + ev.delta));
        netChange += ev.delta;
      } else if (Number.isFinite(ev.newStock)) {
        cursorStock = Math.max(0, roundStock(ev.newStock));
      }
    }
    if (idx === dateKeys.length - 1) {
      cursorStock = currentStock;
    }
    return {
      date: dateKey,
      label: formatShortUtcDate(dateKey),
      stockLevel: roundStock(cursorStock),
      minThreshold,
      eventCount: dayEvents.length,
      netChange: roundStock(netChange)
    };
  });

  const levels = series.map(p => p.stockLevel);

  return {
    ingredient: {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit || "",
      currentStock,
      minThreshold
    },
    days: parsedDays,
    series,
    events: [...windowEvents].reverse().slice(0, 50),
    summary: {
      currentStock,
      minThreshold,
      periodStartStock: series[0]?.stockLevel ?? currentStock,
      minObserved: levels.length ? Math.min(...levels) : currentStock,
      maxObserved: levels.length ? Math.max(...levels) : currentStock,
      totalMovements: windowEvents.length
    }
  };
}

module.exports = {
  buildIngredientStockHistory,
  collectIngredientMovements
};
