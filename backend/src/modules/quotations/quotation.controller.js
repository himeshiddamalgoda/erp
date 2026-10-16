import {
  parse,
  uuid,
  createSchema,
  patchSchema,
  listSchema,
  actionSchemas,
} from "./quotation.schemas.js";
import { AppError } from "../../shared/errors.js";
import { quotationPdf } from "./quotation.pdf.js";
export function quotationController(service) {
  const id = (req) => parse(uuid, req.params.id, 400);
  return {
    list: async (req, res) =>
      res.json(await service.list(req.user, parse(listSchema, req.query, 400))),
    detail: async (req, res) =>
      res.json({ data: await service.detail(req.user, id(req)) }),
    create: async (req, res) =>
      res
        .status(201)
        .json({
          data: await service.create(
            req.user,
            parse(createSchema, req.body),
            req.requestId,
          ),
        }),
    patch: async (req, res) =>
      res.json({
        data: await service.patch(
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
          'If-Match must contain a quoted version, for example "3"',
        );
      if (req.body !== undefined && Object.keys(req.body).length)
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "DELETE does not accept a request body",
        );
      await service.remove(req.user, id(req), Number(match[1]), req.requestId);
      res.status(204).end();
    },
    pdf: async (req, res) => {
      const detail = await service.detail(req.user, id(req));
      const buffer = await quotationPdf(detail);
      const filename = `${detail.quoteNumber}-R${detail.revision}.pdf`.replace(
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
    action: (action) => async (req, res) => {
      const quoteId = id(req);
      const body = parse(actionSchemas[action], req.body);
      let result;
      if (action === "convert") {
        const key = req.get("Idempotency-Key");
        if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
          throw new AppError(
            400,
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency-Key is required (1–128 printable characters; a UUID is recommended)",
          );
        result = await service.convert(
          req.user,
          quoteId,
          body,
          req.requestId,
          key,
        );
      } else
        result = await service.action(
          req.user,
          quoteId,
          action,
          body,
          req.requestId,
        );
      res.status(result.status).json(result.body || { data: result.data });
    },
  };
}
