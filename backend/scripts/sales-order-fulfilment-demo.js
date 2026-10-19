import { createQuotationContext } from "../src/db/context.js";
import { demoIds as ids } from "../src/middleware/auth-context.js";
import { createFulfilmentAdapter } from "../src/modules/sales-orders/sales-order-fulfilment.service.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo fulfilment is forbidden in production");
const [id, stage = "partial"] = process.argv.slice(2);
if (!id || !["partial", "complete", "production", "shipment"].includes(stage))
  throw new Error(
    "Usage: npm run demo:fulfilment -- <confirmed-order-uuid> partial|complete|production|shipment",
  );
const context = createQuotationContext();
const token = Symbol("local fixture capability");
const actor = {
  id: ids.manager,
  role: "SalesManager",
  salesTeamIds: [ids.team],
};
try {
  const o = await context.salesOrders.detail(actor, id);
  let lines = [];
  if (stage === "partial") {
    const l = o.fulfilment.lines.find((l) => l.remainingQty > 0);
    if (!l) throw new Error("Order is already fully delivered");
    lines = [
      {
        orderLineId: l.orderLineId,
        qty: Math.max(1, Math.floor(l.remainingQty / 2)),
      },
    ];
  }
  if (stage === "complete")
    lines = o.fulfilment.lines
      .filter((l) => l.remainingQty > 0)
      .map((l) => ({ orderLineId: l.orderLineId, qty: l.remainingQty }));
  if (stage === "shipment")
    lines = o.lines.map((l) => ({ orderLineId: l.id, qty: l.qty }));
  if (stage === "complete" && !lines.length)
    throw new Error("Order is already fully delivered");
  const adapter = createFulfilmentAdapter(context.salesOrders, {
    authorizeIntegration: (value) =>
      value === token ? { provider: "local-demo", source: "demo" } : null,
  });
  const result = await adapter.applyFulfilmentEvent(token, {
    orderId: id,
    provider: "local-demo",
    externalEventId: crypto.randomUUID(),
    eventType:
      stage === "production"
        ? "ProductionStarted"
        : stage === "shipment"
          ? "ShipmentPosted"
          : "DeliveryConfirmed",
    occurredAt: new Date().toISOString(),
    lines,
  });
  console.log({
    label: "DEMO FIXTURE - not an external production feed",
    ...result,
  });
} catch (error) {
  console.error({ code: error.code || "DEMO_ERROR", message: error.message });
  process.exitCode = 1;
} finally {
  await context.close();
}
