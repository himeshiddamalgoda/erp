import { defineConfig } from "@playwright/test";
const database = process.env.TEST_DB_NAME;
if (!database || !/^[a-zA-Z0-9_]+_test$/.test(database))
  throw new Error(
    "Set TEST_DB_NAME to a provisioned, migrated and seeded isolated MySQL database ending in _test.",
  );
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chromium",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:4000",
        NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES: "true",
        NEXT_PUBLIC_MANAGER_API_URL: "http://localhost:4101",
      },
    },
    ...[
      ["sales", 4310],
      ["manager", 4311],
    ].map(([actor, port]) => ({
      command: "node src/server.js",
      cwd: "../backend",
      url: `http://127.0.0.1:${port}/api/ready`,
      reuseExistingServer: false,
      env: {
        DB_NAME: database,
        NODE_ENV: "development",
        DEV_AUTH_ENABLED: "true",
        DEV_ACTOR: actor,
        HOST: "127.0.0.1",
        PORT: String(port),
        FRONTEND_URL: "http://localhost:3000",
      },
    })),
  ],
});
