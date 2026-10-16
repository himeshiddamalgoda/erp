import "dotenv/config";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const port = Number(process.env.PORT || 4000);
const database = createDatabase();
const app = createApp({ database });
const server = app.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`ERP backend listening on http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      try {
        await Promise.all([database.close(), app.locals.quotations.close()]);
        process.exit(0);
      } catch (error) {
        console.error("Failed to close database connections:", error.message);
        process.exit(1);
      }
    });
  });
}
