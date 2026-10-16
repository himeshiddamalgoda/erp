import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import { quotationController } from "./quotation.controller.js";
export function quotationRoutes(service) {
  const router = Router();
  const c = quotationController(service);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.use(authContext);
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.detail);
  router.patch("/:id", c.patch);
  router.delete("/:id", c.remove);
  router.get("/:id/pdf", c.pdf);
  for (const action of [
    "submit",
    "approve",
    "reject",
    "withdraw",
    "issue",
    "buyer-response",
    "revisions",
    "void",
    "convert",
  ])
    router.post(`/:id/${action}`, c.action(action));
  return router;
}
