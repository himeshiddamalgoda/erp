import { randomUUID } from "node:crypto";
import { createQuotationContext } from "./db/context.js";
import { quotationRoutes } from "./modules/quotations/quotation.routes.js";
import { errorHandler, AppError } from "./shared/errors.js";
import { assertAuthConfiguration } from "./config/env.js";
import cors from "cors";
import express from "express";
import { createDatabase } from "./database.js";

export function createApp({
  database = createDatabase(),
  quotations,
  principalMiddleware,
} = {}) {
  assertAuthConfiguration();
  const context = quotations || createQuotationContext();
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      exposedHeaders: ["Content-Disposition", "X-Request-Id"],
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  if (principalMiddleware) app.use(principalMiddleware);
  app.use("/api/v1/quotations", quotationRoutes(context.service));
  app.locals.quotations = context;

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

  app.use((_request, _response, next) =>
    next(new AppError(404, "NOT_FOUND", "Route not found")),
  );
  app.use(errorHandler);

  return app;
}
