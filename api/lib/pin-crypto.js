const crypto = require("node:crypto");

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

function isValidPinFormat(pin) {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin.trim());
}

function hashPin(pin, existingSalt = null) {
  const normalized = String(pin || "").trim();
  if (!isValidPinFormat(normalized)) {
    throw new Error("Employee PIN must be 4 to 8 numeric digits.");
  }
  const salt = existingSalt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(normalized, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  return { salt, hash };
}

function verifyPin(pin, salt, expectedHash) {
  const normalized = String(pin || "").trim();
  if (!isValidPinFormat(normalized) || !salt || !expectedHash) {
    return false;
  }
  try {
    const derived = crypto.pbkdf2Sync(
      normalized,
      String(salt),
      PBKDF2_ITERATIONS,
      PBKDF2_KEYLEN,
      PBKDF2_DIGEST
    );
    const expectedBuf = Buffer.from(String(expectedHash), "hex");
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch (_) {
    return false;
  }
}

function sanitizeEmployee(emp) {
  if (!emp || typeof emp !== "object") return emp;
  const clone = { ...emp };
  const hasPin = Boolean(clone.pinHash || clone.pin_hash || clone.hasPin);
  delete clone.pinHash;
  delete clone.pinSalt;
  delete clone.pin_hash;
  delete clone.pin_salt;
  delete clone.pin;
  clone.hasPin = hasPin;
  return clone;
}

module.exports = {
  isValidPinFormat,
  hashPin,
  verifyPin,
  sanitizeEmployee
};
