import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
const secret = randomBytes(32);
const cookieName = "erp_dev_workspace";
const workspaces = ["sales", "manager", "admin", "viewer"];
const enabled = () =>
  env.developmentAuth && process.env.NODE_ENV !== "production";
const sign = (value) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function readDevelopmentWorkspace(req) {
  if (!enabled()) return null;
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!raw) return null;
  const [workspace, signature = ""] = raw.split(".");
  if (!workspaces.includes(workspace) || !/^[a-f0-9]{64}$/.test(signature))
    return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(workspace)))
    ? workspace
    : null;
}
export function developmentSessionRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!enabled())
      return next(new AppError(404, "NOT_FOUND", "Route not found"));
    // Role switching is available only to the configured local development UI.
    if (
      req.method !== "GET" &&
      req.get("origin") !==
        (process.env.FRONTEND_URL || "http://localhost:3000")
    )
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "Use the configured frontend to switch development workspaces",
        ),
      );
    next();
  });
  router.get("/", (req, res) =>
    res.json({
      data: {
        workspace: readDevelopmentWorkspace(req) || env.developmentActor,
      },
    }),
  );
  router.post("/", (req, res, next) => {
    const workspace = req.body?.workspace;
    if (
      !["sales", "manager", "admin"].includes(workspace) ||
      Object.keys(req.body || {}).some((k) => k !== "workspace")
    )
      return next(
        new AppError(
          400,
          "INVALID_REQUEST",
          "Choose Sales, Manager or Admin workspace",
        ),
      );
    res.cookie(cookieName, `${workspace}.${sign(workspace)}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/api",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ data: { workspace } });
  });
  return router;
}
