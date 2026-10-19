import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { customerDemoInput } from "../src/db/seeders/customers-demo.js";
const base = process.env.ADMIN_API_URL || "http://127.0.0.1:4102/api/v1";
async function call(method, path, body, key) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(`${response.status} ${JSON.stringify(json)}`);
  return json;
}
const key = randomUUID(),
  input = customerDemoInput();
let { data: c } = await call("POST", "/customers", input, key);
const replay = await call("POST", "/customers", input, key);
assert.equal(replay.data.id, c.id);
console.log("Created and replayed", c.code, c.id, "version", c.version);
const old = c.addresses.find((x) => x.label === "Warehouse A"),
  next = c.addresses.find((x) => x.label === "Warehouse B");
({ data: c } = await call("PATCH", `/customers/${c.id}`, {
  version: c.version,
  addresses: [
    { id: old.id, isDefault: false },
    { id: next.id, isDefault: true },
  ],
}));
console.log(
  "Switched default shipping; stable warehouse IDs",
  old.id,
  next.id,
  "version",
  c.version,
);
({ data: c } = await call("POST", `/customers/${c.id}/archive`, {
  version: c.version,
  reason: "Demo buyer inactive",
}));
assert.equal(c.status, "Archived");
console.log("Archived", "version", c.version);
({ data: c } = await call("PATCH", `/customers/${c.id}`, {
  version: c.version,
  displayName: "Ocean Apparel — repaired profile",
}));
assert.equal(c.status, "Archived");
({ data: c } = await call("POST", `/customers/${c.id}/reactivate`, {
  version: c.version,
  reason: "Demo buyer resumed purchases",
}));
assert.equal(c.status, "Active");
const list = await call("GET", "/customers?q=" + encodeURIComponent(c.code));
assert.ok(list.data.some((x) => x.id === c.id));
const detail = await call(
  "GET",
  `/customers/${c.id}?includeInactiveChildren=true`,
);
assert.equal(detail.data.version, c.version);
console.log("Verified all 6 endpoints; final version", c.version);
