import {
  parse,
  uuid,
  createSchema,
  patchSchema,
  listSchema,
  actionSchemas,
  historySchema,
  activitySchema,
  pdfQuerySchema,
} from "./sales-order.schemas.js";
import { AppError } from "../../shared/errors.js";
import { salesOrderPdf } from "./sales-order.pdf.js";
export function salesOrderController(s) {
  const id = (req) => parse(uuid, req.params.id, 400);
  const key = (req) => req.get("Idempotency-Key");
  const send = (res, r) => res.status(r.status).json(r.body);
  return {
    list: async (req, res) =>
      res.json(await s.list(req.user, parse(listSchema, req.query, 400))),
    detail: async (req, res) =>
      res.json({ data: await s.detail(req.user, id(req)) }),
    create: async (req, res) =>
      send(
        res,
        await s.create(
          req.user,
          parse(createSchema, req.body),
          key(req),
          req.requestId,
        ),
      ),
    patch: async (req, res) =>
      res.json({
        data: await s.patch(
          req.user,
          id(req),
          parse(patchSchema, req.body),
          req.requestId,
        ),
      }),
    remove: async (req, res) => {
      const match = /^"([1-9]\d{0,9})"$/.exec(req.get("If-Match") || "");
      if (!match || Number(match[1]) > 4294967295)
        throw new AppError(
          400,
          "INVALID_IF_MATCH",
          "If-Match must contain a quoted version",
        );
      if (req.body && Object.keys(req.body).length)
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "DELETE does not accept a body",
        );
      await s.remove(req.user, id(req), Number(match[1]), req.requestId);
      res.status(204).end();
    },
    action: (action) => async (req, res) => {
      const orderId = id(req);
      const body = parse(actionSchemas[action], req.body);
      if (action === "confirm")
        send(
          res,
          await s.confirm(req.user, orderId, body, key(req), req.requestId),
        );
      else if (action === "revisions")
        send(
          res,
          await s.revise(req.user, orderId, body, key(req), req.requestId),
        );
      else
        res.json({
          data: await s.action(req.user, orderId, action, body, req.requestId),
        });
    },
    revisions: async (req, res) =>
      res.json(
        await s.revisions(
          req.user,
          id(req),
          parse(historySchema, req.query, 400),
        ),
      ),
    activity: async (req, res) =>
      res.json(
        await s.activity(
          req.user,
          id(req),
          parse(activitySchema, req.query, 400),
        ),
      ),
    fulfilment: async (req, res) =>
      res.json({ data: await s.fulfilment(req.user, id(req)) }),
    pdf: async (req, res) => {
      const q = parse(pdfQuerySchema, req.query, 400);
      const detail = await s.pdfData(req.user, id(req), q.revision);
      const buffer = await salesOrderPdf(detail);
      const filename =
        `${detail.snapshot.orderNumber}-R${detail.snapshot.documentRevision}.pdf`.replace(
          /[^a-zA-Z0-9_.-]/g,
          "_",
        );
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        })
        .send(buffer);
    },
  };
}
