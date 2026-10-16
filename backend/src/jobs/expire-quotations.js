import { createQuotationContext } from "../db/context.js";
const context = createQuotationContext();
try {
  console.log(`Expired ${await context.service.expireAll()} quotations`);
} finally {
  await context.close();
}
