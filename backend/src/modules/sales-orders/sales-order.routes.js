import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import { salesOrderController } from "./sales-order.controller.js";
export function salesOrderRoutes(service) {
  const router = Router();
  const c = salesOrderController(service);
  router.use(authContext);
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.detail);
  router.patch("/:id", c.patch);
  router.delete("/:id", c.remove);
  for (const action of [
    "confirm",
    "cancel",
    "close",
    "hold",
    "resume",
    "revisions",
  ])
    router.post(`/:id/${action}`, c.action(action));
  router.get("/:id/pdf", c.pdf);
  router.get("/:id/fulfilment", c.fulfilment);
  router.get("/:id/revisions", c.revisions);
  router.get("/:id/activity", c.activity);
  return router;
}
