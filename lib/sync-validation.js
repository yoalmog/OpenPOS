const SUPPORTED_SYNC_EVENT_TYPES = new Set(["RECEIPT_CREATED", "RECEIPT_REFUNDED"]);

function validateSyncEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { valid: false, status: 400, error: "Sync event must be an object." };
  }
  const validStringId = typeof event.id === "string" && event.id.trim().length > 0;
  const validNumericId = typeof event.id === "number" && Number.isSafeInteger(event.id) && event.id > 0;
  if ((!validStringId && !validNumericId) || typeof event.type !== "string" || !event.type.trim()) {
    return { valid: false, status: 400, error: "Every sync event must include a non-empty string or positive integer id and a type." };
  }
  if (!SUPPORTED_SYNC_EVENT_TYPES.has(event.type)) {
    return { valid: false, status: 422, error: `Unsupported sync event type: ${event.type}. Event was not acknowledged.` };
  }
  let payload = event.payload;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); }
    catch (_) { return { valid: false, status: 400, error: "Sync event payload must contain valid JSON." }; }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, status: 400, error: "Sync event payload must be an object." };
  }
  return { valid: true, id: event.id, type: event.type, payload };
}

module.exports = { SUPPORTED_SYNC_EVENT_TYPES, validateSyncEvent };
