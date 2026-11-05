const test = require("node:test");
const assert = require("node:assert/strict");
const { listShifts, getOpenShift, startShift, closeShift } = require("../api/lib/shift-repository");

function poolWith(rows = []) {
  return { calls: [], async query(sql, params) { this.calls.push({ sql, params }); return { rows }; } };
}

const row = {
  id: "shift-1", employee_name: "Alex", start_time: "1000", end_time: null,
  starting_cash: "100", cash_payments: "25", card_payments: "40",
  total_refunds: "0", actual_closing_cash: null, is_open: true
};

test("maps PostgreSQL shift rows to stable API fields", async () => {
  const pool = poolWith([row]);
  const [shift] = await listShifts(pool, { openOnly: true });
  assert.deepEqual(shift, {
    id: "shift-1", employeeName: "Alex", startTime: 1000, endTime: null,
    startingCash: 100, cashPayments: 25, cardPayments: 40,
    totalRefunds: 0, actualClosingCash: null, isOpen: true
  });
  assert.match(pool.calls[0].sql, /WHERE is_open = TRUE/);
});

test("gets an employee's open shift", async () => {
  const pool = poolWith([row]);
  assert.equal((await getOpenShift(pool, "Alex")).employeeName, "Alex");
  assert.deepEqual(pool.calls[0].params, ["Alex"]);
});

test("starts a shift with validated non-negative opening cash", async () => {
  const pool = poolWith([row]);
  const result = await startShift(pool, { id: "shift-1", employeeName: "Alex", startingCash: 100, startTime: 1000 });
  assert.equal(result.isOpen, true);
  assert.deepEqual(pool.calls[0].params, ["shift-1", "Alex", 1000, 100]);
  await assert.rejects(() => startShift(pool, { id: "bad", employeeName: "Alex", startingCash: -1 }), /non-negative/);
});

test("closes only an open shift and validates closing cash", async () => {
  const pool = poolWith([{ ...row, is_open: false, end_time: "2000", actual_closing_cash: "125" }]);
  const result = await closeShift(pool, { id: "shift-1", endTime: 2000, actualClosingCash: 125 });
  assert.equal(result.isOpen, false);
  assert.match(pool.calls[0].sql, /WHERE id = \$1 AND is_open = TRUE/);
  await assert.rejects(() => closeShift(pool, { id: "shift-1", actualClosingCash: -2 }), /non-negative/);
});

test("returns null when no open shift exists", async () => {
  assert.equal(await getOpenShift(poolWith([]), "Missing"), null);
});
