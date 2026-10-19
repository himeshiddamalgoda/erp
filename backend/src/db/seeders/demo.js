import { pathToFileURL } from "node:url";
import { demoIds as ids } from "../../middleware/auth-context.js";
import { createQuotationContext } from "../context.js";
import { businessDate } from "../../config/env.js";
export async function seedDemo(context) {
  const { models: m, db } = context;
  await db.transaction(async (t) => {
    const insert = (table, values) =>
      m[table].findOrCreate({
        where: { id: values.id },
        defaults: values,
        transaction: t,
      });
    const timestamps = { createdAt: new Date(), updatedAt: new Date() };
    for (const [key, role] of [
      ["sales", "Sales"],
      ["manager", "SalesManager"],
      ["admin", "Admin"],
      ["viewer", "Viewer"],
    ])
      await insert("users", {
        id: ids[key],
        displayName: `Demo ${role}`,
        role,
        isActive: true,
        ...timestamps,
      });
    await insert("sales_teams", {
      id: ids.team,
      code: "APPAREL",
      createdBy: ids.admin,
      updatedBy: ids.admin,
      name: "Apparel Sales",
      managerId: ids.manager,
      isActive: true,
      ...timestamps,
    });
    for (const key of ["sales", "manager", "admin", "viewer"])
      await m.sales_team_members.findOrCreate({
        where: { teamId: ids.team, userId: ids[key] },
        defaults: {
          isActive: true,
          joinedAt: timestamps.createdAt,
          lastActivatedAt: timestamps.createdAt,
          addedBy: ids.admin,
          lastActivatedBy: ids.admin,
          ...timestamps,
        },
        transaction: t,
      });
    await insert("customers", {
      id: ids.customer,
      code: "OCEAN",
      createdBy: ids.admin,
      updatedBy: ids.admin,
      name: "Ocean Apparel",
      country: "US",
      currency: "USD",
      paymentTerms: "30% advance; 70% before shipment",
      salesTeamId: ids.team,
      ownerId: ids.sales,
      isActive: true,
      ...timestamps,
    });
    await insert("customer_contacts", {
      id: ids.contact,
      customerId: ids.customer,
      name: "Ocean Purchasing",
      email: "purchasing@example.com",
      isPrimary: true,
      isActive: true,
    });
    for (const [key, type] of [
      ["billing", "billing"],
      ["shipping", "shipping"],
    ])
      await insert("customer_addresses", {
        id: ids[key],
        customerId: ids.customer,
        addressType: type,
        line1: "100 Ocean Avenue",
        city: "New York",
        postalCode: "10001",
        country: "US",
        isDefault: true,
        isActive: true,
      });
    await insert("styles", {
      id: ids.style,
      code: "TS-100",
      name: "Cotton T-shirt",
      fabricDescription: "100% cotton",
      gsm: 180,
      uom: "PCS",
      isActive: true,
      ...timestamps,
    });
    let variant = 1;
    for (const colour of ["Navy", "White"])
      for (const size of ["S", "M", "L"])
        await insert("style_variants", {
          id: `70000000-0000-4000-8000-${String(variant++).padStart(12, "0")}`,
          styleId: ids.style,
          colour,
          size,
          isActive: true,
        });
  });
  return ids;
}
export function demoInput() {
  const today = businessDate();
  const future = (days) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return {
    customerId: ids.customer,
    salesTeamId: ids.team,
    ownerId: ids.sales,
    currency: "USD",
    quotationDate: today,
    validUntil: future(15),
    requestedDeliveryDate: future(45),
    billingAddressId: ids.billing,
    shippingAddressId: ids.shipping,
    paymentTerms: "30% advance; 70% before shipment",
    notes: "Internal: Pack by colour and size",
    lines: ["Navy", "White"].flatMap((colour) =>
      ["S", "M", "L"].map((size) => ({
        styleId: ids.style,
        colour,
        size,
        qty: size === "L" ? 100 : 200,
        unitPrice: "5.50",
      })),
    ),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is development-only");
  const context = createQuotationContext();
  try {
    await seedDemo(context);
    console.log(
      "Development seed ready; fixed IDs documented in docs/quotations.md",
    );
  } finally {
    await context.close();
  }
}
