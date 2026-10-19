import { pathToFileURL } from "node:url";
import { createQuotationContext } from "../context.js";
import { seedDemo, demoInput } from "./demo.js";
import { demoIds as ids } from "../../middleware/auth-context.js";
import {
  parse,
  createSchema,
} from "../../modules/sales-orders/sales-order.schemas.js";
const sales = { id: ids.sales, role: "Sales", salesTeamIds: [ids.team] };
const manager = {
  id: ids.manager,
  role: "SalesManager",
  salesTeamIds: [ids.team],
};
export function directOrderInput(po = "OA-1045") {
  const {
    quotationDate,
    validUntil: _validUntil,
    notes,
    ...body
  } = demoInput();
  return {
    ...body,
    orderDate: quotationDate,
    buyerPoNumber: po,
    buyerPoDate: quotationDate,
    publicNotes: "Pack by colour and size",
    internalNotes: notes,
  };
}
export async function seedSalesOrders(context) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo order seeding is development-only");
  await seedDemo(context);
  const s = context.salesOrders;
  const direct = (
    await s.create(
      sales,
      parse(createSchema, directOrderInput("SO-DEMO-DIRECT")),
      "sales-orders-demo-direct-v1",
      "demo-seed",
    )
  ).body.data;
  const marker = "Sales Orders converted demo v1 - internal only";
  let q = await context.models.quotations.findOne({
    where: { notes: marker },
    order: [["createdAt", "ASC"]],
  });
  if (!q)
    q = await context.service.create(
      sales,
      { ...demoInput(), notes: marker },
      "demo-seed",
    );
  else q = await context.service.detail(sales, q.id);
  for (const [from, action, actor, extra] of [
    ["Draft", "submit", sales, {}],
    ["PendingApproval", "approve", manager, {}],
    ["Approved", "issue", sales, { channel: "manual" }],
    [
      "Issued",
      "buyer-response",
      sales,
      { decision: "Accepted", reference: "Development seed buyer acceptance" },
    ],
  ])
    if (q.status === from)
      q = (
        await context.service.action(
          actor,
          q.id,
          action,
          { version: q.version, ...extra },
          "demo-seed",
        )
      ).data;
  if (!["Accepted", "Converted"].includes(q.status))
    throw new Error(
      "Seed quote cannot be reused in its current state; inspect it without rewriting history",
    );
  const converted = (
    await context.service.convert(
      sales,
      q.id,
      { version: q.version },
      "demo-seed",
      "sales-orders-demo-converted-v1",
    )
  ).body.data;
  return {
    directOrderId: direct.id,
    convertedOrderId: converted.id,
    sourceQuotationId: q.id,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const context = createQuotationContext();
  try {
    console.log(await seedSalesOrders(context));
  } finally {
    await context.close();
  }
}
