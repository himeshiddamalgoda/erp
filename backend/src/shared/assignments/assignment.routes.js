import { Router } from "express";
import { authContext } from "../../middleware/auth-context.js";
import {
  parse,
  assignmentSchema,
  userListSchema,
} from "../../modules/sales-teams/sales-team.schemas.js";
export function assignmentRoutes(service) {
  const router = Router();
  router.use(authContext);
  router.post("/reassign", async (req, res) =>
    res.set("Cache-Control", "private, no-store").json({
      data: await service.reassign(
        req.user,
        parse(assignmentSchema, req.body),
        req.requestId,
      ),
    }),
  );
  return router;
}
export function directoryRoutes(service) {
  const router = Router();
  router.use(authContext);
  router.get("/", async (req, res) =>
    res
      .set("Cache-Control", "private, no-store")
      .json(
        await service.users(req.user, parse(userListSchema, req.query, 400)),
      ),
  );
  return router;
}
