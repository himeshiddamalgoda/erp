import { z } from "zod";
import { AppError } from "../../shared/errors.js";
export const statuses = [
  "Draft",
  "PendingApproval",
  "Approved",
  "Issued",
  "Accepted",
  "Declined",
  "Expired",
  "Superseded",
  "Cancelled",
  "Converted",
];
export const uuid = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    "Must be a real YYYY-MM-DD business date",
  );
const text = (max) => z.string().trim().min(1).max(max);
const line = z
  .object({
    styleId: uuid,
    colour: text(60),
    size: text(30),
    qty: z.number().int().min(1).max(1000000),
    unitPrice: z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
        "Must be a decimal string from 0 to 99999999.99 with at most two decimal places",
      ),
  })
  .strict();
const editable = {
  customerId: uuid,
  salesTeamId: uuid,
  ownerId: uuid,
  currency: z.enum(["USD", "LKR", "GBP", "EUR"]),
  quotationDate: date,
  validUntil: date.nullable().optional(),
  requestedDeliveryDate: date.nullable().optional(),
  billingAddressId: uuid.nullable().optional(),
  shippingAddressId: uuid.nullable().optional(),
  paymentTerms: text(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  lines: z.array(line).min(1).max(500),
};
const version = z.number().int().min(1).max(4294967295);
export const createSchema = z.object(editable).strict();
export const patchSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(editable).map(([k, v]) => [k, v.optional()]),
    ),
    version,
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 1,
    "Supply at least one editable field",
  );
export const actionSchemas = {
  submit: z.object({ version }).strict(),
  approve: z.object({ version, comment: text(1000).optional() }).strict(),
  reject: z.object({ version, reason: text(1000) }).strict(),
  withdraw: z.object({ version, reason: text(1000) }).strict(),
  issue: z.object({ version, channel: z.literal("manual") }).strict(),
  "buyer-response": z.discriminatedUnion("decision", [
    z
      .object({
        version,
        decision: z.literal("Accepted"),
        reference: text(500),
      })
      .strict(),
    z
      .object({
        version,
        decision: z.literal("Declined"),
        reference: text(500),
        reason: text(1000),
      })
      .strict(),
  ]),
  revisions: z.object({ version, reason: text(1000) }).strict(),
  void: z.object({ version, reason: text(1000) }).strict(),
  convert: z.object({ version }).strict(),
};
export const listSchema = z
  .object({
    q: text(200).optional(),
    status: z.enum(statuses).optional(),
    customerId: uuid.optional(),
    salesTeamId: uuid.optional(),
    ownerId: uuid.optional(),
    fromDate: date.optional(),
    toDate: date.optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z
      .enum(["createdAt", "quotationDate", "quoteNumber", "total", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    includeRevisions: z.enum(["true", "false"]).default("false"),
  })
  .strict()
  .refine(
    (v) => !v.fromDate || !v.toDate || v.fromDate <= v.toDate,
    "fromDate must not exceed toDate",
  );
export function parse(schema, value, status = 422) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const path = issue.path.reduce(
      (s, p) => (typeof p === "number" ? `${s}[${p}]` : s ? `${s}.${p}` : p),
      "",
    );
    fields[path || "body"] = issue.message;
  }
  throw new AppError(
    status,
    status === 400 ? "INVALID_REQUEST" : "VALIDATION_ERROR",
    "Check highlighted fields",
    fields,
  );
}
