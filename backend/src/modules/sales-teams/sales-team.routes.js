import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import { salesTeamController } from "./sales-team.controller.js";
export function salesTeamRoutes(service) {
  const r = Router(),
    c = salesTeamController(service);
  r.use(authContext);
  r.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  r.get("/", c.list);
  r.post("/", c.create);
  r.get("/:id", c.detail);
  r.patch("/:id", c.patch);
  r.post("/:id/archive", c.lifecycle("archive"));
  r.post("/:id/reactivate", c.lifecycle("reactivate"));
  return r;
}
