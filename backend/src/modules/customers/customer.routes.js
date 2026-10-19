import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import { customerController } from "./customer.controller.js";
export function customerRoutes(service) {
  const router = Router(),
    c = customerController(service);
  router.use(authContext);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.detail);
  router.patch("/:id", c.patch);
  router.post("/:id/archive", c.lifecycle("archive"));
  router.post("/:id/reactivate", c.lifecycle("reactivate"));
  return router;
}
