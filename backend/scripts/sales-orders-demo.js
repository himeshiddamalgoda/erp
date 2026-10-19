import { randomUUID } from "node:crypto";
import { directOrderInput } from "../src/db/seeders/sales-orders-demo.js";
const sales = process.env.SALES_API_URL || "http://localhost:4000/api/v1";
const manager = process.env.MANAGER_API_URL || "http://localhost:4101/api/v1";
async function call(base, path, body, key) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data.data;
}
let o = await call(
  sales,
  "/sales-orders",
  directOrderInput("HTTP-DEMO-" + randomUUID()),
  randomUUID(),
);
console.log("Created", o.orderNumber, o.id);
o = await call(
  manager,
  `/sales-orders/${o.id}/confirm`,
  { version: o.version, comment: "Manager reviewed PO and garment terms" },
  randomUUID(),
);
o = await call(manager, `/sales-orders/${o.id}/hold`, {
  version: o.version,
  reason: "Review delivery",
});
const amended = await call(
  manager,
  `/sales-orders/${o.id}/revisions`,
  {
    version: o.version,
    reason: "Updated packing instructions",
    buyerReference: "Buyer demo email",
    changes: { publicNotes: "Deliver grouped by colour" },
  },
  randomUUID(),
);
o = amended.order;
o = await call(manager, `/sales-orders/${o.id}/resume`, {
  version: o.version,
  reason: "Buyer confirmed amendment",
});
console.log({
  orderId: o.id,
  orderNumber: o.orderNumber,
  status: o.status,
  documentRevision: o.documentRevision,
  handoff: o.handoff.status,
  totalQty: o.totalQty,
  total: o.total,
});
console.log(`Next: npm run demo:fulfilment -- ${o.id} partial`);
console.log(`Then: npm run demo:fulfilment -- ${o.id} complete`);
console.log(
  "Finally manager POST /sales-orders/" +
    o.id +
    "/close with the latest GET detail version.",
);
