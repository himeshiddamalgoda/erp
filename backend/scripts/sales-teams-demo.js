import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { demoIds as ids } from "../src/middleware/auth-context.js";
import { salesTeamDemoIds } from "../src/db/seeders/sales-teams-demo.js";
import { customerDemoInput } from "../src/db/seeders/customers-demo.js";
import { demoInput } from "../src/db/seeders/demo.js";
const base = process.env.ADMIN_API_URL || "http://127.0.0.1:4102/api/v1";
async function call(method, path, body, key, expected = 200) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  assert.equal(r.status, expected, `${r.status} ${JSON.stringify(json)}`);
  return json;
}
const key = randomUUID(),
  input = {
    name: "Export Sales · HTTP Demo",
    description: "Demonstrates explicit assignment resolution",
    managerId: ids.manager,
    memberIds: [ids.manager, ids.sales, salesTeamDemoIds.merchandiserB],
  };
let team = (await call("POST", "/sales-teams", input, key, 201)).data;
const replay = (
  await call(
    "POST",
    "/sales-teams",
    { ...input, memberIds: [...input.memberIds].reverse() },
    key,
    201,
  )
).data;
assert.equal(replay.id, team.id);
console.log("Created/replayed", team.code, team.id, "version", team.version);
team = (
  await call("PATCH", `/sales-teams/${team.id}`, {
    version: team.version,
    description: "Reviewed export responsibilities",
  })
).data;
let customer = (
  await call(
    "POST",
    "/customers",
    {
      ...customerDemoInput(),
      name: "Ocean Apparel · Teams HTTP Demo",
      salesTeamId: team.id,
      ownerId: ids.sales,
    },
    randomUUID(),
    201,
  )
).data;
let quote = (
  await call(
    "POST",
    "/quotations",
    {
      ...demoInput(),
      customerId: customer.id,
      salesTeamId: team.id,
      ownerId: ids.sales,
      billingAddressId: customer.addresses.find(
        (a) => a.addressType === "billing",
      ).id,
      shippingAddressId: customer.addresses.find(
        (a) => a.addressType === "shipping" && a.isDefault,
      ).id,
    },
    undefined,
    201,
  )
).data;
const {
  quotationDate,
  validUntil: _validUntil,
  notes: _notes,
  ...orderInput
} = demoInput();
let order = (
  await call(
    "POST",
    "/sales-orders",
    {
      ...orderInput,
      orderDate: quotationDate,
      customerId: customer.id,
      salesTeamId: team.id,
      ownerId: ids.sales,
      billingAddressId: customer.addresses.find(
        (a) => a.addressType === "billing",
      ).id,
      shippingAddressId: customer.addresses.find(
        (a) => a.addressType === "shipping" && a.isDefault,
      ).id,
      buyerPoNumber: "TEAM-DEMO-" + randomUUID(),
    },
    randomUUID(),
    201,
  )
).data;
const desired = [ids.manager, salesTeamDemoIds.merchandiserB],
  changes = {
    version: team.version,
    memberIds: desired,
    reason: "Merchandiser A moving teams",
  };
const blocked = await call(
  "PATCH",
  `/sales-teams/${team.id}`,
  changes,
  undefined,
  409,
);
assert.equal(blocked.error.code, "MEMBER_HAS_ACTIVE_ASSIGNMENTS");
console.log("Removal correctly blocked", blocked.error.details.blockerCount);
for (const [entityType, entity] of [
  ["customer", customer],
  ["quotation", quote],
  ["salesOrder", order],
])
  await call("POST", "/assignments/reassign", {
    entityType,
    entityId: entity.id,
    salesTeamId: team.id,
    ownerId: salesTeamDemoIds.merchandiserB,
    version: entity.version,
    reason: "Resolve member assignments explicitly",
  });
team = (await call("PATCH", `/sales-teams/${team.id}`, changes)).data;
console.log("Removed idle member; version", team.version);
const target = (
  await call(
    "POST",
    "/sales-teams",
    {
      name: "Regional Sales · HTTP Demo",
      managerId: ids.manager,
      memberIds: desired,
    },
    randomUUID(),
    201,
  )
).data;
customer = (await call("GET", `/customers/${customer.id}`)).data;
quote = (await call("GET", `/quotations/${quote.id}`)).data;
order = (await call("GET", `/sales-orders/${order.id}`)).data;
for (const [entityType, entity] of [
  ["customer", customer],
  ["quotation", quote],
  ["salesOrder", order],
])
  await call("POST", "/assignments/reassign", {
    entityType,
    entityId: entity.id,
    salesTeamId: target.id,
    ownerId: salesTeamDemoIds.merchandiserB,
    version: entity.version,
    reason: "Resolve team archive assignments explicitly",
  });
team = (
  await call("POST", `/sales-teams/${team.id}/archive`, {
    version: team.version,
    reason: "Merged into regional sales",
  })
).data;
assert.equal(team.status, "Archived");
team = (
  await call("PATCH", `/sales-teams/${team.id}`, {
    version: team.version,
    name: "Export Sales · repaired profile",
  })
).data;
assert.equal(team.status, "Archived");
team = (
  await call("POST", `/sales-teams/${team.id}/reactivate`, {
    version: team.version,
    reason: "Export operation resumed",
  })
).data;
assert.equal(team.status, "Active");
const list = await call(
  "GET",
  "/sales-teams?q=" + encodeURIComponent(team.code),
);
assert.equal(list.meta.total, 1);
team = (
  await call("GET", `/sales-teams/${team.id}?includeInactiveMembers=true`)
).data;
assert.equal(
  team.members.find((m) => m.userId === ids.sales).membershipActive,
  false,
);
console.log(
  "Verified all six Team APIs + directory/reassignment dependencies; final version",
  team.version,
);
const users = await call("GET", "/users?status=Active&managerEligible=true");
assert.ok(users.data.some((u) => u.id === ids.manager));
