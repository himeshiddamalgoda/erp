import { pathToFileURL } from "node:url";
import { createQuotationContext } from "../context.js";
import { seedDemo } from "./demo.js";
import { demoIds as ids } from "../../middleware/auth-context.js";
import {
  parse,
  createSchema,
} from "../../modules/customers/customer.schemas.js";
import {
  normalizeContact,
  scalarKeys,
  pick,
} from "../../modules/customers/customer.mapper.js";
export const customerDemoIds = {
  customer: "30000000-0000-4000-8000-000000000002",
  contact: "60000000-0000-4000-8000-000000000002",
  billing: "40000000-0000-4000-8000-000000000003",
  warehouseA: "40000000-0000-4000-8000-000000000004",
  warehouseB: "40000000-0000-4000-8000-000000000005",
};
export const customerDemoInput = () => ({
  name: "Ocean Apparel (Pvt) Ltd",
  displayName: "Ocean Apparel",
  country: "LK",
  currency: "USD",
  paymentTerms: "30% advance; 70% before shipment",
  salesTeamId: ids.team,
  ownerId: ids.sales,
  email: "office@example.test",
  phone: "+94 11 234 5678",
  website: "https://example.test",
  registrationNumber: "DEMO-PV-001",
  internalNotes: "Prefers colour-and-size packing breakdowns",
  contacts: [
    {
      name: "Nimal Silva",
      jobTitle: "Buyer",
      email: "buyer@example.test",
      phone: "+94 77 123 4567",
      primary: true,
    },
  ],
  addresses: [
    {
      addressType: "billing",
      label: "Head Office",
      line1: "14 Sample Road",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
    {
      addressType: "shipping",
      label: "Warehouse A",
      line1: "25 Sample Warehouse Road",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
    {
      addressType: "shipping",
      label: "Warehouse B",
      line1: "8 Sample Industrial Road",
      city: "Gampaha",
      country: "LK",
    },
  ],
});
export async function seedCustomers(ctx) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo customer seeding is development-only");
  await seedDemo(ctx);
  const existing = await ctx.models.customers.findByPk(
    customerDemoIds.customer,
  );
  if (existing) return customerDemoIds;
  const input = parse(createSchema, customerDemoInput()),
    s = ctx.customers,
    actor = { id: ids.admin, role: "Admin", salesTeamIds: [] };
  await s.r.transaction(async (t) => {
    const code = await s.r.number(t); // Sequence lock also serializes concurrent seed attempts.
    if (
      await ctx.models.customers.findByPk(customerDemoIds.customer, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      })
    )
      return;
    s.validate(input, input.contacts.map(normalizeContact), input.addresses);
    await s.assignment(actor, input, t);
    const now = new Date(),
      stamps = { createdAt: now, updatedAt: now };
    const c = await s.r.insert(
      "customers",
      {
        ...pick(input, scalarKeys),
        id: customerDemoIds.customer,
        code,
        isActive: true,
        version: 1,
        createdBy: ids.admin,
        updatedBy: ids.admin,
        ...stamps,
      },
      { transaction: t },
    );
    await s.r.insertMany(
      "customer_contacts",
      input.contacts.map((x) => ({
        ...normalizeContact(x),
        id: customerDemoIds.contact,
        customerId: c.id,
        ...stamps,
      })),
      { transaction: t },
    );
    await s.r.insertMany(
      "customer_addresses",
      input.addresses.map((x, i) => ({
        ...x,
        id: [
          customerDemoIds.billing,
          customerDemoIds.warehouseA,
          customerDemoIds.warehouseB,
        ][i],
        customerId: c.id,
        ...stamps,
      })),
      { transaction: t },
    );
    await s.r.audit(
      c,
      actor,
      "CustomerCreated",
      null,
      null,
      "customers-demo-seed",
      t,
      { source: "deterministic-demo-seed" },
    );
  });
  return customerDemoIds;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ctx = createQuotationContext();
  try {
    console.log(JSON.stringify(await seedCustomers(ctx), null, 2));
  } finally {
    await ctx.close();
  }
}
