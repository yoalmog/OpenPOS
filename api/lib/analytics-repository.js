function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function receiptFromRow(row) {
  return {
    id: row.id,
    timestamp: Number(row.timestamp),
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    employeeName: row.employee_name || null,
    customerName: row.customer_name || null,
    ticketNote: row.ticket_note || null,
    isRefund: Boolean(row.is_refund),
    originalReceiptId: row.original_receipt_id || null,
    payments: parseJson(row.payments, []),
    items: parseJson(row.items, [])
  };
}

async function listReceipts(pool, { from, to } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("A PostgreSQL pool is required.");
  const conditions = [];
  const params = [];
  if (from !== undefined) { params.push(Number(from)); conditions.push(`timestamp >= $${params.length}`); }
  if (to !== undefined) { params.push(Number(to)); conditions.push(`timestamp <= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT id, timestamp, subtotal, tax_rate, tax_amount, grand_total,
            employee_name, customer_name, ticket_note, is_refund,
            original_receipt_id, payments, items
       FROM receipts ${where}
      ORDER BY timestamp DESC`,
    params
  );
  return result.rows.map(receiptFromRow);
}

async function getHourlyReceiptCounts(pool, since) {
  if (!pool || typeof pool.query !== "function") throw new Error("A PostgreSQL pool is required.");
  const result = await pool.query(
    `SELECT EXTRACT(HOUR FROM TO_TIMESTAMP(timestamp / 1000.0))::int AS hour,
            COUNT(*)::int AS orders
       FROM receipts
      WHERE timestamp >= $1 AND is_refund = FALSE
      GROUP BY hour ORDER BY hour`,
    [Number(since)]
  );
  return result.rows.map(row => ({ hour: Number(row.hour), orders: Number(row.orders) }));
}

module.exports = { listReceipts, getHourlyReceiptCounts };
