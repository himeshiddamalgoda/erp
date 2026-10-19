import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PDFParse } from "pdf-parse";
import { createSequelize } from "../../src/db/sequelize.js";
import { migrate } from "../../src/db/migrate.js";
import { createQuotationContext } from "../../src/db/context.js";
import { seedDemo, demoInput } from "../../src/db/seeders/demo.js";
import { demoIds as ids } from "../../src/middleware/auth-context.js";
import { businessDate, env } from "../../src/config/env.js";
import { createApp } from "../../src/app.js";
import { createFulfilmentAdapter } from "../../src/modules/sales-orders/sales-order-fulfilment.service.js";
import { createHandoffWorker } from "../../src/jobs/sales-order-handoff-worker.js";
const database = process.env.TEST_DB_NAME;
if (
  database &&
  (!/^[a-zA-Z0-9_]+_test$/.test(database) ||
    database === (process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp"))
)
  throw new Error("Refusing unsafe Sales Order test database");
export function directInput() {
  const { quotationDate, validUntil: _v, notes, ...rest } = demoInput();
  return {
    ...rest,
    orderDate: quotationDate,
    buyerPoNumber: `QA-${randomUUID()}`,
    buyerPoDate: quotationDate,
    publicNotes: "Pack by colour and size",
    internalNotes: notes,
  };
}
test(
  "MySQL Sales Orders integration",
  {
    skip: database
      ? false
      : "Set TEST_DB_NAME to a separate MySQL database ending in _test",
  },
  async (t) => {
    const original = env.developmentAuth;
    env.developmentAuth = false;
    t.after(() => {
      env.developmentAuth = original;
    });
    const db = createSequelize({ database });
    const context = createQuotationContext(db);
    const m = context.models;
    const s = context.salesOrders;
    await migrate(db);
    await seedDemo(context);
    t.after(() => db.close());
    const actors = {
      sales: { id: ids.sales, role: "Sales", salesTeamIds: [ids.team] },
      manager: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [ids.team],
      },
      admin: { id: ids.admin, role: "Admin", salesTeamIds: [] },
      viewer: { id: ids.viewer, role: "Viewer", salesTeamIds: [ids.team] },
      outsider: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [randomUUID()],
      },
    };
    const app = createApp({
      quotations: context,
      database: { check: () => db.authenticate() },
      principalMiddleware: (req, _res, next) => {
        req.user = actors[req.get("X-Test-Actor")];
        next();
      },
    });
    const call = (method, path, actor = "sales") =>
      request(app)
        [method]("/api/v1/sales-orders" + path)
        .set("X-Test-Actor", actor);
    const create = async (changes = {}, actor = "sales") => {
      const r = await call("post", "", actor)
        .set("Idempotency-Key", randomUUID())
        .send({ ...directInput(), ...changes });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.data;
    };
    const detail = async (o) => {
      const r = await call("get", "/" + o.id);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.data;
    };
    const action = async (o, a, extra = {}, status = 200) => {
      const r = await call("post", `/${o.id}/${a}`, "manager")
        .set("Idempotency-Key", randomUUID())
        .send({ version: o.version, ...extra });
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r.body.data;
    };
    const confirmed = async () => action(await create(), "confirm");
    const adapter = createFulfilmentAdapter(s, {
      authorizeIntegration: (credential) =>
        credential === token
          ? { provider: "demo-fixture", source: "demo" }
          : null,
    });
    const token = Symbol("test fixture capability");
    const ingest = (o, eventType, lines = [], externalEventId = randomUUID()) =>
      adapter.applyFulfilmentEvent(token, {
        orderId: o.id,
        provider: "demo-fixture",
        externalEventId,
        eventType,
        occurredAt: new Date().toISOString(),
        lines,
      });
    const worker = createHandoffWorker(s, {
      enabled: true,
      adapter: {
        dispatch: async () => ({
          externalReference: "TEST-EXTERNAL",
          acknowledged: true,
        }),
      },
    });
    const expectCode = (r, status, code) => {
      assert.equal(r.status, status, JSON.stringify(r.body));
      assert.equal(r.body.error.code, code, JSON.stringify(r.body));
      assert.ok(r.body.error.requestId);
    };
    await t.test(
      "direct create, exact totals, idempotent replay, changed payload and path binding",
      async () => {
        const body = directInput(),
          key = randomUUID();
        const a = await call("post", "").set("Idempotency-Key", key).send(body);
        assert.equal(a.status, 201, JSON.stringify(a.body));
        const o = a.body.data;
        assert.equal(o.lines.length, 6);
        assert.equal(o.totalQty, 1000);
        assert.equal(o.total, "5500.00");
        assert.equal(o.documentRevision, 0);
        assert.equal(o.sourceQuotationId, null);
        assert.deepEqual(o.allowedActions, ["downloadPdf", "edit", "delete"]);
        const b = await call("post", "")
          .set("Idempotency-Key", key)
          .send(Object.fromEntries(Object.entries(body).reverse()));
        assert.equal(b.status, 201);
        assert.deepEqual(b.body, a.body);
        expectCode(
          await call("post", "")
            .set("Idempotency-Key", key)
            .send({ ...body, publicNotes: "different" }),
          409,
          "IDEMPOTENCY_KEY_REUSED",
        );
        expectCode(
          await call("post", "").send(body),
          400,
          "INVALID_IDEMPOTENCY_KEY",
        );
        const mgr = await call("post", "", "manager")
          .set("Idempotency-Key", randomUUID())
          .send({ ...directInput() });
        assert.equal(mgr.status, 201);
        assert.ok(mgr.body.data.allowedActions.includes("confirm"));
      },
    );
    await t.test(
      "Draft edit replaces all lines, missing fields unchanged, conditional soft delete preserves lines",
      async () => {
        let o = await create();
        const notes = o.internalNotes;
        const changed = await call("patch", "/" + o.id).send({
          version: o.version,
          publicNotes: "New packing",
          lines: [{ ...directInput().lines[0], qty: 10 }],
        });
        assert.equal(changed.status, 200, JSON.stringify(changed.body));
        o = changed.body.data;
        assert.equal(o.lines.length, 1);
        assert.equal(o.total, "55.00");
        assert.equal(o.internalNotes, notes);
        expectCode(await call("delete", "/" + o.id), 400, "INVALID_IF_MATCH");
        expectCode(
          await call("delete", "/" + o.id).set("If-Match", '"1"'),
          409,
          "STALE_VERSION",
        );
        const r = await call("delete", "/" + o.id).set(
          "If-Match",
          `"${o.version}"`,
        );
        assert.equal(r.status, 204);
        assert.equal((await call("get", "/" + o.id)).status, 404);
        assert.equal(
          await m.sales_order_lines.count({ where: { salesOrderId: o.id } }),
          1,
        );
      },
    );
    await t.test(
      "strict inputs: protected/source fields, money, qty, duplicates, date bounds, empty lines",
      async () => {
        for (const change of [
          { sourceQuotationId: randomUUID() },
          { status: "Confirmed" },
          { total: "1.00" },
          { orderNumber: "SO-HACK" },
          { createdBy: ids.admin },
          { lines: [] },
          { buyerPoDate: "2999-01-01" },
          { orderDate: "2026-02-30" },
          { lines: [{ ...directInput().lines[0], qty: 1.5 }] },
          { lines: [{ ...directInput().lines[0], qty: 0 }] },
          { lines: [{ ...directInput().lines[0], unitPrice: "1.001" }] },
          { lines: [directInput().lines[0], directInput().lines[0]] },
        ]) {
          const r = await call("post", "")
            .set("Idempotency-Key", randomUUID())
            .send({ ...directInput(), ...change });
          assert.equal(
            r.status,
            422,
            JSON.stringify({ change, result: r.body }),
          );
        }
        const zero = await create({
          buyerPoNumber: null,
          paymentTerms: null,
          requestedDeliveryDate: null,
          billingAddressId: null,
          shippingAddressId: null,
          lines: [{ ...directInput().lines[0], unitPrice: "0.00" }],
        });
        assert.equal(zero.total, "0.00");
        const r = await call("post", `/${zero.id}/confirm`, "manager")
          .set("Idempotency-Key", randomUUID())
          .send({ version: zero.version });
        assert.equal(r.status, 422);
        assert.equal((await detail(zero)).status, "Draft");
      },
    );
    await t.test(
      "every read and write enforces scope and roles, missing actor and inactive actor",
      async () => {
        const o = await create();
        for (const suffix of [
          "",
          "/pdf",
          "/fulfilment",
          "/revisions",
          "/activity",
        ]) {
          assert.equal(
            (await call("get", `/${o.id}${suffix}`, "outsider")).status,
            404,
          );
          assert.equal(
            (await call("get", `/${o.id}${suffix}`, "viewer")).status,
            200,
          );
        }
        assert.equal(
          (await request(app).get("/api/v1/sales-orders")).status,
          401,
        );
        assert.deepEqual(
          (await call("get", "?pageSize=20", "outsider")).body.data,
          [],
        );
        for (const a of [
          "confirm",
          "cancel",
          "close",
          "hold",
          "resume",
          "revisions",
        ]) {
          const body =
            a === "revisions"
              ? {
                  version: o.version,
                  reason: "Test",
                  buyerReference: "Email",
                  changes: { publicNotes: "X" },
                }
              : { version: o.version, reason: "Test" };
          // confirm/close do not accept reason; use their strict bodies.
          if (["confirm", "close"].includes(a)) delete body.reason;
          const r = await call("post", `/${o.id}/${a}`, "sales")
            .set("Idempotency-Key", randomUUID())
            .send(body);
          assert.equal(r.status, 403, `${a}: ${JSON.stringify(r.body)}`);
          assert.equal(
            (
              await call("post", `/${o.id}/${a}`, "outsider")
                .set("Idempotency-Key", randomUUID())
                .send(body)
            ).status,
            404,
          );
        }
        assert.equal(
          (
            await call("patch", "/" + o.id, "viewer").send({
              version: o.version,
              publicNotes: "x",
            })
          ).status,
          403,
        );
        assert.equal(
          (await call("delete", "/" + o.id, "viewer").set("If-Match", '"1"'))
            .status,
          403,
        );
        assert.equal(
          (
            await call("post", "", "viewer")
              .set("Idempotency-Key", randomUUID())
              .send(directInput())
          ).status,
          403,
        );
        await m.users.update(
          { isActive: false },
          { where: { id: ids.viewer } },
        );
        try {
          assert.equal((await call("get", "/" + o.id, "viewer")).status, 401);
        } finally {
          await m.users.update(
            { isActive: true },
            { where: { id: ids.viewer } },
          );
        }
      },
    );
    await t.test(
      "concurrent normalized buyer PO has one winner; reuse after cancellation and deletion",
      async () => {
        const po = "RACE-" + randomUUID();
        const results = await Promise.all(
          [po, "  " + po.toLowerCase() + "  "].map((buyerPoNumber) =>
            call("post", "")
              .set("Idempotency-Key", randomUUID())
              .send({ ...directInput(), buyerPoNumber }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        expectCode(
          results.find((r) => r.status === 409),
          409,
          "DUPLICATE_BUYER_PO",
        );
        const o = results.find((r) => r.status === 201).body.data;
        await action(o, "cancel", { reason: "PO withdrawn" });
        const reused = await create({ buyerPoNumber: po });
        assert.equal(
          (
            await call("delete", "/" + reused.id).set(
              "If-Match",
              `"${reused.version}"`,
            )
          ).status,
          204,
        );
        await create({ buyerPoNumber: po });
      },
    );
    await t.test(
      "confirmation atomically freezes revision 1 and one handoff, preserves lines and replays",
      async () => {
        const draft = await create(),
          key = randomUUID(),
          body = { version: draft.version, comment: "Reviewed" };
        const r = await call("post", `/${draft.id}/confirm`, "manager")
          .set("Idempotency-Key", key)
          .send(body);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const o = r.body.data;
        assert.equal(o.status, "Confirmed");
        assert.equal(o.documentRevision, 1);
        assert.equal(o.handoff.status, "Queued");
        assert.equal(o.version, 2);
        assert.deepEqual(
          o.lines.map((l) => l.id),
          draft.lines.map((l) => l.id),
        );
        const repeat = await call("post", `/${o.id}/confirm`, "manager")
          .set("Idempotency-Key", key)
          .send(body);
        assert.deepEqual(repeat.body, r.body);
        expectCode(
          await call("post", `/${o.id}/confirm`, "manager")
            .set("Idempotency-Key", randomUUID())
            .send({ version: o.version }),
          409,
          "INVALID_TRANSITION",
        );
        assert.equal(
          await m.sales_order_handoffs.count({ where: { salesOrderId: o.id } }),
          1,
        );
        expectCode(
          await call("patch", "/" + o.id).send({
            version: o.version,
            publicNotes: "No",
          }),
          409,
          "INVALID_TRANSITION",
        );
        const revisions = await call("get", `/${o.id}/revisions`);
        assert.equal(revisions.body.data.length, 1);
        assert.equal(revisions.body.data[0].snapshot.lines.length, 6);
        assert.ok(!JSON.stringify(revisions.body).includes("Internal:"));
        await assert.rejects(
          () =>
            m.sales_order_revisions.update(
              { reason: "tamper" },
              { where: { salesOrderId: o.id } },
            ),
          /append only/,
        );
      },
    );
    await t.test(
      "stale concurrent patches produce one winner and no overwrite",
      async () => {
        const o = await create();
        const results = await Promise.all(
          ["one", "two"].map((publicNotes) =>
            call("patch", "/" + o.id).send({ version: o.version, publicNotes }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        expectCode(
          results.find((r) => r.status === 409),
          409,
          "STALE_VERSION",
        );
      },
    );
    await t.test(
      "hold -> operational revision -> resume keeps ID, commercial content and old snapshots",
      async () => {
        let o = await confirmed();
        o = await action(o, "hold", { reason: "Review delivery" });
        assert.equal(o.isOnHold, true);
        assert.equal(o.status, "Confirmed");
        assert.equal(await worker.claim(o.id), null);
        const date = new Date(`${businessDate()}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 60);
        const body = {
          version: o.version,
          reason: "Buyer delivery change",
          buyerReference: "Buyer email",
          changes: {
            requestedDeliveryDate: date.toISOString().slice(0, 10),
            publicNotes: "Warehouse B",
          },
        };
        const key = randomUUID();
        const r = await call("post", `/${o.id}/revisions`, "manager")
          .set("Idempotency-Key", key)
          .send(body);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const revised = r.body.data.order;
        assert.equal(revised.id, o.id);
        assert.equal(revised.status, "Confirmed");
        assert.equal(revised.isOnHold, true);
        assert.equal(revised.documentRevision, 2);
        assert.equal(revised.total, "5500.00");
        assert.deepEqual(revised.lines, o.lines);
        const repeat = await call("post", `/${o.id}/revisions`, "manager")
          .set("Idempotency-Key", key)
          .send(body);
        assert.deepEqual(repeat.body, r.body);
        const revisions = (await call("get", `/${o.id}/revisions`)).body.data;
        assert.equal(revisions.length, 2);
        assert.notEqual(
          revisions[0].snapshot.publicNotes,
          revisions[1].snapshot.publicNotes,
        );
        assert.equal(revised.handoff.documentRevision, 2);
        o = await action(revised, "resume", { reason: "Buyer confirmed" });
        assert.equal(o.isOnHold, false);
        assert.equal(o.holdReason, null);
        const claimed = await worker.claim(o.id);
        assert.ok(claimed);
        assert.equal(claimed.documentRevision, 2);
        assert.equal(claimed.payload.publicNotes, "Warehouse B");
      },
    );
    await t.test(
      "claimed handoff blocks hold/amend/cancel, both serialized race outcomes are safe",
      async () => {
        for (const a of ["hold", "cancel", "revisions"]) {
          let o = await confirmed();
          const changes =
            a === "revisions"
              ? {
                  reason: "Date change",
                  buyerReference: "Email",
                  changes: { publicNotes: "Changed" },
                }
              : { reason: "Review" };
          const results = await Promise.all([
            worker.claim(o.id),
            call("post", `/${o.id}/${a}`, "manager")
              .set("Idempotency-Key", randomUUID())
              .send({ version: o.version, ...changes }),
          ]);
          const [claimed, http] = results;
          if (claimed) {
            assert.equal(http.status, 409, JSON.stringify(http.body));
            o = await detail(o);
            assert.equal(o.handoff.status, "Claimed");
            assert.equal(o.isOnHold, false);
            assert.equal(o.documentRevision, 1);
          } else {
            assert.ok(
              [200, 201].includes(http.status),
              JSON.stringify(http.body),
            );
            const fresh = await detail(o);
            assert.ok(
              fresh.isOnHold ||
                fresh.status === "Cancelled" ||
                fresh.documentRevision === 2,
            );
          }
          const fresh = await detail(o);
          if (fresh.handoff.status === "Claimed") {
            for (const [actionName, code] of [
              ["hold", "HOLD_BLOCKED"],
              ["cancel", "CANCELLATION_BLOCKED"],
              ["revisions", "AMENDMENT_BLOCKED"],
            ]) {
              const body =
                actionName === "revisions"
                  ? {
                      version: fresh.version,
                      reason: "x",
                      buyerReference: "email",
                      changes: { publicNotes: "x" },
                    }
                  : { version: fresh.version, reason: "x" };
              expectCode(
                await call("post", `/${o.id}/${actionName}`, "manager")
                  .set("Idempotency-Key", randomUUID())
                  .send(body),
                409,
                code,
              );
            }
          }
        }
      },
    );
    await t.test(
      "amendments reject commercial fields, missing reference, past dates and wrong buyer address",
      async () => {
        const o = await confirmed();
        for (const changes of [
          { currency: "EUR" },
          { lines: directInput().lines },
          { requestedDeliveryDate: "2020-01-01" },
          { shippingAddressId: ids.billing },
          {},
        ]) {
          const r = await call("post", `/${o.id}/revisions`, "manager")
            .set("Idempotency-Key", randomUUID())
            .send({
              version: o.version,
              reason: "change",
              buyerReference: "email",
              changes,
            });
          assert.equal(r.status, 422, JSON.stringify(r.body));
        }
        assert.equal(
          (
            await call("post", `/${o.id}/revisions`, "manager")
              .set("Idempotency-Key", randomUUID())
              .send({
                version: o.version,
                reason: "x",
                changes: { publicNotes: "x" },
              })
          ).status,
          422,
        );
      },
    );
    await t.test(
      "per-line delivery, shipment does not count, exact event replay and overdelivery guard",
      async () => {
        let o = await confirmed();
        let feed = (await call("get", `/${o.id}/fulfilment`)).body.data;
        assert.equal(feed.deliveredQty, 0);
        assert.equal(feed.remainingQty, 1000);
        assert.equal(feed.source, "demo");
        await ingest(o, "ShipmentPosted", [
          { orderLineId: o.lines[0].id, qty: 200 },
        ]);
        assert.equal((await detail(o)).status, "Confirmed");
        assert.equal(
          (await call("get", `/${o.id}/fulfilment`)).body.data.deliveredQty,
          0,
        );
        const eventId = randomUUID();
        const event = {
          orderId: o.id,
          provider: "demo-fixture",
          externalEventId: eventId,
          eventType: "DeliveryConfirmed",
          occurredAt: new Date().toISOString(),
          lines: [{ orderLineId: o.lines[0].id, qty: 100 }],
        };
        const first = await adapter.applyFulfilmentEvent(token, event);
        assert.equal(first.status, "PartiallyDelivered");
        const replay = await adapter.applyFulfilmentEvent(token, event);
        assert.equal(replay.replayed, true);
        assert.equal(replay.version, first.version);
        await assert.rejects(
          () =>
            adapter.applyFulfilmentEvent(token, {
              ...event,
              lines: [{ orderLineId: o.lines[0].id, qty: 101 }],
            }),
          (e) => e.code === "IDEMPOTENCY_KEY_REUSED",
        );
        await assert.rejects(
          () =>
            ingest(o, "DeliveryConfirmed", [
              { orderLineId: o.lines[0].id, qty: 101 },
            ]),
          (e) => e.status === 422,
        );
        const other = await create();
        await assert.rejects(
          () =>
            ingest(o, "DeliveryConfirmed", [
              { orderLineId: other.lines[0].id, qty: 1 },
            ]),
          (e) => e.status === 422,
        );
        o = await detail(o);
        expectCode(
          await call("post", `/${o.id}/close`, "manager").send({
            version: o.version,
          }),
          409,
          "DELIVERY_INCOMPLETE",
        );
        const remaining = o.fulfilment.lines
          .filter((l) => l.remainingQty)
          .map((l) => ({ orderLineId: l.orderLineId, qty: l.remainingQty }));
        await ingest(o, "DeliveryConfirmed", remaining);
        o = await detail(o);
        assert.equal(o.status, "Delivered");
        assert.ok(o.fulfilment.lines.every((l) => l.remainingQty === 0));
        o = await action(o, "close", { comment: "Each line delivered" });
        assert.equal(o.status, "Closed");
        await assert.rejects(
          () => ingest(o, "ProductionStarted"),
          (e) => e.status === 409,
        );
        const activity = (
          await call("get", `/${o.id}/activity?action=DeliveryConfirmed`)
        ).body;
        assert.equal(activity.meta.total, 2);
        assert.equal(activity.data.length, 2);
      },
    );
    await t.test(
      "private adapter authentication; held/cancelled event guards and production transition",
      async () => {
        let o = await confirmed();
        await assert.rejects(
          () =>
            adapter.applyFulfilmentEvent("untrusted", {
              provider: "demo-fixture",
            }),
          (e) => e.status === 403,
        );
        await assert.rejects(
          () =>
            createFulfilmentAdapter(s).applyFulfilmentEvent(null, {
              provider: "x",
            }),
          (e) => e.status === 403,
        );
        o = await action(o, "hold", { reason: "hold" });
        await assert.rejects(
          () => ingest(o, "ProductionStarted"),
          (e) => e.status === 409,
        );
        o = await action(o, "resume", { reason: "resume" });
        await ingest(o, "ProductionStarted");
        o = await detail(o);
        assert.equal(o.status, "InProgress");
        expectCode(
          await call("post", `/${o.id}/cancel`, "manager").send({
            version: o.version,
            reason: "late",
          }),
          409,
          "CANCELLATION_BLOCKED",
        );
        const cancelled = await action(await confirmed(), "cancel", {
          reason: "Withdrawn",
        });
        assert.equal(cancelled.handoff.status, "Cancelled");
        await assert.rejects(
          () => ingest(cancelled, "ProductionStarted"),
          (e) => e.status === 409,
        );
      },
    );
    await t.test(
      "worker disabled by default; dispatch and ambiguous failure persist durable states",
      async () => {
        let o = await confirmed();
        await assert.rejects(
          () => createHandoffWorker(s).claim(o.id),
          (e) => e.code === "HANDOFF_DISABLED",
        );
        await worker.runOne(o.id);
        o = await detail(o);
        assert.equal(o.handoff.status, "Acknowledged");
        assert.equal(o.status, "Confirmed");
        const fail = await confirmed();
        const broken = createHandoffWorker(s, {
          enabled: true,
          adapter: {
            dispatch: async () => {
              throw new Error("private credential should not escape");
            },
          },
        });
        await assert.rejects(() => broken.runOne(fail.id));
        assert.equal((await detail(fail)).handoff.status, "Failed");
        assert.equal(await broken.claim(fail.id), null);
      },
    );
    await t.test(
      "rollback after injected line, audit and handoff errors leaves no partial order or reservation",
      async () => {
        for (const [table, hook] of [
          ["sales_order_lines", "beforeBulkCreate"],
          ["audit_events", "beforeCreate"],
        ]) {
          const key = randomUUID(),
            body = directInput();
          m[table].addHook(hook, "so-inject", () => {
            throw new Error("injected");
          });
          let r;
          try {
            r = await call("post", "").set("Idempotency-Key", key).send(body);
          } finally {
            m[table].removeHook(hook, "so-inject");
          }
          assert.equal(r.status, 500);
          assert.equal(
            await m.sales_orders.count({
              where: { buyerPoNumber: body.buyerPoNumber },
            }),
            0,
          );
          assert.equal(
            await m.idempotency_keys.count({ where: { idempotencyKey: key } }),
            0,
          );
        }
        const o = await create(),
          key = randomUUID();
        m.sales_order_handoffs.addHook("beforeCreate", "so-inject", () => {
          throw new Error("injected");
        });
        try {
          assert.equal(
            (
              await call("post", `/${o.id}/confirm`, "manager")
                .set("Idempotency-Key", key)
                .send({ version: o.version })
            ).status,
            500,
          );
        } finally {
          m.sales_order_handoffs.removeHook("beforeCreate", "so-inject");
        }
        assert.equal((await detail(o)).status, "Draft");
        assert.equal(
          await m.sales_order_revisions.count({
            where: { salesOrderId: o.id },
          }),
          0,
        );
        assert.equal(
          await m.idempotency_keys.count({ where: { idempotencyKey: key } }),
          0,
        );
      },
    );
    await t.test(
      "PDF uses immutable historical snapshot, current hold/cancel overlay and excludes staff notes",
      async () => {
        let o = await confirmed();
        const originalPublic = o.publicNotes;
        o = await action(o, "hold", { reason: "hold" });
        const r = await call("post", `/${o.id}/revisions`, "manager")
          .set("Idempotency-Key", randomUUID())
          .send({
            version: o.version,
            reason: "public notes",
            buyerReference: "Email",
            changes: { publicNotes: "New public note" },
          });
        assert.equal(r.status, 201);
        o = r.body.data.order;
        const pdf = await call("get", `/${o.id}/pdf?revision=1`);
        assert.equal(pdf.status, 200);
        assert.match(pdf.headers["content-type"], /application\/pdf/);
        const p = new PDFParse({ data: new Uint8Array(pdf.body) });
        try {
          const result = await p.getText();
          for (const text of [
            "5500.00",
            "1000 PCS",
            "100% cotton",
            "180",
            "SUPERSEDED",
            "ON HOLD",
            originalPublic,
          ])
            assert.ok(result.text.includes(text), text);
          assert.ok(!result.text.includes("Internal:"));
          assert.ok(!result.text.includes("New public note"));
        } finally {
          await p.destroy();
        }
        assert.equal(
          (await call("get", `/${o.id}/pdf?revision=99`)).status,
          404,
        );
        const draft = await create();
        assert.equal(
          (await call("get", `/${draft.id}/revisions`)).body.meta.total,
          0,
        );
        assert.equal((await call("get", `/${draft.id}/pdf`)).status, 200);
      },
    );
    await t.test(
      "query allowlists, empty scoped lists, stable pagination and source/hold/date filters",
      async () => {
        for (const q of [
          "?pageSize=101",
          "?status=PendingApproval",
          "?sortBy=DROP",
          "?unknown=true",
          "?deliveryFrom=2026-12-01&deliveryTo=2026-01-01",
        ])
          assert.equal((await call("get", q)).status, 400, q);
        const o = await create();
        const list = await call(
          "get",
          "?q=" +
            encodeURIComponent(o.buyerPoNumber) +
            "&source=direct&pageSize=1",
        );
        assert.equal(list.status, 200);
        assert.equal(list.body.meta.total, 1);
        assert.equal(list.body.data[0].id, o.id);
        assert.equal(
          (await call("get", "?q=NO-MATCH-" + randomUUID())).body.data.length,
          0,
        );
        const held = await action(await confirmed(), "hold", {
          reason: "hold",
        });
        const r = await call("get", "?onHold=true&source=direct&pageSize=100");
        assert.ok(r.body.data.some((x) => x.id === held.id));
        assert.equal(
          (await call("get", `/${o.id}/activity?action=DROP`)).status,
          400,
        );
      },
    );
    await t.test(
      "idempotency scope includes order path, simultaneous confirms create one revision, rollback guard",
      async () => {
        const a = await create(),
          b = await create(),
          key = randomUUID(),
          body = { version: a.version };
        const results = await Promise.all(
          [1, 2].map(() =>
            call("post", `/${a.id}/confirm`, "manager")
              .set("Idempotency-Key", key)
              .send(body),
          ),
        );
        assert.deepEqual(
          results.map((r) => r.status),
          [200, 200],
        );
        assert.deepEqual(results[0].body, results[1].body);
        expectCode(
          await call("post", `/${b.id}/confirm`, "manager")
            .set("Idempotency-Key", key)
            .send(body),
          409,
          "IDEMPOTENCY_KEY_REUSED",
        );
        assert.equal(
          await m.sales_order_revisions.count({
            where: { salesOrderId: a.id },
          }),
          1,
        );
        assert.equal(
          await m.sales_order_handoffs.count({ where: { salesOrderId: a.id } }),
          1,
        );
        await assert.rejects(
          () => migrate(db, "down"),
          /Refusing destructive rollback/,
        );
      },
    );
    await t.test(
      "inactive masters block confirmation; confirmed reads and fulfilment retain snapshots",
      async () => {
        const draft = await create(),
          active = await confirmed();
        for (const [table, id] of [
          ["customers", ids.customer],
          ["sales_teams", ids.team],
          ["users", ids.sales],
          ["styles", ids.style],
        ]) {
          await m[table].update(
            {
              isActive: false,
              ...(table === "customers"
                ? {
                    archivedAt: new Date(),
                    archivedBy: ids.admin,
                    archiveReason: "Test fixture inactive buyer",
                  }
                : {}),
            },
            { where: { id } },
          );
          try {
            const r = await call("post", `/${draft.id}/confirm`, "manager")
              .set("Idempotency-Key", randomUUID())
              .send({ version: draft.version });
            assert.equal(r.status, 422, table + JSON.stringify(r.body));
            assert.equal(
              (await call("get", `/${active.id}`, "manager")).status,
              200,
            );
          } finally {
            await m[table].update(
              {
                isActive: true,
                ...(table === "customers"
                  ? { archivedAt: null, archivedBy: null, archiveReason: null }
                  : {}),
              },
              { where: { id } },
            );
          }
        }
        await m.styles.update(
          { isActive: false },
          { where: { id: ids.style } },
        );
        try {
          await ingest(
            active,
            "DeliveryConfirmed",
            active.lines.map((l) => ({ orderLineId: l.id, qty: l.qty })),
          );
          assert.equal((await detail(active)).status, "Delivered");
        } finally {
          await m.styles.update(
            { isActive: true },
            { where: { id: ids.style } },
          );
        }
      },
    );
    await t.test(
      "serialized action-first and claim-first outcomes cover hold, amendment, cancel, and resume",
      async () => {
        for (const a of ["hold", "cancel", "revisions"]) {
          let o = await confirmed();
          const extra =
            a === "revisions"
              ? {
                  reason: "Amend",
                  buyerReference: "Email",
                  changes: { publicNotes: "R2" },
                }
              : { reason: "Review" };
          const changed = await action(
            o,
            a,
            extra,
            a === "revisions" ? 201 : 200,
          );
          const current = a === "revisions" ? changed.order : changed;
          const claim = await worker.claim(o.id);
          assert.equal(Boolean(claim), a === "revisions");
          if (claim) assert.equal(claim.documentRevision, 2);
          o = await confirmed();
          assert.ok(await worker.claim(o.id));
          o = await detail(o);
          const r = await call("post", `/${o.id}/${a}`, "manager")
            .set("Idempotency-Key", randomUUID())
            .send({ version: o.version, ...extra });
          assert.equal(r.status, 409, JSON.stringify(r.body));
        }
        let held = await action(await confirmed(), "hold", { reason: "Hold" });
        const result = await Promise.all([
          worker.claim(held.id),
          action(held, "resume", { reason: "Resume" }),
        ]);
        const current = await detail(held);
        assert.equal(current.isOnHold, false);
        if (result[0]) assert.equal(current.handoff.status, "Claimed");
        else assert.equal(current.handoff.status, "Queued");
      },
    );
    await t.test(
      "quotation conversion response and idempotency stay compatible; frozen edit and retained link",
      async () => {
        async function converted(extra = {}) {
          let q = await context.service.create(
            actors.sales,
            { ...demoInput(), ...extra },
            "test",
          );
          for (const [a, actor, b] of [
            ["submit", actors.sales, {}],
            ["approve", actors.manager, {}],
            ["issue", actors.sales, { channel: "manual" }],
            [
              "buyer-response",
              actors.sales,
              { decision: "Accepted", reference: "Email" },
            ],
          ])
            q = (
              await context.service.action(
                actor,
                q.id,
                a,
                { version: q.version, ...b },
                "test",
              )
            ).data;
          const key = randomUUID(),
            body = { version: q.version };
          const r = await context.service.convert(
            actors.sales,
            q.id,
            body,
            "test",
            key,
          );
          assert.equal(r.status, 201);
          assert.deepEqual(
            (
              await context.service.convert(
                actors.sales,
                q.id,
                body,
                "test",
                key,
              )
            ).body,
            r.body,
          );
          assert.equal(r.body.data.status, "Draft");
          assert.ok(!("documentRevision" in r.body.data));
          return { q, o: await detail(r.body.data) };
        }
        let { q, o } = await converted();
        assert.equal(o.sourceQuotationId, q.id);
        assert.equal(
          await m.audit_events.count({
            where: {
              entityType: "sales_order",
              entityId: o.id,
              action: "create",
            },
          }),
          1,
        );
        assert.equal(o.internalNotes, demoInput().notes);
        assert.equal(o.publicNotes, null);
        assert.equal(o.billingAddressId, ids.billing);
        expectCode(
          await call("patch", "/" + o.id).send({
            version: o.version,
            currency: o.currency,
          }),
          409,
          "FROZEN_QUOTATION_FIELDS",
        );
        expectCode(
          await call("patch", "/" + o.id).send({
            version: o.version,
            ownerId: o.ownerId,
          }),
          409,
          "FROZEN_QUOTATION_FIELDS",
        );
        const patch = await call("patch", "/" + o.id).send({
          version: o.version,
          buyerPoNumber: "CONVERT-" + randomUUID(),
          buyerPoDate: businessDate(),
          shippingAddressId: ids.shipping,
          publicNotes: "Buyer-facing",
        });
        assert.equal(patch.status, 200, JSON.stringify(patch.body));
        o = await action(patch.body.data, "confirm");
        assert.equal(o.status, "Confirmed");
        assert.equal(o.total, "5500.00");
        o = await action(o, "cancel", { reason: "Buyer withdrew" });
        assert.equal(
          (await context.service.detail(actors.sales, q.id)).status,
          "Converted",
        );
        const again = await context.service.convert(
          actors.sales,
          q.id,
          { version: 999 },
          "test",
          randomUUID(),
        );
        assert.equal(again.body.data.id, o.id);
        assert.equal(again.body.data.status, "Cancelled");
        const past = new Date(`${businessDate()}T12:00:00Z`);
        past.setUTCDate(past.getUTCDate() - 5);
        const oldDate = past.toISOString().slice(0, 10);
        const late = await converted({
          quotationDate: oldDate,
          requestedDeliveryDate: oldDate,
        });
        assert.equal(late.o.orderDate, oldDate);
        assert.equal(late.o.requestedDeliveryDate, oldDate);
        const lateConfirm = await call(
          "post",
          `/${late.o.id}/confirm`,
          "manager",
        )
          .set("Idempotency-Key", randomUUID())
          .send({ version: late.o.version });
        assert.equal(lateConfirm.status, 422);
        const another = await converted();
        assert.equal(
          (
            await call("delete", "/" + another.o.id).set(
              "If-Match",
              `"${another.o.version}"`,
            )
          ).status,
          204,
        );
        const historical = await context.service.convert(
          actors.sales,
          another.q.id,
          { version: 999 },
          "test",
          randomUUID(),
        );
        assert.equal(historical.body.data.id, another.o.id);
        assert.equal(historical.body.data.archived, true);
        assert.equal(
          await m.sales_orders.count({
            where: { sourceQuotationId: another.q.id },
          }),
          1,
        );
      },
    );
  },
);
