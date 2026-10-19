import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createSequelize } from "../../src/db/sequelize.js";
import { createQuotationContext } from "../../src/db/context.js";
import { migrate } from "../../src/db/migrate.js";
import {
  seedSalesTeams,
  salesTeamDemoIds as teamIds,
} from "../../src/db/seeders/sales-teams-demo.js";
import { demoIds as ids } from "../../src/middleware/auth-context.js";
import { customerDemoInput } from "../../src/db/seeders/customers-demo.js";
import { demoInput } from "../../src/db/seeders/demo.js";
import { env } from "../../src/config/env.js";
import {
  parse,
  createSchema as customerCreate,
} from "../../src/modules/customers/customer.schemas.js";
import {
  parse as parseTeam,
  patchSchema as teamPatch,
} from "../../src/modules/sales-teams/sales-team.schemas.js";
import { createSchema as orderCreate } from "../../src/modules/sales-orders/sales-order.schemas.js";
import { createApp } from "../../src/app.js";
const database = process.env.TEST_DB_NAME;
if (
  database &&
  (!/^[a-zA-Z0-9_]+_test$/.test(database) ||
    database === (process.env.DB_NAME || process.env.MYSQL_DATABASE || "erp"))
)
  throw new Error("Refusing unsafe Sales Teams test database");
const gate = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test(
  "MySQL Sales Teams integration",
  {
    skip: database
      ? false
      : "Set TEST_DB_NAME to an isolated MySQL database ending in _test",
  },
  async (t) => {
    const oldAuth = env.developmentAuth;
    env.developmentAuth = false;
    t.after(() => {
      env.developmentAuth = oldAuth;
    });
    const db = createSequelize({ database }),
      ctx = createQuotationContext(db),
      m = ctx.models,
      s = ctx.salesTeams;
    await migrate(db);
    await seedSalesTeams(ctx);
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
      scoped: { id: ids.sales, role: "Sales", salesTeamIds: [] },
      teamAdmin: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [],
        capabilities: ["sales-teams:write"],
      },
      assigner: {
        id: ids.manager,
        role: "SalesManager",
        salesTeamIds: [],
        capabilities: ["assignments:write"],
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
        [method]("/api/v1/sales-teams" + path)
        .set("X-Test-Actor", actor);
    const teamInput = () => ({
      name: "Export Sales",
      description: "Overseas buyers",
      managerId: ids.manager,
      memberIds: [ids.manager, ids.sales, teamIds.merchandiserB],
    });
    const create = async (
      changes = {},
      actor = "admin",
      key = randomUUID(),
    ) => {
      const response = await call("post", "", actor)
        .set("Idempotency-Key", key)
        .send({ ...teamInput(), ...changes });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response.body.data;
    };
    const detail = async (team) => {
      const r = await call("get", `/${team.id}?includeInactiveMembers=true`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.data;
    };
    const patch = async (team, changes, status = 200, actor = "admin") => {
      const r = await call("patch", "/" + team.id, actor).send({
        version: team.version,
        ...changes,
      });
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r;
    };
    const life = async (team, action, status = 200, actor = "admin") => {
      const r = await call("post", `/${team.id}/${action}`, actor).send({
        version: team.version,
        reason: "Test lifecycle reason",
      });
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r;
    };
    const buyer = async (team, ownerId = ids.sales) =>
      (
        await ctx.customers.create(
          actors.admin,
          parse(customerCreate, {
            ...customerDemoInput(),
            salesTeamId: team.id,
            ownerId,
          }),
          randomUUID(),
          "teams-test",
        )
      ).body.data;
    const quote = async (team, c, ownerId = ids.sales) =>
      ctx.service.create(
        actors.admin,
        {
          ...demoInput(),
          salesTeamId: team.id,
          ownerId,
          customerId: c.id,
          billingAddressId: c.addresses.find((a) => a.addressType === "billing")
            .id,
          shippingAddressId: c.addresses.find(
            (a) => a.addressType === "shipping" && a.isDefault,
          ).id,
        },
        "teams-test",
      );
    const order = async (team, c, ownerId = ids.sales) => {
      const { quotationDate, validUntil: _v, notes, ...input } = demoInput();
      return (
        await ctx.salesOrders.create(
          actors.admin,
          parse(orderCreate, {
            ...input,
            salesTeamId: team.id,
            ownerId,
            customerId: c.id,
            billingAddressId: c.addresses.find(
              (a) => a.addressType === "billing",
            ).id,
            shippingAddressId: c.addresses.find(
              (a) => a.addressType === "shipping" && a.isDefault,
            ).id,
            orderDate: quotationDate,
            buyerPoNumber: "TEAM-" + randomUUID(),
          }),
          randomUUID(),
          "teams-test",
        )
      ).body.data;
    };
    const reassign = async (
      type,
      entity,
      target,
      ownerId = teamIds.merchandiserB,
      status = 200,
      actor = "admin",
    ) => {
      const r = await request(app)
        .post("/api/v1/assignments/reassign")
        .set("X-Test-Actor", actor)
        .send({
          entityType: type,
          entityId: entity.id,
          salesTeamId: target.id,
          ownerId,
          version: entity.version,
          reason: "Resolve ownership before member removal",
        });
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r;
    };
    await t.test(
      "deterministic seed is repeatable and create validates manager/member invariants",
      async () => {
        const count = await m.sales_teams.count();
        await seedSalesTeams(ctx);
        assert.equal(await m.sales_teams.count(), count);
        const team = await create();
        assert.match(team.code, /^TEAM-\d{6,}$/);
        assert.equal(team.status, "Active");
        assert.equal(team.activeMemberCount, 3);
        assert.equal(team.eligibleMemberCount, 3);
        assert.equal(
          team.members.find((x) => x.userId === ids.manager).teamRole,
          "Manager",
        );
        assert.equal(team.integrityWarnings.length, 0);
        assert.ok(team.members.every((x) => x.joinedAt && x.lastActivatedAt));
        for (const changes of [
          { memberIds: [] },
          { memberIds: [ids.manager, ids.manager] },
          { managerId: ids.sales },
          { memberIds: [ids.sales] },
          { memberIds: [ids.manager, randomUUID()] },
          { code: "injected" },
          { isActive: false },
        ]) {
          const r = await call("post")
            .set("Idempotency-Key", randomUUID())
            .send({ ...teamInput(), ...changes });
          assert.equal(r.status, 422, JSON.stringify(r.body));
        }
      },
    );
    await t.test(
      "omitted membership/no-op preserve rows; full set removal and durable reactivation",
      async () => {
        let team = await create();
        const original = await m.sales_team_members.findOne({
            where: { teamId: team.id, userId: ids.sales },
          }),
          before = await m.audit_events.count({
            where: { entityType: "sales_team", entityId: team.id },
          });
        team = (
          await patch(team, {
            memberIds: [teamIds.merchandiserB, ids.sales, ids.manager],
          })
        ).body.data;
        assert.equal(team.version, 1);
        assert.equal(
          await m.audit_events.count({
            where: { entityType: "sales_team", entityId: team.id },
          }),
          before,
        );
        team = (await patch(team, { name: "Renamed team" })).body.data;
        assert.equal(team.activeMemberCount, 3);
        team = (
          await patch(team, {
            memberIds: [ids.manager, teamIds.merchandiserB],
            reason: "Temporary removal",
          })
        ).body.data;
        assert.equal(team.activeMemberCount, 2);
        const removed = team.members.find((x) => x.userId === ids.sales);
        assert.equal(removed.membershipActive, false);
        assert.ok(removed.removedAt);
        team = (
          await patch(team, {
            memberIds: [ids.manager, ids.sales, teamIds.merchandiserB],
            reason: "Return to team",
          })
        ).body.data;
        const returned = await m.sales_team_members.findOne({
          where: { teamId: team.id, userId: ids.sales },
        });
        assert.equal(
          returned.joinedAt.toISOString(),
          original.joinedAt.toISOString(),
        );
        assert.equal(returned.addedBy, original.addedBy);
        assert.equal(returned.removedAt, null);
        assert.equal(
          await m.sales_team_members.count({ where: { teamId: team.id } }),
          3,
        );
      },
    );
    await t.test(
      "manager replacement requires reason and final membership without changing user roles",
      async () => {
        let team = await create();
        assert.equal(
          (
            await patch(
              team,
              {
                memberIds: [ids.sales, teamIds.merchandiserB],
                reason: "Remove manager",
              },
              422,
            )
          ).body.error.code,
          "MANAGER_MUST_BE_MEMBER",
        );
        await patch(team, { managerId: ids.admin }, 422);
        team = (
          await patch(team, {
            managerId: ids.admin,
            memberIds: [ids.admin, ids.manager, ids.sales],
            reason: "New manager; retain old manager",
          })
        ).body.data;
        assert.equal(
          team.members.find((x) => x.userId === ids.manager).teamRole,
          "Member",
        );
        assert.equal(
          (await m.users.findByPk(ids.manager)).role,
          "SalesManager",
        );
        await patch(
          team,
          { managerId: ids.sales, reason: "Ordinary staff not manager" },
          422,
        );
      },
    );
    await t.test(
      "member removal rejects all owned active assignments atomically then supporting route resolves each entity",
      async () => {
        let team = await create(),
          c = await buyer(team),
          q = await quote(team, c),
          o = await order(team, c);
        const originalQ = (await m.quotations.findByPk(q.id)).toJSON(),
          originalO = (await m.sales_orders.findByPk(o.id)).toJSON();
        const r = await patch(
          team,
          {
            memberIds: [ids.manager],
            managerId: ids.manager,
            reason: "Remove both members",
          },
          409,
        );
        assert.equal(r.body.error.code, "MEMBER_HAS_ACTIVE_ASSIGNMENTS");
        assert.equal(r.body.error.details.blockerCount, 3);
        assert.equal((await detail(team)).activeMemberCount, 3);
        c = (await reassign("customer", c, team)).body.data;
        assert.equal((await m.quotations.findByPk(q.id)).ownerId, ids.sales);
        assert.equal((await m.sales_orders.findByPk(o.id)).ownerId, ids.sales);
        q = (await reassign("quotation", q, team)).body.data;
        o = (await reassign("salesOrder", o, team)).body.data;
        const changedQ = (await m.quotations.findByPk(q.id)).toJSON(),
          changedO = (await m.sales_orders.findByPk(o.id)).toJSON();
        for (const key of [
          "customerSnapshot",
          "billingAddressSnapshot",
          "shippingAddressSnapshot",
          "approvedBy",
          "status",
          "total",
        ])
          assert.deepEqual(changedQ[key], originalQ[key]);
        for (const key of [
          "customerSnapshot",
          "billingAddressSnapshot",
          "shippingAddressSnapshot",
          "confirmedBy",
          "status",
          "total",
        ])
          assert.deepEqual(changedO[key], originalO[key]);
        team = (
          await patch(team, {
            memberIds: [ids.manager, teamIds.merchandiserB],
            reason: "Assignments resolved",
          })
        ).body.data;
        assert.equal(team.version, 2);
        assert.equal(team.activeMemberCount, 2);
        assert.ok(
          await m.audit_events.count({
            where: {
              entityType: "sales_team",
              entityId: team.id,
              action: "TeamMembershipChanged",
            },
          }),
        );
      },
    );
    await t.test(
      "archive blocker matrix covers every active quote/order status and all quotation revisions",
      async () => {
        const team = await create(),
          c = await buyer(team),
          q = await quote(team, c),
          o = await order(team, c);
        const initial = await detail(team);
        assert.ok(initial.assignmentSummary.blockers.length >= 3);
        assert.ok(
          initial.assignmentSummary.blockers.every(
            (b) => b.validityEnded === false,
          ),
          "Non-expired customer, Draft quote and order blockers must not display expiry hints",
        );
        await m.customers.update(
          {
            isActive: false,
            archivedAt: new Date(),
            archivedBy: ids.admin,
            archiveReason: "Isolated blocker fixture",
          },
          { where: { id: c.id } },
        );
        await m.sales_orders.update(
          { status: "Closed" },
          { where: { id: o.id } },
        );
        for (const status of [
          "Draft",
          "PendingApproval",
          "Approved",
          "Issued",
          "Accepted",
        ]) {
          await m.quotations.update(
            {
              status,
              ...(status === "Issued"
                ? { quotationDate: "1999-12-01", validUntil: "2000-01-01" }
                : {}),
            },
            { where: { id: q.id } },
          );
          const r = await life(team, "archive", 409);
          assert.equal(r.body.error.details.openQuotationCount, 1);
          if (status === "Issued")
            assert.equal(r.body.error.details.blockers[0].validityEnded, true);
          else
            assert.equal(r.body.error.details.blockers[0].validityEnded, false);
        }
        await m.quotations.update(
          { status: "Cancelled" },
          { where: { id: q.id } },
        );
        for (const status of [
          "Draft",
          "Confirmed",
          "InProgress",
          "PartiallyDelivered",
          "Delivered",
        ]) {
          await m.sales_orders.update({ status }, { where: { id: o.id } });
          const r = await life(team, "archive", 409);
          assert.equal(r.body.error.details.openSalesOrderCount, 1);
        }
        await m.sales_orders.update(
          { status: "Closed" },
          { where: { id: o.id } },
        );
        const row = (await m.quotations.findByPk(q.id)).toJSON();
        await m.quotations.update({ status: "Draft" }, { where: { id: q.id } });
        await m.quotations.create({
          ...row,
          id: randomUUID(),
          revisionNo: 2,
          status: "Cancelled",
        });
        assert.equal(
          (await life(team, "archive", 409)).body.error.details
            .openQuotationCount,
          1,
        );
      },
    );
    await t.test(
      "terminal/deleted records and other-team assignments do not block member removal/archive",
      async () => {
        let team = await create(),
          other = await create(),
          c = await buyer(other),
          q = await quote(team, c),
          o = await order(team, c);
        for (const status of [
          "Declined",
          "Expired",
          "Superseded",
          "Cancelled",
          "Converted",
        ]) {
          await m.quotations.update({ status }, { where: { id: q.id } });
          await m.sales_orders.update(
            { status: "Closed" },
            { where: { id: o.id } },
          );
          assert.equal((await detail(team)).assignmentSummary.canArchive, true);
        }
        await m.quotations.update(
          { status: "Draft", deletedAt: new Date() },
          { where: { id: q.id } },
        );
        await m.sales_orders.update(
          { status: "Draft", deletedAt: new Date() },
          { where: { id: o.id } },
        );
        team = (
          await patch(team, {
            memberIds: [ids.manager],
            reason: "Only terminal/other-team assignments",
          })
        ).body.data;
        team = (await life(team, "archive")).body.data;
        assert.equal(team.status, "Archived");
        assert.equal(team.activeMemberCount, 1);
      },
    );
    await t.test(
      "archive preserves memberships and historical access; invalid users require archived repair",
      async () => {
        let team = await create();
        actors.scoped.salesTeamIds = [team.id];
        team = (await life(team, "archive")).body.data;
        assert.equal((await call("get", "/" + team.id, "scoped")).status, 200);
        await life(team, "archive", 409);
        await m.users.update(
          { isActive: false },
          { where: { id: teamIds.merchandiserB } },
        );
        try {
          let d = await detail(team);
          assert.equal(d.eligibleMemberCount, 2);
          assert.ok(
            d.integrityWarnings.some((w) => w.code === "INVALID_MEMBER"),
          );
          assert.ok(!d.allowedActions.includes("reactivate"));
          await life(team, "reactivate", 422);
          team = (
            await patch(team, {
              memberIds: [ids.manager, ids.sales],
              reason: "Remove inactive stale member",
            })
          ).body.data;
          assert.equal(team.status, "Archived");
          team = (await life(team, "reactivate")).body.data;
          assert.equal(team.archivedAt, null);
          assert.equal(team.archivedBy, null);
        } finally {
          await m.users.update(
            { isActive: true },
            { where: { id: teamIds.merchandiserB } },
          );
        }
      },
    );
    await t.test(
      "stale version and injected audit/member failures roll back profile and membership changes",
      async () => {
        const team = await create();
        await patch({ ...team, version: 2 }, { name: "Stale" }, 409);
        for (const stage of ["audit", "updateWhere"]) {
          const original = s.r[stage];
          s.r[stage] = async (...args) => {
            if (stage === "audit" || args[0] === "sales_teams")
              throw new Error("injected team failure");
            return original.apply(s.r, args);
          };
          try {
            await patch(
              team,
              {
                name: "Must rollback",
                memberIds: [ids.manager],
                reason: "Atomic failure",
              },
              500,
            );
          } finally {
            s.r[stage] = original;
          }
          const d = await detail(team);
          assert.equal(d.name, team.name);
          assert.equal(d.version, 1);
          assert.equal(d.activeMemberCount, 3);
        }
        const results = await Promise.all(
          ["Winner A", "Winner B"].map((name) =>
            call("patch", "/" + team.id).send({ version: 1, name }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      },
    );
    await t.test(
      "concurrent code allocation and same-key canonical replay; rollback includes reservations",
      async () => {
        const key = randomUUID(),
          body = teamInput(),
          results = await Promise.all([
            call("post").set("Idempotency-Key", key).send(body),
            call("post")
              .set("Idempotency-Key", key)
              .send({
                ...Object.fromEntries(Object.entries(body).reverse()),
                memberIds: [...body.memberIds].reverse(),
              }),
          ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [201, 201],
        );
        assert.deepEqual(results[0].body, results[1].body);
        assert.equal(
          (
            await call("post")
              .set("Idempotency-Key", key)
              .send({ ...body, name: "Different" })
          ).body.error.code,
          "IDEMPOTENCY_KEY_REUSED",
        );
        const teams = await Promise.all(
          Array.from({ length: 4 }, () => create()),
        );
        assert.equal(new Set(teams.map((t) => t.code)).size, 4);
        const original = s.r.audit,
          before = await m.sales_teams.count(),
          failedKey = randomUUID();
        s.r.audit = async () => {
          throw new Error("injected create audit");
        };
        try {
          assert.equal(
            (await call("post").set("Idempotency-Key", failedKey).send(body))
              .status,
            500,
          );
        } finally {
          s.r.audit = original;
        }
        assert.equal(await m.sales_teams.count(), before);
        assert.equal(
          await m.idempotency_keys.count({
            where: {
              actorId: ids.admin,
              operation: "sales-teams:create",
              idempotencyKey: failedKey,
            },
          }),
          0,
        );
      },
    );
    await t.test(
      "live scope revokes stale token list/detail/customer/document/PDF/history access after member removal",
      async () => {
        let team = await create(),
          c = await buyer(team, teamIds.merchandiserB),
          q = await quote(team, c, teamIds.merchandiserB),
          o = await order(team, c, teamIds.merchandiserB);
        actors.scoped.salesTeamIds = [team.id];
        assert.equal((await call("get", "/" + team.id, "scoped")).status, 200);
        team = (
          await patch(team, {
            memberIds: [ids.manager, teamIds.merchandiserB],
            reason: "Remove idle Sales member",
          })
        ).body.data;
        for (const path of [
          `/sales-teams/${team.id}`,
          `/customers/${c.id}`,
          `/quotations/${q.id}`,
          `/quotations/${q.id}/pdf`,
          `/sales-orders/${o.id}`,
          `/sales-orders/${o.id}/activity`,
          `/sales-orders/${o.id}/pdf`,
        ])
          assert.equal(
            (
              await request(app)
                .get("/api/v1" + path)
                .set("X-Test-Actor", "scoped")
            ).status,
            404,
            path,
          );
        const list = await call("get", "", "scoped");
        assert.equal(list.body.meta.total, 0);
        const options = await request(app)
          .get("/api/v1/reference-data/quotation-options")
          .set("X-Test-Actor", "scoped");
        assert.deepEqual(options.body.data.actor.salesTeamIds, []);
      },
    );
    await t.test(
      "role/capability policy, hidden blockers, capped examples, safe directory and filters",
      async () => {
        const team = await create(),
          c = await buyer(team),
          q = await quote(team, c);
        for (const role of ["sales", "manager", "viewer"]) {
          assert.equal(
            (
              await call("post", "", role)
                .set("Idempotency-Key", randomUUID())
                .send(teamInput())
            ).status,
            403,
          );
          assert.equal((await call("get", "/" + team.id, role)).status, 404);
        }
        assert.equal(
          (await call("get", "/" + team.id, "teamAdmin")).status,
          200,
        );
        const hidden = await life(team, "archive", 409, "teamAdmin");
        assert.equal(hidden.body.error.details.blockerCount, 0);
        assert.equal(hidden.body.error.details.restrictedBlockers, true);
        assert.deepEqual(hidden.body.error.details.blockers, []);
        assert.ok(!JSON.stringify(hidden.body).includes(q.id));
        const row = (await m.quotations.findByPk(q.id)).toJSON();
        for (let i = 2; i <= 22; i++)
          await m.quotations.create({
            ...row,
            id: randomUUID(),
            revisionNo: i,
          });
        assert.equal(
          (await detail(team)).assignmentSummary.blockers.length,
          20,
        );
        const directory = await request(app)
          .get("/api/v1/users?status=Active&managerEligible=true")
          .set("X-Test-Actor", "teamAdmin");
        assert.equal(directory.status, 200);
        assert.ok(
          directory.body.data.every((u) => u.managerEligible && u.role),
        );
        assert.ok(
          directory.body.data.every(
            (u) => !("email" in u) && !("password" in u),
          ),
        );
        const literal = await create({ name: "Literal %_ " + randomUUID() });
        const search = await call("get", "?q=" + encodeURIComponent("%_"));
        assert.ok(search.body.data.some((t) => t.id === literal.id));
        assert.ok(
          search.body.data.every(
            (t) => t.name.includes("%_") || t.code.includes("%_"),
          ),
        );
        assert.equal(
          (await call("get", "?q=" + randomUUID())).body.meta.total,
          0,
        );
        for (const query of [
          "pageSize=101",
          "page=0",
          "sortBy=managerId",
          "foo=bar",
        ])
          assert.equal((await call("get", "?" + query)).status, 400);
        assert.equal((await call("get", "/invalid-id")).status, 400);
        assert.equal((await call("delete", "/" + team.id)).status, 404);
      },
    );
    await t.test(
      "explicit source AND target assignment permission; terminal transfers rejected",
      async () => {
        const source = await create(),
          target = await create(),
          c = await buyer(source),
          q = await quote(source, c);
        actors.assigner.salesTeamIds = [source.id];
        await reassign(
          "quotation",
          q,
          target,
          teamIds.merchandiserB,
          403,
          "assigner",
        );
        actors.assigner.salesTeamIds = [source.id, target.id];
        const moved = (
          await reassign(
            "quotation",
            q,
            target,
            teamIds.merchandiserB,
            200,
            "assigner",
          )
        ).body.data;
        assert.equal(moved.salesTeamId, target.id);
        await m.quotations.update(
          { status: "Cancelled" },
          { where: { id: q.id } },
        );
        await reassign("quotation", moved, source, ids.sales, 409);
        await reassign("customer", c, target, ids.sales, 403, "assigner");
      },
    );
    await t.test(
      "team-only archive races: writer first sees committed blocker; archive first rejects queued new work",
      async () => {
        for (const first of ["writer", "archive"]) {
          const team = await create(),
            entered = gate(),
            release = gate();
          if (first === "writer") {
            const original = ctx.customers.assignment;
            let once = true;
            ctx.customers.assignment = async function (...args) {
              const result = await original.apply(this, args);
              if (once && args[1].salesTeamId === team.id) {
                once = false;
                entered.resolve();
                await release.promise;
              }
              return result;
            };
            const writing = buyer(team);
            await entered.promise;
            const archiving = s.lifecycle(
              actors.admin,
              team.id,
              "archive",
              { version: 1, reason: "Race check" },
              "test",
            );
            const rejected = assert.rejects(
              archiving,
              (e) => e.code === "TEAM_HAS_ACTIVE_ASSIGNMENTS",
            );
            release.resolve();
            try {
              await Promise.all([writing, rejected]);
            } finally {
              ctx.customers.assignment = original;
              release.resolve();
            }
          } else {
            const original = s.r.assignments;
            let once = true;
            s.r.assignments = async function (...args) {
              const result = await original.apply(this, args);
              if (once && args[0] === team.id) {
                once = false;
                entered.resolve();
                await release.promise;
              }
              return result;
            };
            const archiving = s.lifecycle(
              actors.admin,
              team.id,
              "archive",
              { version: 1, reason: "Race check" },
              "test",
            );
            await entered.promise;
            const writing = buyer(team),
              rejected = assert.rejects(writing, (e) => e.status === 422);
            release.resolve();
            try {
              await Promise.all([archiving, rejected]);
            } finally {
              s.r.assignments = original;
              release.resolve();
            }
          }
        }
      },
    );
    await t.test(
      "member removal races assignment in both directions and live guard rejects removed ownership",
      async () => {
        for (const first of ["writer", "removal"]) {
          const team = await create(),
            entered = gate(),
            release = gate();
          const input = parseTeam(teamPatch, {
            version: 1,
            memberIds: [ids.manager, teamIds.merchandiserB],
            reason: "Race removal",
          });
          if (first === "writer") {
            const original = ctx.customers.assignment;
            let once = true;
            ctx.customers.assignment = async function (...args) {
              const result = await original.apply(this, args);
              if (once && args[1].salesTeamId === team.id) {
                once = false;
                entered.resolve();
                await release.promise;
              }
              return result;
            };
            const writing = buyer(team);
            await entered.promise;
            const removing = s.patch(actors.admin, team.id, input, "test"),
              rejected = assert.rejects(
                removing,
                (e) => e.code === "MEMBER_HAS_ACTIVE_ASSIGNMENTS",
              );
            release.resolve();
            try {
              await Promise.all([writing, rejected]);
            } finally {
              ctx.customers.assignment = original;
              release.resolve();
            }
          } else {
            const original = s.r.assignments;
            let once = true;
            s.r.assignments = async function (...args) {
              const result = await original.apply(this, args);
              if (once && args[0] === team.id) {
                once = false;
                entered.resolve();
                await release.promise;
              }
              return result;
            };
            const removing = s.patch(actors.admin, team.id, input, "test");
            await entered.promise;
            const writing = buyer(team),
              rejected = assert.rejects(writing, (e) => e.status === 422);
            release.resolve();
            try {
              await Promise.all([removing, rejected]);
            } finally {
              s.r.assignments = original;
              release.resolve();
            }
          }
        }
      },
    );
    await t.test(
      "cross-team concurrent transfers use sorted teams and independent entity versions",
      async () => {
        const a = await create(),
          b = await create(),
          c1 = await buyer(a),
          c2 = await buyer(b),
          q1 = await quote(a, c1),
          q2 = await quote(b, c2);
        const moves = await Promise.all([
          reassign("quotation", q1, b),
          reassign("quotation", q2, a),
        ]);
        assert.deepEqual(
          moves.map((r) => r.status),
          [200, 200],
        );
        assert.equal((await m.customers.findByPk(c1.id)).salesTeamId, a.id);
        assert.equal((await detail(a)).version, 1);
      },
    );
    await t.test(
      "inactive role/member warnings block new work while explicit existing ownership repair remains possible",
      async () => {
        const team = await create(),
          c = await buyer(team);
        await m.users.update({ isActive: false }, { where: { id: ids.sales } });
        try {
          const d = await detail(team);
          assert.equal(d.activeMemberCount, 3);
          assert.equal(d.eligibleMemberCount, 2);
          assert.equal(d.eligibleForAssignment, false);
          await assert.rejects(
            quote(team, c, teamIds.merchandiserB),
            (e) => e.status === 422,
          );
          const repaired = (await reassign("customer", c, team)).body.data;
          assert.equal(repaired.ownerId, teamIds.merchandiserB);
          const changed = (
            await patch(team, {
              memberIds: [ids.manager, teamIds.merchandiserB],
              reason: "Retire inactive owner after repair",
            })
          ).body.data;
          assert.equal(changed.activeMemberCount, 2);
        } finally {
          await m.users.update(
            { isActive: true },
            { where: { id: ids.sales } },
          );
        }
      },
    );
    await t.test(
      "team list counts use a bounded set of queries and expose stale-member counts",
      async () => {
        const original = db.options.logging,
          queries = [];
        db.options.logging = (sql) => queries.push(sql);
        try {
          const r = await call("get", "?pageSize=100");
          assert.equal(r.status, 200);
          assert.ok(r.body.data.length > 10);
          assert.ok(
            queries.filter((sql) => /SELECT /i.test(sql)).length <= 3,
            queries.join("\n"),
          );
        } finally {
          db.options.logging = original;
        }
      },
    );
    await t.test(
      "quotation and direct-order creation participate in team archive locking in both directions",
      async () => {
        const other = await create(),
          c = await buyer(other);
        for (const kind of ["quotation", "order"])
          for (const first of ["writer", "archive"]) {
            const team = await create(),
              entered = gate(),
              release = gate(),
              service = kind === "quotation" ? ctx.service : ctx.salesOrders;
            if (first === "writer") {
              const original = service.masters;
              let once = true;
              service.masters = async function (...args) {
                const result = await original.apply(this, args);
                if (
                  once &&
                  args[0].salesTeamId === team.id &&
                  args[4] !== false
                ) {
                  once = false;
                  entered.resolve();
                  await release.promise;
                }
                return result;
              };
              const writing =
                kind === "quotation" ? quote(team, c) : order(team, c);
              await entered.promise;
              const rejected = assert.rejects(
                s.lifecycle(
                  actors.admin,
                  team.id,
                  "archive",
                  { version: 1, reason: "Document race" },
                  "test",
                ),
                (e) => e.code === "TEAM_HAS_ACTIVE_ASSIGNMENTS",
              );
              release.resolve();
              try {
                await Promise.all([writing, rejected]);
              } finally {
                service.masters = original;
                release.resolve();
              }
            } else {
              const original = s.r.assignments;
              let once = true;
              s.r.assignments = async function (...args) {
                const result = await original.apply(this, args);
                if (once && args[0] === team.id) {
                  once = false;
                  entered.resolve();
                  await release.promise;
                }
                return result;
              };
              const archiving = s.lifecycle(
                actors.admin,
                team.id,
                "archive",
                { version: 1, reason: "Document race" },
                "test",
              );
              await entered.promise;
              const writing =
                  kind === "quotation" ? quote(team, c) : order(team, c),
                rejected = assert.rejects(writing, (e) => e.status === 422);
              release.resolve();
              try {
                await Promise.all([archiving, rejected]);
              } finally {
                s.r.assignments = original;
                release.resolve();
              }
            }
          }
      },
    );
  },
);
