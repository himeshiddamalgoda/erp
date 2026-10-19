import {
  parse,
  uuid,
  listSchema,
  detailSchema,
  createSchema,
  patchSchema,
  lifecycleSchema,
} from "./customer.schemas.js";
export function customerController(s) {
  const id = (req) => parse(uuid, req.params.id, 400);
  return {
    list: async (req, res) =>
      res.json(await s.list(req.user, parse(listSchema, req.query, 400))),
    detail: async (req, res) => {
      const q = parse(detailSchema, req.query, 400);
      res.json({
        data: await s.detail(
          req.user,
          id(req),
          q.includeInactiveChildren === "true",
        ),
      });
    },
    create: async (req, res) => {
      const result = await s.create(
        req.user,
        parse(createSchema, req.body),
        req.get("Idempotency-Key"),
        req.requestId,
      );
      res.status(result.status).json(result.body);
    },
    patch: async (req, res) =>
      res.json({
        data: await s.patch(
          req.user,
          id(req),
          parse(patchSchema, req.body),
          req.requestId,
        ),
      }),
    lifecycle: (action) => async (req, res) =>
      res.json({
        data: await s.lifecycle(
          req.user,
          id(req),
          action,
          parse(lifecycleSchema, req.body),
          req.requestId,
        ),
      }),
  };
}
