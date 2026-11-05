const SUPPORTED_SYNC_EVENT_TYPES = new Set(["RECEIPT_CREATED", "RECEIPT_REFUNDED"]);

function validateSyncEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { valid: false, status: 400, error: "Sync event must be an object." };
  }
  if (typeof event.id !== "string" || !event.id.trim() || typeof event.type !== "string" || !event.type.trim()) {
    return { valid: false, status: 400, error: "Every sync event must include a string id and type." };
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
