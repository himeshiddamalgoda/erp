import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";

async function withServer(database, check) {
  const server = createApp({ database }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await check(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("readiness queries the database and returns an uncached success", async () => {
  let calls = 0;
  await withServer({ check: async () => { calls += 1; } }, async (base) => {
    const response = await fetch(`${base}/api/ready`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      status: "ready", checks: { database: "ok" },
    });
    assert.equal(calls, 1);
  });
});

test("database failures return 503 without leaking connection details; liveness stays available", async () => {
  await withServer({ check: async () => { throw new Error("secret database details"); } }, async (base) => {
    const response = await fetch(`${base}/api/ready`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      status: "not_ready", checks: { database: "unavailable" },
    });
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", service: "erp-backend" });
  });
});

test("readiness recovers when the database becomes available again", async () => {
  let available = false;
  await withServer({ check: async () => { if (!available) throw new Error("offline"); } }, async (base) => {
    assert.equal((await fetch(`${base}/api/ready`)).status, 503);
    available = true;
    assert.equal((await fetch(`${base}/api/ready`)).status, 200);
  });
});
