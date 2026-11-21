const ALLOWED_KITCHEN_STATIONS = new Set([
  "COFFEE_BAR",
  "HOT_KITCHEN",
  "SALADS",
  "DESSERTS",
  "BAR"
]);

function validateBulkUpdatePayload(body = {}) {
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(
    rawIds
      .filter(id => typeof id === "string" || typeof id === "number")
      .map(id => String(id).trim())
      .filter(Boolean)
  )];

  if (ids.length === 0) {
    return { valid: false, status: 400, error: "Select at least one product to update." };
  }
  if (ids.length > 500) {
    return { valid: false, status: 400, error: "Cannot bulk update more than 500 products at once." };
  }

  const categoryId = typeof body.categoryId === "string" && body.categoryId.trim()
    ? body.categoryId.trim()
    : null;
  const station = typeof body.station === "string" && body.station.trim()
    ? body.station.trim()
    : null;

  if (!categoryId && !station) {
    return { valid: false, status: 400, error: "Provide a target categoryId or kitchen station." };
  }
  if (station && !ALLOWED_KITCHEN_STATIONS.has(station)) {
    return { valid: false, status: 400, error: "Invalid kitchen station." };
  }

  return { valid: true, ids, categoryId, station };
}

function mapPgItemRow(row) {
  let priceVariants = [];
  if (Array.isArray(row.price_variants)) {
    priceVariants = row.price_variants;
  } else if (typeof row.price_variants === "string" && row.price_variants.trim()) {
    priceVariants = JSON.parse(row.price_variants);
  }
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    categoryId: row.category_id,
    barcode: row.barcode || "",
    color: row.color === null || row.color === undefined ? null : Number(row.color),
    stockQuantity: Number(row.stock_quantity || 0),
    station: row.station || "HOT_KITCHEN",
    prepTimeMinutes: Number(row.prep_time_minutes || 5),
    priceVariants
  };
}

async function bulkUpdateItemsPg(pool, { ids, categoryId, station }) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("A PostgreSQL pool is required.");
  }
  const sets = [];
  const params = [ids];

  if (categoryId) {
    params.push(categoryId);
    sets.push(`category_id = $${params.length}`);
  }
  if (station) {
    params.push(station);
    sets.push(`station = $${params.length}`);
  }

  params.push(Date.now());
  sets.push(`updated_at = $${params.length}`);

  const sql = `
    UPDATE public.items
    SET ${sets.join(", ")}
    WHERE id = ANY($1::text[])
    RETURNING id, name, price, category_id, barcode, color, stock_quantity, station, prep_time_minutes, price_variants::text AS price_variants
  `;
  const result = await pool.query(sql, params);
  return result.rows.map(mapPgItemRow);
}

function mergeStoreSettings(current = {}, updates = {}) {
  const next = { ...(current && typeof current === "object" ? current : {}) };

  if (updates.name !== undefined) {
    const name = String(updates.name).trim();
    if (!name || name.length > 120) {
      return { valid: false, status: 400, error: "Store name must be between 1 and 120 characters." };
    }
    next.name = name;
  }

  if (updates.address !== undefined) {
    next.address = String(updates.address).trim().slice(0, 240);
  }

  if (updates.phone !== undefined) {
    next.phone = String(updates.phone).trim().slice(0, 40);
  }

  if (updates.supportEmail !== undefined) {
    const email = String(updates.supportEmail).trim().slice(0, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { valid: false, status: 400, error: "supportEmail must be a valid email address." };
    }
    next.supportEmail = email;
  }

  if (updates.businessHours !== undefined) {
    next.businessHours = String(updates.businessHours).trim().slice(0, 120);
  }

  if (updates.currency !== undefined) {
    const currency = String(updates.currency).trim();
    if (!currency || currency.length > 8) {
      return { valid: false, status: 400, error: "currency must be between 1 and 8 characters." };
    }
    next.currency = currency;
  }

  if (updates.taxRate !== undefined) {
    const parsedTaxRate = Number(updates.taxRate);
    if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 100) {
      return { valid: false, status: 400, error: "taxRate must be between 0 and 100." };
    }
    next.taxRate = parsedTaxRate;
  }

  if (updates.receiptFooter !== undefined) {
    next.receiptFooter = String(updates.receiptFooter).trim().slice(0, 240);
  }

  if (updates.lowStockThreshold !== undefined) {
    const threshold = Number(updates.lowStockThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100000) {
      return { valid: false, status: 400, error: "lowStockThreshold must be between 0 and 100000." };
    }
    next.lowStockThreshold = Math.floor(threshold);
  }

  if (updates.defaultPrepTimeMinutes !== undefined) {
    const prep = Number(updates.defaultPrepTimeMinutes);
    if (!Number.isFinite(prep) || prep < 1 || prep > 180) {
      return { valid: false, status: 400, error: "defaultPrepTimeMinutes must be between 1 and 180." };
    }
    next.defaultPrepTimeMinutes = Math.round(prep);
  }

  for (const boolKey of [
    "autoDepleteOnSync",
    "enableLowStockAlerts",
    "acceptOnlineOrders",
    "allowDineIn",
    "allowTakeaway",
    "allowDelivery"
  ]) {
    if (updates[boolKey] !== undefined) {
      next[boolKey] = Boolean(updates[boolKey]);
    }
  }

  return { valid: true, settings: next };
}

function sanitizePublicStoreInfo(storeInfo) {
  if (!storeInfo || typeof storeInfo !== "object") return null;
  const { apiKey: _removed, ...rest } = storeInfo;
  return {
    name: rest.name || null,
    address: rest.address || "",
    phone: rest.phone || "",
    supportEmail: rest.supportEmail || "",
    businessHours: rest.businessHours || "",
    currency: rest.currency || null,
    taxRate: rest.taxRate ?? null,
    receiptFooter: rest.receiptFooter || "",
    lowStockThreshold: Number.isFinite(Number(rest.lowStockThreshold)) ? Number(rest.lowStockThreshold) : 10,
    autoDepleteOnSync: rest.autoDepleteOnSync !== false,
    enableLowStockAlerts: rest.enableLowStockAlerts !== false,
    acceptOnlineOrders: rest.acceptOnlineOrders !== false,
    defaultPrepTimeMinutes: Number.isFinite(Number(rest.defaultPrepTimeMinutes)) ? Number(rest.defaultPrepTimeMinutes) : 15,
    allowDineIn: rest.allowDineIn !== false,
    allowTakeaway: rest.allowTakeaway !== false,
    allowDelivery: rest.allowDelivery !== false
  };
}

module.exports = {
  ALLOWED_KITCHEN_STATIONS,
  validateBulkUpdatePayload,
  bulkUpdateItemsPg,
  mergeStoreSettings,
  sanitizePublicStoreInfo
};
