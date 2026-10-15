import cors from "cors";
import express from "express";
import { createDatabase } from "./database.js";

export function createApp({ database = createDatabase() } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "erp-backend" });
  });

  app.get("/api/ready", async (_request, response) => {
    response.set("Cache-Control", "no-store");

    try {
      await database.check();
      response.json({ status: "ready", checks: { database: "ok" } });
    } catch {
      response.status(503).json({
        status: "not_ready",
        checks: { database: "unavailable" },
      });
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found" });
  });

  app.use((error, _request, response, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: status >= 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}
