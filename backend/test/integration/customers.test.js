import {
  seedCustomers,
  customerDemoIds,
} from "../../src/db/seeders/customers-demo.js";
import { createFulfilmentAdapter } from "../../src/modules/sales-orders/sales-order-fulfilment.service.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createSequelize } from "../../src/db/sequelize.js";
import { createQuotationContext } from "../../src/db/context.js";
import { migrate } from "../../src/db/migrate.js";
import { seedDemo, demoInput } from "../../src/db/seeders/demo.js";
import { demoIds as ids } from "../../src/middleware/auth-context.js";
import { env } from "../../src/config/env.js";
import { createApp } from "../../src/app.js";
import {
  parse,
  patchSchema,
} from "../../src/modules/customers/customer.schemas.js";
import {
  parse as parseOrder,
  createSchema as orderCreate,
} from "../../src/modules/sales-orders/sales-order.schemas.js";
const database = process.env.TEST_DB_NAME;
if (
  database &&
  (!/^[a-zA-Z0-9_]+_test$/.test(database) ||
    database === (process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp"))
)
  throw new Error("Refusing unsafe Customers test database");
const input = () => ({
  name: "Ocean Apparel (Pvt) Ltd",
  displayName: "Ocean Apparel",
  country: "LK",
  currency: "USD",
  paymentTerms: "30% advance; 70% before shipment",
  salesTeamId: ids.team,
  ownerId: ids.sales,
  email: "Office@EXAMPLE.TEST",
  internalNotes: "Staff only",
  contacts: [
    { name: "Nimal Silva", email: "buyer@example.test", primary: true },
  ],
  addresses: [
    {
      addressType: "billing",
      line1: "14 Sample Road",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
    {
      addressType: "shipping",
      label: "Warehouse A",
      line1: "25 Sample Road",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
    {
      addressType: "shipping",
      label: "Warehouse B",
      line1: "8 Industrial Road",
      city: "Gampaha",
      country: "LK",
    },
  ],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test(
  "MySQL Customers integration",
  {
    skip: database
      ? false
      : "Set TEST_DB_NAME to an isolated MySQL database ending in _test",
  },
  async (t) => {
    const development = env.developmentAuth;
    env.developmentAuth = false;
    t.after(() => {
      env.developmentAuth = development;
    });
    const db = createSequelize({ database }),
      ctx = createQuotationContext(db),
      m = ctx.models,
      s = ctx.customers;
    await migrate(db);
    await seedDemo(ctx);
    t.after(() => db.close());
    const actors = {
      admin: { id: ids.admin, role: "Admin", salesTeamIds: [] },
      sales: { id: ids.sales, role: "Sales", salesTeamIds: [ids.team] },
      manager: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [ids.team],
      },
      viewer: { id: ids.viewer, role: "Viewer", salesTeamIds: [ids.team] },
      outsider: { id: ids.sales, role: "Sales", salesTeamIds: [randomUUID()] },
      master: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [ids.team],
        capabilities: ["customers:write", "customers:assign"],
      },
    };
    const app = createApp({
      quotations: ctx,
      database: { check: () => db.authenticate() },
      principalMiddleware: (req, _res, next) => {
        req.user = actors[req.get("X-Test-Actor")];
        next();
      },
    });
    const call = (method, path = "", actor = "admin") =>
      request(app)
        [method]("/api/v1/customers" + path)
        .set("X-Test-Actor", actor);
    const create = async (
      changes = {},
      actor = "admin",
      key = randomUUID(),
    ) => {
      const r = await call("post", "", actor)
        .set("Idempotency-Key", key)
        .send({ ...input(), ...changes });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.data;
    };
    const detail = async (c, inactive = true) => {
      const r = await call(
        "get",
        `/${c.id}?includeInactiveChildren=${inactive}`,
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.data;
    };
    const patch = async (c, extra, expected = 200) => {
      const r = await call("patch", "/" + c.id).send({
        version: c.version,
        ...extra,
      });
      assert.equal(r.status, expected, JSON.stringify(r.body));
      return r;
    };
    const life = async (c, action, expected = 200, actor = "admin") => {
      const r = await call("post", `/${c.id}/${action}`, actor).send({
        version: c.version,
        reason: "Test buyer lifecycle",
      });
      assert.equal(r.status, expected, JSON.stringify(r.body));
      return r;
    };
    const quote = async (c) =>
      ctx.service.create(
        actors.sales,
        {
          ...demoInput(),
          customerId: c.id,
          billingAddressId: c.addresses.find((x) => x.addressType === "billing")
            .id,
          shippingAddressId: c.addresses.find((x) => x.label === "Warehouse A")
            .id,
        },
        "customer-test",
      );
    const direct = async (c) => {
      const { quotationDate, validUntil: _valid, notes, ...rest } = demoInput();
      return (
        await ctx.salesOrders.create(
          actors.sales,
          parseOrder(orderCreate, {
            ...rest,
            orderDate: quotationDate,
            buyerPoNumber: "CUSTOMER-" + randomUUID(),
            customerId: c.id,
            billingAddressId: c.addresses.find(
              (x) => x.addressType === "billing",
            ).id,
            shippingAddressId: c.addresses.find(
              (x) => x.label === "Warehouse A",
            ).id,
          }),
          randomUUID(),
          "customer-test",
        )
      ).body.data;
    };
    await t.test(
      "deterministic demo seeding preserves stable IDs, edits and row counts",
      async () => {
        await seedCustomers(ctx);
        const original = (
          await m.customers.findByPk(customerDemoIds.customer)
        ).toJSON();
        const count = await m.customers.count();
        await seedCustomers(ctx);
        assert.equal(await m.customers.count(), count);
        assert.deepEqual(
          (await m.customers.findByPk(customerDemoIds.customer)).toJSON(),
          original,
        );
        assert.equal(
          await m.customer_addresses.count({
            where: { customerId: customerDemoIds.customer },
          }),
          3,
        );
      },
    );
    await t.test(
      "create, mapped fields, exactly six routes and minimal list",
      async () => {
        const c = await create();
        assert.match(c.code, /^CUS-\d{6,}$/);
        assert.equal(c.status, "Active");
        assert.equal(c.email, "Office@example.test");
        assert.equal(c.contacts[0].primary, true);
        assert.equal(c.addresses.length, 3);
        assert.equal(c.version, 1);
        assert.equal(c.createdBy, ids.admin);
        assert.equal(c.commercialSummary.canArchive, true);
        const list = await call("get", "?q=" + c.code);
        assert.equal(list.status, 200);
        assert.equal(list.body.meta.total, 1);
        assert.equal(list.body.data[0].contacts, undefined);
        assert.equal(list.body.data[0].internalNotes, undefined);
        assert.equal(c.contacts[0].activePrimarySlot, undefined);
        assert.equal((await call("delete", "/" + c.id)).status, 404);
        assert.equal(
          (await call("post", "/" + c.id + "/contacts")).status,
          404,
        );
      },
    );
    await t.test(
      "reject invalid primaries/defaults, channels, immutable/protected fields",
      async () => {
        const base = input();
        for (const changes of [
          { contacts: [{ ...base.contacts[0], primary: false }] },
          {
            contacts: [
              base.contacts[0],
              { ...base.contacts[0], name: "Other" },
            ],
          },
          {
            addresses: base.addresses.map((x) => ({ ...x, isDefault: false })),
          },
          { contacts: [{ name: "No channel", primary: true }] },
          { addresses: [...base.addresses, { ...base.addresses[0] }] },
          { code: "INJECTED" },
          { status: "Archived" },
          { country: "ZZ" },
          { currency: "JPY" },
          { website: "file:///tmp/private" },
          { website: "not a URL" },
          { phone: "123" },
        ]) {
          const r = await call("post")
            .set("Idempotency-Key", randomUUID())
            .send({ ...base, ...changes });
          assert.equal(r.status, 422, JSON.stringify(r.body));
        }
        const c = await create();
        for (const changes of [
          { code: "X" },
          { isActive: false },
          { createdBy: ids.sales },
          { archiveReason: "bad" },
          { version: 0 },
        ])
          await patch(c, changes, 422);
      },
    );
    await t.test(
      "MySQL generated uniqueness and inactive flag guards",
      async () => {
        const c = await create();
        await assert.rejects(
          m.customer_contacts.create({
            id: randomUUID(),
            customerId: c.id,
            name: "Duplicate",
            email: "a@example.test",
            isPrimary: true,
            isActive: true,
          }),
          (e) => e.name === "SequelizeUniqueConstraintError",
        );
        await assert.rejects(
          m.customer_addresses.create({
            id: randomUUID(),
            customerId: c.id,
            addressType: "shipping",
            line1: "X",
            city: "C",
            country: "LK",
            isDefault: true,
            isActive: true,
          }),
          (e) => e.name === "SequelizeUniqueConstraintError",
        );
        await assert.rejects(
          m.customer_contacts.update(
            { isActive: false },
            { where: { id: c.contacts[0].id } },
          ),
        );
      },
    );
    await t.test(
      "stable merge, omitted flags, empty changes and no-op stale check",
      async () => {
        let c = await create();
        const count = await m.audit_events.count({
            where: { entityType: "customer", entityId: c.id },
          }),
          old = c.contacts[0];
        let r = await patch(c, { contacts: [{ id: old.id }], addresses: [] });
        assert.equal(r.body.data.version, 1);
        assert.equal(
          await m.audit_events.count({
            where: { entityType: "customer", entityId: c.id },
          }),
          count,
        );
        c = (
          await patch(c, { contacts: [{ id: old.id, jobTitle: "Lead buyer" }] })
        ).body.data;
        assert.equal(c.contacts[0].id, old.id);
        assert.equal(c.contacts[0].primary, true);
        assert.equal(c.contacts[0].isActive, true);
        assert.equal(c.addresses.length, 3);
        assert.equal(c.version, 2);
        assert.equal(
          (await patch({ ...c, version: 1 }, { contacts: [] }, 409)).body.error
            .code,
          "STALE_VERSION",
        );
      },
    );
    await t.test(
      "primary/default swaps and deactivation preserve old history",
      async () => {
        let c = await create();
        const old = c.contacts[0],
          a = c.addresses.find((x) => x.label === "Warehouse A"),
          b = c.addresses.find((x) => x.label === "Warehouse B");
        c = (
          await patch(c, {
            contacts: [
              { id: old.id, primary: false, isActive: false },
              {
                name: "Amali Perera",
                email: "amali@example.test",
                primary: true,
              },
            ],
            addresses: [
              { id: a.id, isDefault: false },
              { id: b.id, isDefault: true },
            ],
          })
        ).body.data;
        assert.equal(c.version, 2);
        assert.equal(c.contacts.find((x) => x.id === old.id).isActive, false);
        assert.equal(c.addresses.find((x) => x.id === b.id).isDefault, true);
        assert.equal((await detail(c, false)).contacts.length, 1);
        await patch(c, { addresses: [{ id: b.id, isDefault: false }] }, 422);
        assert.equal((await detail(c)).version, 2);
      },
    );
    await t.test(
      "duplicate/cross-customer child references and immutable address type rejected",
      async () => {
        const a = await create(),
          b = await create();
        for (const contacts of [
          [{ id: b.contacts[0].id, name: "Attack" }],
          [{ id: a.contacts[0].id }, { id: a.contacts[0].id }],
        ])
          assert.equal(
            (await patch(a, { contacts }, 422)).body.error.code,
            "INVALID_CHILD_REFERENCE",
          );
        await patch(
          a,
          {
            addresses: [
              {
                id: a.addresses[0].id,
                addressType:
                  a.addresses[0].addressType === "billing"
                    ? "shipping"
                    : "billing",
              },
            ],
          },
          422,
        );
        assert.equal((await detail(a)).version, 1);
      },
    );
    await t.test(
      "injected child/audit failures roll back cleared slots and parent changes",
      async () => {
        const c = await create(),
          a = c.addresses.find((x) => x.label === "Warehouse A"),
          b = c.addresses.find((x) => x.label === "Warehouse B");
        for (const stage of ["audit", "updateWhere"]) {
          const original = s.r[stage];
          s.r[stage] = async (...args) => {
            if (
              stage === "audit" ||
              (args[0] === "customer_addresses" && args[1].line1)
            )
              throw new Error("injected failure");
            return original.apply(s.r, args);
          };
          try {
            await patch(
              c,
              {
                name: "Changed",
                addresses: [
                  { id: a.id, isDefault: false },
                  { id: b.id, isDefault: true },
                ],
              },
              500,
            );
          } finally {
            s.r[stage] = original;
          }
          const after = await detail(c);
          assert.equal(after.name, c.name);
          assert.equal(after.version, 1);
          assert.equal(
            after.addresses.find((x) => x.id === a.id).isDefault,
            true,
          );
        }
      },
    );
    await t.test(
      "concurrent PATCH yields one complete winner and one stale loser",
      async () => {
        const c = await create();
        const results = await Promise.all(
          ["First buyer", "Second buyer"].map((name) =>
            call("patch", "/" + c.id).send({
              version: 1,
              name,
              contacts: [{ id: c.contacts[0].id, jobTitle: name }],
            }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const final = await detail(c);
        assert.equal(final.version, 2);
        assert.equal(final.name, final.contacts[0].jobTitle);
      },
    );
    await t.test(
      "concurrent codes and canonical idempotent replay",
      async () => {
        const key = randomUUID(),
          body = input(),
          replies = await Promise.all([
            call("post").set("Idempotency-Key", key).send(body),
            call("post")
              .set("Idempotency-Key", key)
              .send(Object.fromEntries(Object.entries(body).reverse())),
          ]);
        assert.deepEqual(
          replies.map((x) => x.status),
          [201, 201],
        );
        assert.deepEqual(replies[0].body, replies[1].body);
        const changed = await call("post")
          .set("Idempotency-Key", key)
          .send({ ...body, name: "Different buyer" });
        assert.equal(changed.status, 409);
        assert.equal(changed.body.error.code, "IDEMPOTENCY_KEY_REUSED");
        const cs = await Promise.all(Array.from({ length: 5 }, () => create()));
        assert.equal(new Set(cs.map((x) => x.code)).size, 5);
      },
    );
    await t.test(
      "create rollback includes children, audit and idempotency reservation",
      async () => {
        for (const stage of ["insertMany", "audit", "save"]) {
          const key = randomUUID(),
            before = await m.customers.count(),
            original = s.r[stage];
          s.r[stage] = async (...args) => {
            if (stage !== "save" || args[0]?.constructor === m.idempotency_keys)
              throw new Error("injected " + stage);
            return original.apply(s.r, args);
          };
          try {
            const r = await call("post")
              .set("Idempotency-Key", key)
              .send(input());
            assert.equal(r.status, 500);
            assert.equal(r.body.error.message, "Internal server error");
          } finally {
            s.r[stage] = original;
          }
          assert.equal(await m.customers.count(), before);
          assert.equal(
            await m.idempotency_keys.count({
              where: {
                actorId: ids.admin,
                operation: "customers:create",
                idempotencyKey: key,
              },
            }),
            0,
          );
        }
      },
    );
    await t.test(
      "archive blocks each open quotation status, stale expiry and nonlatest revision",
      async () => {
        for (const status of [
          "Draft",
          "PendingApproval",
          "Approved",
          "Issued",
          "Accepted",
        ]) {
          const c = await create(),
            q = await quote(c);
          await m.quotations.update(
            {
              status,
              ...(status === "Issued"
                ? { quotationDate: "1999-12-01", validUntil: "2000-01-01" }
                : {}),
            },
            { where: { id: q.id } },
          );
          const r = await life(c, "archive", 409);
          assert.equal(r.body.error.code, "CUSTOMER_HAS_OPEN_DOCUMENTS");
          assert.equal(r.body.error.details.blockerCount, 1);
          if (status === "Issued")
            assert.equal(
              r.body.error.details.archiveBlockers[0].validityEnded,
              true,
            );
          assert.equal((await detail(c)).version, 1);
        }
        const c = await create(),
          q = await quote(c),
          row = await m.quotations.findByPk(q.id);
        await m.quotations.create({
          ...row.toJSON(),
          id: randomUUID(),
          revisionNo: 2,
          status: "Cancelled",
        });
        assert.equal(
          (await life(c, "archive", 409)).body.error.details.blockerCount,
          1,
        );
      },
    );
    await t.test(
      "Draft orders block; confirmed and resolved/deleted documents permit archive",
      async () => {
        let c = await create();
        const o = await direct(c);
        assert.equal(
          (await life(c, "archive", 409)).body.error.details.draftOrderCount,
          1,
        );
        await ctx.salesOrders.confirm(
          actors.manager,
          o.id,
          { version: o.version },
          randomUUID(),
          "customer-test",
        );
        const snapshot = (await m.sales_orders.findByPk(o.id)).customerSnapshot;
        c = (await life(c, "archive")).body.data;
        assert.equal(c.status, "Archived");
        assert.equal(c.commercialSummary.activeOrderCount, 1);
        assert.deepEqual(
          (await m.sales_orders.findByPk(o.id)).customerSnapshot,
          snapshot,
        );
        for (const status of [
          "Declined",
          "Expired",
          "Superseded",
          "Cancelled",
          "Converted",
        ]) {
          const buyer = await create(),
            q = await quote(buyer);
          await m.quotations.update({ status }, { where: { id: q.id } });
          await life(buyer, "archive");
        }
        const buyer = await create(),
          q = await quote(buyer);
        await m.quotations.update(
          { deletedAt: new Date() },
          { where: { id: q.id } },
        );
        await life(buyer, "archive");
      },
    );
    await t.test(
      "archived profile repair and reactivation require valid active ownership",
      async () => {
        let c = await create();
        c = (await life(c, "archive")).body.data;
        assert.equal(c.archivedBy, ids.admin);
        assert.ok(c.archivedAt);
        await life(c, "archive", 409);
        await m.users.update({ isActive: false }, { where: { id: ids.sales } });
        try {
          await life(c, "reactivate", 422);
          c = (await patch(c, { displayName: "Archived repair" })).body.data;
          assert.equal(c.status, "Archived");
          c = (
            await patch(c, {
              salesTeamId: ids.team,
              ownerId: ids.manager,
              reason: "Replace inactive owner",
            })
          ).body.data;
          c = (await life(c, "reactivate")).body.data;
          assert.equal(c.status, "Active");
          assert.equal(c.archivedAt, null);
          assert.equal(c.archiveReason, null);
        } finally {
          await m.users.update(
            { isActive: true },
            { where: { id: ids.sales } },
          );
        }
        const events = await m.audit_events.findAll({
          where: { entityType: "customer", entityId: c.id },
        });
        for (const action of [
          "CustomerArchived",
          "CustomerReactivated",
          "OwnershipChanged",
        ])
          assert.ok(events.some((x) => x.action === action));
        await life(c, "reactivate", 409);
      },
    );
    await t.test(
      "ownership/default edits never mutate documents or snapshots",
      async () => {
        const c = await create(),
          q = await quote(c),
          o = await direct(c),
          oldQ = (await m.quotations.findByPk(q.id)).toJSON(),
          oldO = (await m.sales_orders.findByPk(o.id)).toJSON();
        await patch(c, { ownerId: ids.manager }, 422);
        await patch(c, { salesTeamId: ids.team, ownerId: ids.manager }, 422);
        await patch(c, {
          salesTeamId: ids.team,
          ownerId: ids.manager,
          reason: "New merchandiser",
          currency: "EUR",
          paymentTerms: "Net 30",
          name: "Renamed buyer",
          addresses: [{ id: c.addresses[0].id, line1: "Edited live text" }],
        });
        assert.deepEqual((await m.quotations.findByPk(q.id)).toJSON(), oldQ);
        assert.deepEqual((await m.sales_orders.findByPk(o.id)).toJSON(), oldO);
      },
    );
    await t.test(
      "address deactivation checks billing/shipping Draft references in both modules",
      async () => {
        for (const kind of ["quotation", "order"])
          for (const type of ["billing", "shipping"]) {
            let c = await create();
            const doc = kind === "quotation" ? await quote(c) : await direct(c),
              old = c.addresses.find(
                (x) => x.addressType === type && x.isDefault,
              );
            c = (
              await patch(c, {
                addresses: [
                  {
                    addressType: type,
                    line1: "Replacement",
                    city: "Colombo",
                    country: "LK",
                  },
                ],
              })
            ).body.data;
            const replacement = c.addresses.find(
                (x) => x.line1 === "Replacement",
              ),
              changes = {
                addresses: [
                  { id: old.id, isDefault: false, isActive: false },
                  { id: replacement.id, isDefault: true },
                ],
              };
            assert.equal(
              (await patch(c, changes, 409)).body.error.code,
              "ADDRESS_IN_USE",
            );
            await m[
              kind === "quotation" ? "quotations" : "sales_orders"
            ].update({ status: "Cancelled" }, { where: { id: doc.id } });
            assert.equal(
              (await patch(c, changes)).body.data.addresses.find(
                (x) => x.id === old.id,
              ).isActive,
              false,
            );
          }
      },
    );
    await t.test(
      "frozen order snapshot survives address deactivation",
      async () => {
        const c = await create(),
          o = await direct(c);
        await ctx.salesOrders.confirm(
          actors.manager,
          o.id,
          { version: 1 },
          randomUUID(),
          "customer-test",
        );
        const before = (await m.sales_orders.findByPk(o.id)).toJSON(),
          a = c.addresses.find((x) => x.label === "Warehouse A"),
          b = c.addresses.find((x) => x.label === "Warehouse B");
        await patch(c, {
          addresses: [
            { id: a.id, isActive: false, isDefault: false },
            { id: b.id, isDefault: true },
          ],
        });
        assert.deepEqual(
          (await m.sales_orders.findByPk(o.id)).toJSON(),
          before,
        );
      },
    );
    await t.test("role/team scoping and replay authorization", async () => {
      const c = await create();
      const lookups = await request(app)
        .get("/api/v1/reference-data/quotation-options")
        .set("X-Test-Actor", "master");
      assert.equal(lookups.status, 200);
      assert.deepEqual(lookups.body.data.actor.capabilities, [
        "customers:write",
        "customers:assign",
      ]);
      assert.deepEqual(lookups.body.data.company.countries, env.countries);

      for (const role of ["sales", "manager", "viewer"]) {
        assert.equal((await call("get", "/" + c.id, role)).status, 200);
        assert.equal(
          (
            await call("patch", "/" + c.id, role).send({
              version: 1,
              name: "Forbidden",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call("post", "", role)
              .set("Idempotency-Key", randomUUID())
              .send(input())
          ).status,
          403,
        );
      }
      assert.equal((await call("get", "/" + c.id, "outsider")).status, 404);
      assert.equal(
        (await call("get", "?q=" + c.code, "outsider")).body.meta.total,
        0,
      );
      assert.equal((await call("get", "", "missing")).status, 401);
      const key = randomUUID();
      await create({}, "master", key);
      actors.master.salesTeamIds = [];
      try {
        assert.equal(
          (
            await call("post", "", "master")
              .set("Idempotency-Key", key)
              .send(input())
          ).status,
          404,
        );
      } finally {
        actors.master.salesTeamIds = [ids.team];
      }
    });
    await t.test(
      "restricted blockers hidden; total prevents archive and examples bounded to twenty",
      async () => {
        const c = await create(),
          other = randomUUID();
        await m.sales_teams.create({
          id: other,
          code: "T-" + other.slice(0, 8),
          name: "Restricted",
          managerId: ids.manager,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const q = await quote(c);
        await m.quotations.update(
          { salesTeamId: other },
          { where: { id: q.id } },
        );
        const r = await life(c, "archive", 409, "master");
        assert.equal(r.body.error.details.blockerCount, 1);
        assert.deepEqual(r.body.error.details.archiveBlockers, []);
        assert.equal(r.body.error.details.restrictedBlockers, true);
        assert.equal(r.body.error.details.openQuotationCount, 0);
        assert.ok(!JSON.stringify(r.body).includes(q.id));
        assert.equal(
          (await call("get", "/" + c.id, "master")).body.data.commercialSummary
            .canArchive,
          false,
        );
        const q2 = await quote(c),
          row = (await m.quotations.findByPk(q2.id)).toJSON();
        for (let i = 2; i <= 23; i++)
          await m.quotations.create({
            ...row,
            id: randomUUID(),
            revisionNo: i,
          });
        const d = await detail(c);
        assert.equal(d.commercialSummary.blockerCount, 24);
        assert.equal(d.commercialSummary.archiveBlockers.length, 20);
      },
    );
    await t.test(
      "literal wildcard search, empty/filter/pagination and malformed requests",
      async () => {
        const c = await create({ name: "Literal %_" + randomUUID() });
        assert.ok(
          (await call("get", "?q=" + encodeURIComponent("%_"))).body.data.some(
            (x) => x.id === c.id,
          ),
        );
        assert.equal(
          (await call("get", "?q=" + randomUUID())).body.meta.total,
          0,
        );
        assert.equal(
          (
            await call(
              "get",
              "?country=LK&currency=USD&pageSize=1&sortBy=code&sortOrder=desc",
            )
          ).body.data.length,
          1,
        );
        for (const query of [
          "pageSize=101",
          "page=0",
          "sortBy=internalNotes",
          "status=Deleted",
          "foo=bar",
        ])
          assert.equal((await call("get", "?" + query)).status, 400);
        assert.equal((await call("get", "/bad-id")).status, 400);
        assert.equal((await call("post").send(input())).status, 400);
        assert.equal(
          (
            await call("post")
              .set("Content-Type", "application/json")
              .send("{bad")
          ).status,
          400,
        );
      },
    );
    await t.test(
      "archived buyer rejected by new quotation and direct order creation",
      async () => {
        const c = await create();
        await life(c, "archive");
        await assert.rejects(quote(c), (e) => e.status === 422);
        await assert.rejects(direct(c), (e) => e.status === 422);
      },
    );
    await t.test(
      "Draft writer wins: waiting archive sees committed blocker under READ COMMITTED",
      async () => {
        const c = await create(),
          entered = deferred(),
          release = deferred(),
          original = ctx.service.masters;
        let once = true;
        ctx.service.masters = async function (...args) {
          const result = await original.apply(this, args);
          if (once && args[0].customerId === c.id && args[4] !== false) {
            once = false;
            entered.resolve();
            await release.promise;
          }
          return result;
        };
        const writing = quote(c);
        await entered.promise;
        const archiving = s.lifecycle(
          actors.admin,
          c.id,
          "archive",
          { version: 1, reason: "Race check" },
          "test",
        );
        release.resolve();
        try {
          await writing;
          await assert.rejects(
            archiving,
            (e) => e.code === "CUSTOMER_HAS_OPEN_DOCUMENTS",
          );
        } finally {
          ctx.service.masters = original;
          release.resolve();
        }
      },
    );
    await t.test(
      "archive wins: waiting writer rechecks activity after commit",
      async () => {
        const c = await create(),
          entered = deferred(),
          release = deferred(),
          original = s.r.documents;
        let once = true;
        s.r.documents = async function (...args) {
          const result = await original.apply(this, args);
          if (once && args[0] === c.id) {
            once = false;
            entered.resolve();
            await release.promise;
          }
          return result;
        };
        const archiving = s.lifecycle(
          actors.admin,
          c.id,
          "archive",
          { version: 1, reason: "Race check" },
          "test",
        );
        await entered.promise;
        const writing = quote(c);
        release.resolve();
        try {
          await archiving;
          await assert.rejects(writing, (e) => e.status === 422);
        } finally {
          s.r.documents = original;
          release.resolve();
        }
      },
    );
    await t.test(
      "address deactivation wins: waiting Draft writer rejects old address",
      async () => {
        const c = await create(),
          a = c.addresses.find((x) => x.label === "Warehouse A"),
          b = c.addresses.find((x) => x.label === "Warehouse B"),
          entered = deferred(),
          release = deferred(),
          original = s.r.documents;
        let once = true;
        s.r.documents = async function (...args) {
          const result = await original.apply(this, args);
          if (once && args[0] === c.id) {
            once = false;
            entered.resolve();
            await release.promise;
          }
          return result;
        };
        const updating = s.patch(
          actors.admin,
          c.id,
          parse(patchSchema, {
            version: 1,
            addresses: [
              { id: a.id, isActive: false, isDefault: false },
              { id: b.id, isDefault: true },
            ],
          }),
          "test",
        );
        await entered.promise;
        const writing = quote(c);
        release.resolve();
        try {
          await updating;
          await assert.rejects(writing, (e) => e.status === 422);
        } finally {
          s.r.documents = original;
          release.resolve();
        }
      },
    );
    await t.test(
      "confirmed fulfilment continues after customer archive",
      async () => {
        const c = await create(),
          o = await direct(c);
        await ctx.salesOrders.confirm(
          actors.manager,
          o.id,
          { version: 1 },
          randomUUID(),
          "test",
        );
        await life(c, "archive");
        const credential = Symbol("trusted-test-integration");
        const adapter = createFulfilmentAdapter(ctx.salesOrders, {
          authorizeIntegration: (value) =>
            value === credential
              ? { provider: "customer-test", source: "integration" }
              : null,
        });
        const result = await adapter.applyFulfilmentEvent(credential, {
          orderId: o.id,
          provider: "customer-test",
          externalEventId: randomUUID(),
          eventType: "DeliveryConfirmed",
          occurredAt: new Date().toISOString(),
          lines: o.lines.map((l) => ({ orderLineId: l.id, qty: l.qty })),
        });
        assert.equal(result.status, "Delivered");
        assert.equal((await detail(c)).status, "Archived");
      },
    );
    await t.test(
      "write capability does not implicitly grant assignment permission",
      async () => {
        const c = await create();
        actors.master.capabilities = ["customers:write"];
        try {
          const response = await call("patch", "/" + c.id, "master").send({
            version: 1,
            salesTeamId: ids.team,
            ownerId: ids.manager,
            reason: "Assignment attempt",
          });
          assert.equal(response.status, 403);
          assert.equal((await detail(c)).ownerId, ids.sales);
        } finally {
          actors.master.capabilities = ["customers:write", "customers:assign"];
        }
      },
    );
    await t.test(
      "Draft writer wins address race and blocks later deactivation",
      async () => {
        const c = await create(),
          a = c.addresses.find((x) => x.label === "Warehouse A"),
          b = c.addresses.find((x) => x.label === "Warehouse B"),
          entered = deferred(),
          release = deferred(),
          original = ctx.service.masters;
        let once = true;
        ctx.service.masters = async function (...args) {
          const result = await original.apply(this, args);
          if (once && args[0].customerId === c.id && args[4] !== false) {
            once = false;
            entered.resolve();
            await release.promise;
          }
          return result;
        };
        const writing = quote(c);
        await entered.promise;
        const disabling = s.patch(
          actors.admin,
          c.id,
          parse(patchSchema, {
            version: 1,
            addresses: [
              { id: a.id, isDefault: false, isActive: false },
              { id: b.id, isDefault: true },
            ],
          }),
          "test",
        );
        const rejected = assert.rejects(
          disabling,
          (e) => e.code === "ADDRESS_IN_USE",
        );
        release.resolve();
        try {
          await Promise.all([writing, rejected]);
          assert.equal(
            (await detail(c)).addresses.find((x) => x.id === a.id).isActive,
            true,
          );
        } finally {
          ctx.service.masters = original;
          release.resolve();
        }
      },
    );
    await t.test(
      "order confirmation releases Draft blocker, conversion leaves Draft order blocker",
      async () => {
        const c = await create(),
          o = await direct(c),
          entered = deferred(),
          release = deferred(),
          original = ctx.salesOrders.masters;
        let once = true;
        ctx.salesOrders.masters = async function (...args) {
          const result = await original.apply(this, args);
          if (once && args[0].customerId === c.id) {
            once = false;
            entered.resolve();
            await release.promise;
          }
          return result;
        };
        const confirming = ctx.salesOrders.confirm(
          actors.manager,
          o.id,
          { version: 1 },
          randomUUID(),
          "test",
        );
        await entered.promise;
        const archiving = s.lifecycle(
          actors.admin,
          c.id,
          "archive",
          { version: 1, reason: "Done quoting" },
          "test",
        );
        release.resolve();
        try {
          await confirming;
          assert.equal((await archiving).status, "Archived");
        } finally {
          ctx.salesOrders.masters = original;
          release.resolve();
        }
        const buyer = await create();
        let q = await quote(buyer);
        for (const [action, actor, extra] of [
          ["submit", "sales", {}],
          ["approve", "manager", {}],
          ["issue", "sales", { channel: "manual" }],
          [
            "buyer-response",
            "sales",
            { decision: "Accepted", reference: "Buyer accepted" },
          ],
        ])
          q = (
            await ctx.service.action(
              actors[actor],
              q.id,
              action,
              { version: q.version, ...extra },
              "test",
            )
          ).data;
        const converted = ctx.service.convert(
            actors.sales,
            q.id,
            { version: q.version },
            "test",
            randomUUID(),
          ),
          blocked = s.lifecycle(
            actors.admin,
            buyer.id,
            "archive",
            { version: 1, reason: "Race conversion" },
            "test",
          );
        await Promise.all([
          converted,
          assert.rejects(
            blocked,
            (e) => e.code === "CUSTOMER_HAS_OPEN_DOCUMENTS",
          ),
        ]);
      },
    );
  },
);
