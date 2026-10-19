const memory = new Map(),
  listeners = new Set();
const storage = () => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};
export const attemptScope = (base, actor, id = "new") =>
  `thread:order-attempt:v1:${base}:${actor}:${id}`;
export function readOrderAttempt(scope, operation) {
  const key = `${scope}:${operation}`;
  let raw;
  try {
    raw = storage()?.getItem?.(key);
  } catch {}
  if (raw) {
    if (memory.get(key)?.raw === raw) return memory.get(key).value;
    try {
      const value = JSON.parse(raw);
      if (value.idempotencyKey && value.body && value.operation === operation) {
        memory.set(key, { raw, value });
        return value;
      }
    } catch {}
  }
  return memory.get(key)?.value || null;
}
export function beginOrderAttempt(scope, operation, body) {
  const key = `${scope}:${operation}`;
  const old = readOrderAttempt(scope, operation);
  if (old) return old;
  const value = {
    operation,
    idempotencyKey: crypto.randomUUID(),
    body: structuredClone(body),
  };
  const raw = JSON.stringify(value);
  memory.set(key, { raw, value });
  try {
    storage()?.setItem(key, raw);
  } catch {}
  listeners.forEach((fn) => fn());
  return value;
}
export function clearOrderAttempt(scope, operation) {
  const key = `${scope}:${operation}`;
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {}
  listeners.forEach((fn) => fn());
}
export const subscribeOrderAttempts = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const uncertainOrderOutcome = (error) =>
  !error.status || error.status >= 500;
