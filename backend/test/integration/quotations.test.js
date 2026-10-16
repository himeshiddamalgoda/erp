import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PDFParse } from "pdf-parse";
async function pdfParse(data) {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}
import { createSequelize } from "../../src/db/sequelize.js";
import { migrate } from "../../src/db/migrate.js";
import { createQuotationContext } from "../../src/db/context.js";
import { seedDemo, demoInput } from "../../src/db/seeders/demo.js";
import { demoIds as ids } from "../../src/middleware/auth-context.js";
import { businessDate } from "../../src/config/env.js";
import { createApp } from "../../src/app.js";
const databaseName = process.env.TEST_DB_NAME;
const skip = !databaseName
  ? "Set TEST_DB_NAME to an isolated MySQL database ending in _test"
  : false;
if (
  databaseName &&
  (!/^[a-zA-Z0-9_]+_test$/.test(databaseName) ||
    databaseName ===
      (process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp"))
)
  throw new Error("Refusing unsafe test database");

test("MySQL quotations HTTP integration", { skip }, async (t) => {
  const db = createSequelize({ database: databaseName });
  const context = createQuotationContext(db);
  const m = context.models;
  t.after(() => db.close());
  await db.authenticate();
  await migrate(db);
  await seedDemo(context);
  const actors = {
    sales: { id: ids.sales, role: "Sales", salesTeamIds: [ids.team] },
    manager: {
      id: ids.manager,
      role: "SalesManager",
      salesTeamIds: [ids.team],
    },
    admin: { id: ids.admin, role: "Admin", salesTeamIds: [] },
    viewer: { id: ids.viewer, role: "Viewer", salesTeamIds: [ids.team] },
    outsider: { id: ids.sales, role: "Sales", salesTeamIds: [randomUUID()] },
  };
  // Test-only trusted adapter: these headers are never accepted by the production app.
  const app = createApp({
    database: { check: () => db.authenticate() },
    quotations: context,
    principalMiddleware: (req, _res, next) => {
      req.user = actors[req.get("X-Test-Actor")];
      next();
    },
  });
  const call = (method, path, actor = "sales") =>
    request(app)
      [method](`/api/v1/quotations${path}`)
      .set("X-Test-Actor", actor);
  const create = async (changes = {}, actor = "sales") => {
    const r = await call("post", "", actor).send({
      ...demoInput(),
      ...changes,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data;
  };
  const detail = async (q) => {
    const r = await call("get", `/${q.id}`);
    assert.equal(r.status, 200);
    return r.body.data;
  };
  const action = async (
    q,
    name,
    body = {},
    actor = "sales",
    expected = 200,
  ) => {
    const r = await call("post", `/${q.id}/${name}`, actor).send({
      version: q.version,
      ...body,
    });
    assert.equal(r.status, expected, JSON.stringify(r.body));
    return r.body.data;
  };
  const pending = async () => action(await create(), "submit");
  const approved = async () =>
    action(await pending(), "approve", {}, "manager");
  const issued = async () =>
    action(await approved(), "issue", { channel: "manual" });
  const accepted = async () =>
    action(await issued(), "buyer-response", {
      decision: "Accepted",
      reference: "Buyer email",
    });
  const conversion = (q, key = randomUUID(), version = q.version) =>
    call("post", `/${q.id}/convert`)
      .set("Idempotency-Key", key)
      .send({ version });
  const yesterday = () => {
    const date = new Date(`${businessDate()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  };

  await t.test(
    "concurrent migration checks serialize and release their advisory lock",
    async () => {
      await Promise.all([migrate(db), migrate(db)]);
      const [rows] = await db.query(
        "SELECT IS_FREE_LOCK('erp_quotation_migrations') AS free",
      );
      assert.equal(Number(rows[0].free), 1);
    },
  );
  await t.test(
    "example totals, drafts, line replacement, conditional deletion and immutable API fields",
    async () => {
      const q = await create();
      assert.equal(q.totalQty, 1000);
      assert.equal(q.total, "5500.00");
      assert.equal(q.subtotal, "5500.00");
      assert.equal(q.lines.length, 6);
      assert.match(q.quoteNumber, /^QT-\d{4}-\d{4,}$/);
      assert.equal(q.revision, 1);
      assert.equal(q.version, 1);
      const forbidden = await call("patch", `/${q.id}`).send({
        version: q.version,
        status: "Accepted",
      });
      assert.equal(forbidden.status, 422);
      const updated = await call("patch", `/${q.id}`).send({
        version: q.version,
        notes: "Changed",
        lines: [{ ...demoInput().lines[0], qty: 3 }],
      });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.lines.length, 1);
      assert.equal(updated.body.data.total, "16.50");
      assert.notEqual(updated.body.data.lines[0].id, q.lines[0].id);
      assert.equal((await call("delete", `/${q.id}`)).status, 400);
      assert.equal(
        (await call("delete", `/${q.id}`).set("If-Match", '"1"')).status,
        409,
      );
      assert.equal(
        (
          await call("delete", `/${q.id}`).set(
            "If-Match",
            `"${updated.body.data.version}"`,
          )
        ).status,
        204,
      );
      assert.equal((await call("get", `/${q.id}`)).status, 404);
      assert.equal(
        await m.quotation_lines.count({ where: { quotationId: q.id } }),
        1,
      );
      assert.equal(
        await m.audit_events.count({
          where: { entityId: q.id, action: "delete" },
        }),
        1,
      );
    },
  );
  await t.test(
    "strict money, quantity, business date, duplicate, inactive variant and address validation",
    async () => {
      for (const change of [
        { qty: 0 },
        { qty: 1.2 },
        { qty: 1000001 },
        { unitPrice: "1.001" },
        { unitPrice: 5.5 },
        { unitPrice: "100000000.00" },
        { styleId: randomUUID() },
        { colour: "Red" },
      ]) {
        const r = await call("post", "").send({
          ...demoInput(),
          lines: [{ ...demoInput().lines[0], ...change }],
        });
        assert.equal(r.status, 422, JSON.stringify(change));
        assert.ok(r.body.error.fields);
      }
      for (const change of [
        { quotationDate: "2026-02-30" },
        { validUntil: "2000-01-01" },
        { lines: [] },
        { lines: [demoInput().lines[0], demoInput().lines[0]] },
        { createdBy: ids.admin },
        { currency: "JPY" },
      ])
        assert.equal(
          (await call("post", "").send({ ...demoInput(), ...change })).status,
          422,
          JSON.stringify(change),
        );
      const other = randomUUID();
      await m.customers.create({
        ...(await m.customers.findByPk(ids.customer)).toJSON(),
        id: other,
        code: other.slice(0, 30),
      });
      assert.equal(
        (await call("post", "").send({ ...demoInput(), customerId: other }))
          .status,
        422,
      );
      await m.style_variants.update(
        { isActive: false },
        { where: { id: "70000000-0000-4000-8000-000000000001" } },
      );
      try {
        assert.equal((await call("post", "").send(demoInput())).status, 422);
      } finally {
        await m.style_variants.update(
          { isActive: true },
          { where: { id: "70000000-0000-4000-8000-000000000001" } },
        );
      }
    },
  );
  await t.test(
    "precision overflow, line limits and database CHECK constraints",
    async () => {
      assert.equal(
        (
          await call("post", "").send({
            ...demoInput(),
            lines: Array.from({ length: 501 }, () => demoInput().lines[0]),
          })
        ).status,
        422,
      );
      const styleId = randomUUID();
      await m.styles.create({
        ...(await m.styles.findByPk(ids.style)).toJSON(),
        id: styleId,
        code: styleId,
      });
      const lines = Array.from({ length: 101 }, (_, i) => ({
        styleId,
        colour: `Colour ${i}`,
        size: "S",
        qty: 1000000,
        unitPrice: "99999999.99",
      }));
      await m.style_variants.bulkCreate(
        lines.map((l) => ({
          id: randomUUID(),
          styleId,
          colour: l.colour,
          size: l.size,
          isActive: true,
        })),
      );
      const overflow = await call("post", "").send({ ...demoInput(), lines });
      assert.equal(overflow.status, 422);
      assert.match(overflow.body.error.fields.lines, /precision/);
      const q = await create();
      await assert.rejects(
        m.quotation_lines.update(
          { quantity: 0 },
          { where: { quotationId: q.id } },
        ),
        /check constraint/i,
      );
      assert.equal((await detail(q)).lines[0].qty, 200);
    },
  );
  await t.test(
    "submission requirements, rejection/withdrawal cycles, zero draft price and lifecycle permissions",
    async () => {
      const draft = await create({ validUntil: null, billingAddressId: null });
      assert.equal(
        (
          await call("post", `/${draft.id}/submit`).send({
            version: draft.version,
          })
        ).status,
        422,
      );
      const zero = await create({
        lines: [{ ...demoInput().lines[0], unitPrice: "0" }],
      });
      assert.equal(
        (
          await call("post", `/${zero.id}/submit`).send({
            version: zero.version,
          })
        ).status,
        422,
      );
      let q = await pending();
      assert.equal(q.status, "PendingApproval");
      assert.equal(q.customerSnapshot.name, "Ocean Apparel");
      assert.equal(
        (
          await call("patch", `/${q.id}`).send({
            version: q.version,
            notes: "No",
          })
        ).status,
        409,
      );
      assert.equal(
        (await call("post", `/${q.id}/approve`).send({ version: q.version }))
          .status,
        403,
      );
      assert.equal(
        (
          await call("post", `/${q.id}/reject`, "manager").send({
            version: q.version,
            reason: "   ",
          })
        ).status,
        422,
      );
      q = await action(q, "reject", { reason: "Review pricing" }, "manager");
      assert.equal(q.submittedBy, null);
      assert.equal(q.status, "Draft");
      q = await action(q, "submit");
      q = await action(q, "withdraw", { reason: "Buyer changes" });
      assert.equal(q.submittedAt, null);
      q = await action(q, "submit");
      q = await action(q, "approve", {}, "manager");
      assert.equal(q.status, "Approved");
      q = await action(q, "void", { reason: "Withdrawn" }, "manager");
      assert.equal(q.status, "Cancelled");
      assert.equal(
        (
          await call("post", `/${q.id}/issue`).send({
            version: q.version,
            channel: "manual",
          })
        ).status,
        409,
      );
      const adminDraft = await create({}, "admin");
      const adminPending = await action(adminDraft, "submit", {}, "admin");
      assert.equal(
        (
          await call("post", `/${adminPending.id}/approve`, "admin").send({
            version: adminPending.version,
          })
        ).body.error.code,
        "SELF_APPROVAL_FORBIDDEN",
      );
    },
  );
  await t.test(
    "principal, scope, viewer and self approval restrictions apply to detail, PDF and every write",
    async () => {
      const q = await create();
      assert.equal((await request(app).get("/api/v1/quotations")).status, 401);
      for (const path of [`/${q.id}`, `/${q.id}/pdf`])
        assert.equal((await call("get", path, "outsider")).status, 404);
      assert.equal((await call("get", "", "outsider")).body.meta.total, 0);
      assert.equal(
        (
          await call("patch", `/${q.id}`, "outsider").send({
            version: q.version,
            notes: "x",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await call("patch", `/${q.id}`, "viewer").send({
            version: q.version,
            notes: "x",
          })
        ).status,
        403,
      );
      const read = (await call("get", `/${q.id}`, "viewer")).body.data;
      assert.deepEqual(read.allowedActions, ["pdf"]);
      assert.equal(
        (await call("post", "", "viewer").send(demoInput())).status,
        403,
      );
    },
  );
  await t.test(
    "exact Colombo midnight, delayed expiry, repeatable job and accepted conversion after validity",
    async () => {
      assert.equal(
        businessDate(new Date("2026-10-16T18:29:59.999Z")),
        "2026-10-16",
      );
      assert.equal(
        businessDate(new Date("2026-10-16T18:30:00.000Z")),
        "2026-10-17",
      );
      const q = await issued();
      await m.quotations.update(
        { validUntil: yesterday(), quotationDate: yesterday() },
        { where: { id: q.id } },
      );
      const response = await call("post", `/${q.id}/buyer-response`).send({
        version: q.version,
        decision: "Accepted",
        reference: "Delayed job",
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, "QUOTATION_EXPIRED");
      assert.equal((await detail(q)).status, "Expired");
      const jobQuote = await issued();
      await m.quotations.update(
        { validUntil: yesterday(), quotationDate: yesterday() },
        { where: { id: jobQuote.id } },
      );
      assert.ok((await context.service.expireAll()) >= 1);
      assert.equal(await context.service.expireAll(), 0);
      const acceptedQuote = await accepted();
      await m.quotations.update(
        { validUntil: yesterday(), quotationDate: yesterday() },
        { where: { id: acceptedQuote.id } },
      );
      const converted = await conversion(acceptedQuote);
      assert.equal(converted.status, 201, JSON.stringify(converted.body));
      const expiredApproval = await approved();
      await m.quotations.update(
        { validUntil: yesterday(), quotationDate: yesterday() },
        { where: { id: expiredApproval.id } },
      );
      assert.equal(
        (
          await call("post", `/${expiredApproval.id}/issue`).send({
            version: expiredApproval.version,
            channel: "manual",
          })
        ).body.error.code,
        "QUOTATION_EXPIRED",
      );
    },
  );
  await t.test(
    "frozen snapshots, current master activation checks and immutable conversion copies",
    async () => {
      const q = await pending();
      await m.customers.update(
        { name: "Changed buyer", isActive: false },
        { where: { id: ids.customer } },
      );
      await m.styles.update(
        { fabricDescription: "Changed fabric" },
        { where: { id: ids.style } },
      );
      try {
        assert.equal((await detail(q)).customerSnapshot.name, "Ocean Apparel");
        assert.equal((await detail(q)).lines[0].fabric, "100% cotton");
        assert.equal(
          (
            await call("post", `/${q.id}/approve`, "manager").send({
              version: q.version,
            })
          ).status,
          422,
        );
      } finally {
        await m.customers.update(
          { name: "Ocean Apparel", isActive: true },
          { where: { id: ids.customer } },
        );
        await m.styles.update(
          { fabricDescription: "100% cotton" },
          { where: { id: ids.style } },
        );
      }
      const a = await action(
        await action(q, "approve", {}, "manager"),
        "issue",
        { channel: "manual" },
      );
      const b = await action(a, "buyer-response", {
        decision: "Accepted",
        reference: "Snapshot test",
      });
      const r = await conversion(b);
      assert.equal(r.status, 201);
      const order = await m.sales_orders.findByPk(r.body.data.id);
      assert.equal(order.customerSnapshot.name, b.customerSnapshot.name);
      const lines = await m.sales_order_lines.findAll({
        where: { salesOrderId: order.id },
        order: [["lineNo", "ASC"]],
      });
      assert.equal(lines.length, 6);
      assert.equal(lines[0].fabricSnapshot, b.lines[0].fabric);
      assert.equal(lines[0].unitPrice, b.lines[0].unitPrice);
    },
  );
  await t.test(
    "Draft buyer display and submission refresh changed master snapshots",
    async () => {
      let q = await create();
      const lineId = q.lines[0].id;
      const variantId = q.lines[0].variantId;
      await m.customers.update(
        { name: "Current buyer" },
        { where: { id: ids.customer } },
      );
      await m.style_variants.update(
        { colour: "Midnight" },
        { where: { id: variantId } },
      );
      try {
        q = await detail(q);
        assert.equal(q.customerName, "Current buyer");
        assert.equal(q.lines[0].colour, "Midnight");
        q = await action(q, "submit");
        assert.equal(q.customerSnapshot.name, "Current buyer");
        assert.equal(q.lines[0].colour, "Midnight");
        assert.equal(q.lines[0].id, lineId);
        q = await action(q, "withdraw", { reason: "Refresh buyer" });
        await m.customers.update(
          { name: "Newest buyer" },
          { where: { id: ids.customer } },
        );
        const draft = await detail(q);
        assert.equal(draft.customerName, "Newest buyer");
        assert.equal(draft.customerSnapshot.name, "Current buyer");
      } finally {
        await m.customers.update(
          { name: "Ocean Apparel" },
          { where: { id: ids.customer } },
        );
        await m.style_variants.update(
          { colour: "Navy" },
          { where: { id: variantId } },
        );
      }
    },
  );
  await t.test(
    "revisions preserve active offer, replacement supersedes it, deleted replacements skip numbers",
    async () => {
      const old = await issued();
      let replacement = await action(
        old,
        "revisions",
        { reason: "Quantity update" },
        "sales",
        201,
      );
      assert.equal(replacement.quoteNumber, old.quoteNumber);
      assert.notEqual(replacement.id, old.id);
      assert.equal((await detail(old)).status, "Issued");
      assert.equal(
        (
          await call("post", `/${old.id}/revisions`).send({
            version: old.version,
            reason: "Again",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call("delete", `/${replacement.id}`).set(
            "If-Match",
            `"${replacement.version}"`,
          )
        ).status,
        204,
      );
      replacement = await action(
        old,
        "revisions",
        { reason: "Retry replacement" },
        "sales",
        201,
      );
      assert.equal(replacement.revision, 3);
      replacement = await action(replacement, "submit");
      replacement = await action(replacement, "approve", {}, "manager");
      replacement = await action(replacement, "issue", { channel: "manual" });
      const prior = await detail(old);
      assert.equal(prior.status, "Superseded");
      assert.equal(prior.version, old.version + 1);
      assert.equal(
        (await m.quotation_families.findByPk(old.familyId))
          .activeIssuedRevisionId,
        replacement.id,
      );
      const decline = await action(replacement, "buyer-response", {
        decision: "Declined",
        reference: "Buyer email",
        reason: "Delivery too late",
      });
      assert.equal(decline.status, "Declined");
      assert.equal(
        (await m.quotation_families.findByPk(old.familyId))
          .activeIssuedRevisionId,
        null,
      );
    },
  );
  await t.test(
    "acceptance locks competing drafts and serialized acceptance versus replacement issue has one winner",
    async () => {
      const old = await issued();
      const draft = await action(
        old,
        "revisions",
        { reason: "Proposal" },
        "sales",
        201,
      );
      await action(old, "buyer-response", {
        decision: "Accepted",
        reference: "Accept original",
      });
      const locked = await detail(draft);
      assert.equal(locked.familyLocked, true);
      assert.deepEqual(locked.allowedActions, ["pdf"]);
      assert.equal(
        (
          await call("patch", `/${draft.id}`).send({
            version: draft.version,
            notes: "Forbidden",
          })
        ).body.error.code,
        "FAMILY_ALREADY_ACCEPTED",
      );
      assert.equal(
        (
          await call("post", `/${draft.id}/submit`).send({
            version: draft.version,
          })
        ).status,
        409,
      );
      const original = await issued();
      let next = await action(
        original,
        "revisions",
        { reason: "Race" },
        "sales",
        201,
      );
      next = await action(
        await action(next, "submit"),
        "approve",
        {},
        "manager",
      );
      const [accept, issue] = await Promise.all([
        call("post", `/${original.id}/buyer-response`).send({
          version: original.version,
          decision: "Accepted",
          reference: "Race",
        }),
        call("post", `/${next.id}/issue`).send({
          version: next.version,
          channel: "manual",
        }),
      ]);
      assert.equal(
        [accept.status, issue.status].filter((s) => s === 200).length,
        1,
        `${accept.status}/${issue.status}`,
      );
      const family = await m.quotation_families.findByPk(original.familyId);
      if (accept.status === 200) {
        assert.equal(family.acceptedRevisionId, original.id);
        assert.equal((await detail(next)).status, "Approved");
      } else {
        assert.equal((await detail(original)).status, "Superseded");
        assert.equal(family.activeIssuedRevisionId, next.id);
      }
    },
  );
  await t.test(
    "concurrent PATCH versions produce exactly one winner",
    async () => {
      const q = await create();
      const results = await Promise.all(
        ["A", "B"].map((notes) =>
          call("patch", `/${q.id}`).send({ version: q.version, notes }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await detail(q)).version, q.version + 1);
    },
  );
  await t.test(
    "concurrent conversions, replay, payload conflict and soft deleted linked order",
    async () => {
      const q = await accepted();
      const key = randomUUID();
      const results = await Promise.all([
        conversion(q, key),
        conversion(q, randomUUID()),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
      assert.equal(results[0].body.data.id, results[1].body.data.id);
      assert.equal(results[0].body.data.deletedAt, null);
      assert.equal(
        await m.sales_orders.count({ where: { sourceQuotationId: q.id } }),
        1,
      );
      assert.equal(
        await m.sales_order_lines.count({
          where: { salesOrderId: results[0].body.data.id },
        }),
        6,
      );
      const replay = await conversion(q, key);
      assert.equal(replay.status, results[0].status);
      assert.deepEqual(replay.body, results[0].body);
      const mismatch = await conversion(q, key, q.version + 1);
      assert.equal(mismatch.status, 409);
      assert.equal(mismatch.body.error.code, "IDEMPOTENCY_KEY_REUSED");
      await m.sales_orders.update(
        { deletedAt: new Date() },
        { where: { id: results[0].body.data.id } },
      );
      const retry = await conversion(q, randomUUID(), 1);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.data.archived, true);
      assert.equal(retry.body.data.id, results[0].body.data.id);
      assert.equal(
        (await call("post", `/${q.id}/convert`).send({ version: 1 })).status,
        400,
      );
    },
  );
  await t.test(
    "same key concurrent attempts replay one completed result",
    async () => {
      const q = await accepted();
      const key = randomUUID();
      const [a, b] = await Promise.all([
        conversion(q, key),
        conversion(q, key),
      ]);
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.deepEqual(a.body, b.body);
    },
  );
  await t.test(
    "rollback on line, order and audit failures leaves no partial mutations or reservations",
    async () => {
      const q = await create();
      const old = await detail(q);
      m.quotation_lines.addHook("beforeBulkCreate", "injected-line", () => {
        throw new Error("Injected line failure");
      });
      try {
        assert.equal(
          (
            await call("patch", `/${q.id}`).send({
              version: q.version,
              lines: [demoInput().lines[0]],
            })
          ).status,
          500,
        );
      } finally {
        m.quotation_lines.removeHook("beforeBulkCreate", "injected-line");
      }
      assert.equal((await detail(q)).version, old.version);
      assert.equal((await detail(q)).lines.length, 6);
      for (const [table, hook] of [
        ["sales_orders", "beforeCreate"],
        ["sales_order_lines", "beforeBulkCreate"],
        ["audit_events", "beforeCreate"],
      ]) {
        const a = await accepted();
        const key = randomUUID();
        const sequence = await m.document_sequences.findOne({
          where: { documentType: "SALES_ORDER" },
        });
        const previous = sequence?.nextValue;
        m[table].addHook(hook, "injected", () => {
          throw new Error("Injected conversion failure");
        });
        try {
          assert.equal((await conversion(a, key)).status, 500);
        } finally {
          m[table].removeHook(hook, "injected");
        }
        assert.equal(
          await m.sales_orders.count({ where: { sourceQuotationId: a.id } }),
          0,
        );
        assert.equal(
          await m.idempotency_keys.count({ where: { idempotencyKey: key } }),
          0,
        );
        assert.equal((await detail(a)).status, "Accepted");
        assert.equal(
          (
            await m.document_sequences.findOne({
              where: { documentType: "SALES_ORDER" },
            })
          )?.nextValue,
          previous,
        );
        assert.equal((await conversion(a, key)).status, 201);
      }
    },
  );
  await t.test(
    "PDF contains quantities, fabric, terms and status but excludes staff notes",
    async () => {
      const q = await issued();
      const r = await call("get", `/${q.id}/pdf`);
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /application\/pdf/);
      assert.match(r.headers["content-disposition"], /^attachment;/);
      const pdf = await pdfParse(r.body);
      for (const term of [
        "TS-100",
        "100% cotton",
        "180",
        "Navy / S",
        "White / L",
        "1000 PCS",
        "5500.00",
        "30% advance",
        "Issued",
      ])
        assert.ok(pdf.text.includes(term), term);
      assert.ok(!pdf.text.includes("Internal:"));
      assert.equal((await detail(q)).status, "Issued");
      const draft = await create();
      const d = await call("get", `/${draft.id}/pdf`);
      assert.ok((await pdfParse(d.body)).text.includes("DRAFT"));
    },
  );
  await t.test(
    "invalid lifecycle action matrix, stale actions and append-only audit constraints",
    async () => {
      const states = [
        "Draft",
        "PendingApproval",
        "Approved",
        "Issued",
        "Accepted",
        "Declined",
        "Expired",
        "Superseded",
        "Cancelled",
        "Converted",
      ];
      const eligible = {
        submit: ["Draft"],
        approve: ["PendingApproval"],
        reject: ["PendingApproval"],
        withdraw: ["PendingApproval"],
        issue: ["Approved"],
        "buyer-response": ["Issued"],
        revisions: ["Approved", "Issued", "Declined", "Expired"],
        void: ["Approved", "Issued"],
      };
      for (const state of states) {
        const q = await create();
        await m.quotations.update({ status: state }, { where: { id: q.id } });
        for (const [name, allowed] of Object.entries(eligible))
          if (!allowed.includes(state)) {
            const body = {
              version: q.version,
              ...(["reject", "withdraw", "revisions", "void"].includes(name)
                ? { reason: "Matrix test" }
                : {}),
              ...(name === "issue" ? { channel: "manual" } : {}),
              ...(name === "buyer-response"
                ? { decision: "Accepted", reference: "Matrix email" }
                : {}),
            };
            const r = await call("post", `/${q.id}/${name}`, "manager").send(
              body,
            );
            assert.equal(
              r.status,
              409,
              `${state} ${name}: ${JSON.stringify(r.body)}`,
            );
          }
        if (state !== "Draft")
          assert.equal(
            (await call("delete", `/${q.id}`).set("If-Match", `"${q.version}"`))
              .status,
            409,
          );
      }
      const q = await create();
      await action(q, "submit");
      assert.equal(
        (
          await call("post", `/${q.id}/withdraw`).send({
            version: q.version,
            reason: "Stale",
          })
        ).body.error.code,
        "STALE_VERSION",
      );
      await assert.rejects(
        m.audit_events.update(
          { reason: "tamper" },
          { where: { entityId: q.id } },
        ),
        /append only/,
      );
      await assert.rejects(
        m.audit_events.destroy({ where: { entityId: q.id } }),
        /append only/,
      );
    },
  );
  await t.test(
    "list latest selection before status filter, history, pagination and safe search",
    async () => {
      const q = await issued();
      const next = await action(
        q,
        "revisions",
        { reason: "List test" },
        "sales",
        201,
      );
      const list = await call(
        "get",
        `?q=${encodeURIComponent(q.quoteNumber)}&pageSize=100`,
      );
      assert.equal(list.body.meta.total, 1);
      assert.equal(list.body.data[0].id, next.id);
      const status = await call("get", `?q=${q.quoteNumber}&status=Issued`);
      assert.equal(status.body.meta.total, 0);
      const history = await call(
        "get",
        `?q=${q.quoteNumber}&includeRevisions=true&sortBy=quotationDate&sortOrder=asc`,
      );
      assert.equal(history.body.meta.total, 2);
      const pages = await call("get", "?pageSize=1&page=2");
      assert.equal(pages.body.data.length, 1);
      assert.equal(pages.body.meta.page, 2);
      assert.equal((await call("get", "?pageSize=101")).status, 400);
      assert.equal((await call("get", "?sortBy=DROP")).status, 400);
      assert.equal(
        (await call("get", `?q=${encodeURIComponent("' OR 1=1 --")}`)).body.meta
          .total,
        0,
      );
    },
  );
});
