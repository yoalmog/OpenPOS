const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSyncEvent, SUPPORTED_SYNC_EVENT_TYPES } = require("../api/lib/sync-validation");

test("only receipt creation and refund events are currently supported", () => {
  assert.deepEqual([...SUPPORTED_SYNC_EVENT_TYPES].sort(), ["RECEIPT_CREATED", "RECEIPT_REFUNDED"]);
});

test("valid receipt event with JSON payload is normalized", () => {
  const result = validateSyncEvent({ id: "evt-1", type: "RECEIPT_CREATED", payload: '{"id":"r-1"}' });
  assert.deepEqual(result, { valid: true, id: "evt-1", type: "RECEIPT_CREATED", payload: { id: "r-1" } });
});

test("unknown event types are rejected and cannot be acknowledged", () => {
  const result = validateSyncEvent({ id: "evt-2", type: "INVENTORY_UPDATED", payload: {} });
  assert.equal(result.valid, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /not acknowledged/);
});

test("missing ids and malformed payloads are rejected", () => {
  assert.equal(validateSyncEvent({ type: "RECEIPT_CREATED", payload: {} }).status, 400);
  assert.equal(validateSyncEvent({ id: "evt", type: "RECEIPT_CREATED", payload: "{" }).status, 400);
  assert.equal(validateSyncEvent({ id: "evt", type: "RECEIPT_CREATED", payload: [] }).status, 400);
});
