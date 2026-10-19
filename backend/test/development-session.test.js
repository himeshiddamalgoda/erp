import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import request from "supertest";
import { env } from "../src/config/env.js";
import { authContext, demoIds } from "../src/middleware/auth-context.js";
import { developmentSessionRoutes } from "../src/modules/development-session/development-session.js";
import { errorHandler } from "../src/shared/errors.js";
test("single API development session switches identities without trusting actor headers", async () => {
  const previous = {
    enabled: env.developmentAuth,
    actor: env.developmentActor,
    node: process.env.NODE_ENV,
  };
  env.developmentAuth = true;
  env.developmentActor = "sales";
  process.env.NODE_ENV = "development";
  const app = express();
  app.use(cors({ origin: "http://localhost:3000", credentials: true }));
  app.use(express.json());
  app.use("/api/v1/dev/session", developmentSessionRoutes());
  app.get("/identity", authContext, (req, res) => res.json(req.user));
  app.get(
    "/trusted",
    (req, res, next) => {
      req.user = {
        id: demoIds.sales,
        role: "Sales",
        salesTeamIds: [demoIds.team],
      };
      next();
    },
    authContext,
    (req, res) => res.json(req.user),
  );
  app.use(errorHandler);
  try {
    let cookie;
    for (const [workspace, role] of [
      ["manager", "SalesManager"],
      ["admin", "Admin"],
      ["sales", "Sales"],
    ]) {
      const changed = await request(app)
        .post("/api/v1/dev/session")
        .set("Origin", "http://localhost:3000")
        .send({ workspace });
      assert.equal(changed.status, 200);
      assert.equal(changed.headers["access-control-allow-credentials"], "true");
      cookie = changed.headers["set-cookie"][0];
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      const identity = await request(app)
        .get("/identity")
        .set("Cookie", cookie);
      assert.equal(identity.body.role, role);
      assert.equal(identity.body.id, demoIds[workspace]);
      const reloaded = await request(app)
        .get("/api/v1/dev/session")
        .set("Cookie", cookie);
      assert.equal(reloaded.body.data.workspace, workspace);
    }
    const admin = await request(app)
      .post("/api/v1/dev/session")
      .set("Origin", "http://localhost:3000")
      .send({ workspace: "admin" });
    cookie = admin.headers["set-cookie"][0];
    assert.equal(
      (await request(app).get("/trusted").set("Cookie", cookie)).body.role,
      "Sales",
    );
    assert.equal(
      (
        await request(app)
          .get("/identity")
          .set("Cookie", "erp_dev_workspace=admin." + "0".repeat(64))
      ).body.role,
      "Sales",
    );
    assert.equal(
      (await request(app).get("/identity").set("X-Dev-Actor", "admin")).body
        .role,
      "Sales",
    );
    assert.equal(
      (
        await request(app)
          .post("/api/v1/dev/session")
          .set("Origin", "https://untrusted.example")
          .send({ workspace: "admin" })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/v1/dev/session")
          .send({ workspace: "admin" })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/v1/dev/session")
          .set("Origin", "http://localhost:3000")
          .send({ workspace: "root" })
      ).status,
      400,
    );
    env.developmentAuth = false;
    assert.equal(
      (await request(app).get("/api/v1/dev/session").set("Cookie", cookie))
        .status,
      404,
    );
    assert.equal(
      (await request(app).get("/identity").set("Cookie", cookie)).status,
      401,
    );
    env.developmentAuth = true;
    process.env.NODE_ENV = "production";
    assert.equal(
      (await request(app).get("/api/v1/dev/session").set("Cookie", cookie))
        .status,
      404,
    );
  } finally {
    env.developmentAuth = previous.enabled;
    env.developmentActor = previous.actor;
    if (previous.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.node;
  }
});
