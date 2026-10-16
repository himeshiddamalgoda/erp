import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { demoInput } from "../src/db/seeders/demo.js";
// Two local-only fixed-principal processes demonstrate separation of duties without fake tokens.
const basePort = Number(process.env.DEMO_PORT || 4100);
const children = [];
function start(actor, port) {
  const child = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      DEV_AUTH_ENABLED: "true",
      DEV_ACTOR: actor,
      PORT: String(port),
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.push(child);
  return child;
}
async function ready(port, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Demo ${port} exited before readiness`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/ready`);
      if (r.ok) return;
    } catch {
      /* starting */
    }
    await delay(100);
  }
  throw new Error("Demo server or MySQL unavailable");
}
async function post(port, path, body, key) {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/v1/quotations${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  console.log(
    `${response.status} POST ${path || "/"} -> ${result.data.status} (${result.data.id})`,
  );
  return result.data;
}
try {
  const sales = start("sales", basePort);
  const manager = start("manager", basePort + 1);
  await Promise.all([ready(basePort, sales), ready(basePort + 1, manager)]);
  let q = await post(basePort, "", demoInput());
  q = await post(basePort, `/${q.id}/submit`, { version: q.version });
  q = await post(basePort + 1, `/${q.id}/approve`, {
    version: q.version,
    comment: "Pricing reviewed",
  });
  q = await post(basePort, `/${q.id}/issue`, {
    version: q.version,
    channel: "manual",
  });
  q = await post(basePort, `/${q.id}/buyer-response`, {
    version: q.version,
    decision: "Accepted",
    reference: "Development buyer email",
  });
  const key = randomUUID();
  const order = await post(
    basePort,
    `/${q.id}/convert`,
    { version: q.version },
    key,
  );
  await post(basePort, `/${q.id}/convert`, { version: q.version }, key);
  console.log(
    JSON.stringify(
      {
        quotationId: q.id,
        salesOrderId: order.salesOrderId,
        idempotencyKey: key,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
    }),
  );
}
