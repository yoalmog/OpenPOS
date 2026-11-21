function assertPool(pool) {
  if (!pool || typeof pool.query !== "function") throw new Error("A PostgreSQL pool is required.");
}

function mapShift(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeName: row.employee_name,
    startTime: Number(row.start_time),
    endTime: row.end_time == null ? null : Number(row.end_time),
    startingCash: Number(row.starting_cash),
    cashPayments: Number(row.cash_payments || 0),
    cardPayments: Number(row.card_payments || 0),
    totalRefunds: Number(row.total_refunds || 0),
    actualClosingCash: row.actual_closing_cash == null ? null : Number(row.actual_closing_cash),
    isOpen: Boolean(row.is_open)
  };
}

async function listShifts(pool, { openOnly = false, limit = 100 } = {}) {
  assertPool(pool);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const result = await pool.query(
    `SELECT * FROM shifts ${openOnly ? "WHERE is_open = TRUE" : ""}
     ORDER BY start_time DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(mapShift);
}

async function getOpenShift(pool, employeeName) {
  assertPool(pool);
  const result = await pool.query(
    `SELECT * FROM shifts WHERE is_open = TRUE
      AND ($1::text IS NULL OR employee_name = $1)
      ORDER BY start_time DESC LIMIT 1`,
    [employeeName || null]
  );
  return mapShift(result.rows[0]);
}

async function startShift(pool, shift) {
  assertPool(pool);
  if (!shift || !shift.id || !String(shift.employeeName || "").trim()) {
    throw new Error("Shift id and employee name are required.");
  }
  const startingCash = Number(shift.startingCash);
  if (!Number.isFinite(startingCash) || startingCash < 0) {
    throw new Error("Starting cash must be a non-negative number.");
  }
  const result = await pool.query(
    `INSERT INTO shifts (id, employee_name, start_time, starting_cash, is_open)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING *`,
    [String(shift.id), String(shift.employeeName).trim(), Number(shift.startTime) || Date.now(), startingCash]
  );
  return mapShift(result.rows[0]);
}

async function closeShift(pool, { id, endTime, actualClosingCash }) {
  assertPool(pool);
  if (!id) throw new Error("Shift id is required.");
  const closingCash = Number(actualClosingCash);
  if (!Number.isFinite(closingCash) || closingCash < 0) {
    throw new Error("Actual closing cash must be a non-negative number.");
  }
  const result = await pool.query(
    `UPDATE shifts
        SET end_time = $2, actual_closing_cash = $3, is_open = FALSE
      WHERE id = $1 AND is_open = TRUE
      RETURNING *`,
    [String(id), Number(endTime) || Date.now(), closingCash]
  );
  return mapShift(result.rows[0]);
}

module.exports = { listShifts, getOpenShift, startShift, closeShift };
