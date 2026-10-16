const memory = new Map();
export function getConversionAttempt(scope, quotation, storage) {
  if (storage === undefined) {
    try {
      storage = typeof window !== "undefined" ? window.sessionStorage : null;
    } catch {
      storage = null;
    }
  }
  const key = `thread:conversion:${scope}:${quotation.id}`;
  let existing = memory.get(key);
  try {
    const saved = storage?.getItem(key);
    if (saved) existing = JSON.parse(saved);
  } catch {
    /* Private browsing may deny storage. Keep an in-memory attempt. */
  }
  if (
    !existing ||
    typeof existing.idempotencyKey !== "string" ||
    !Number.isInteger(existing.version) ||
    existing.version < 1 ||
    existing.version > 4294967295 ||
    !existing.idempotencyKey ||
    existing.idempotencyKey.length > 128
  ) {
    existing = {
      idempotencyKey: crypto.randomUUID(),
      version: quotation.version,
    };
  }
  memory.set(key, existing);
  try {
    storage?.setItem(key, JSON.stringify(existing));
  } catch {}
  return existing;
}
