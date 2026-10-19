import { z } from "zod";
import { uuid, parse } from "../quotations/quotation.schemas.js";
export { uuid, parse };
export const statuses = [
  "Draft",
  "Confirmed",
  "InProgress",
  "PartiallyDelivered",
  "Delivered",
  "Closed",
  "Cancelled",
];
export const actions = [
  "create",
  "update",
  "delete",
  "confirm",
  "cancel",
  "close",
  "hold",
  "resume",
  "revision",
  "handoff_claim",
  "handoff_dispatched",
  "handoff_acknowledged",
  "handoff_failed",
  "ProductionStarted",
  "ShipmentPosted",
  "DeliveryConfirmed",
];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v + "T12:00:00Z")) &&
      new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v,
    "Use a real YYYY-MM-DD date",
  );
const text = (n) => z.string().trim().min(1).max(n);
export const version = z.number().int().min(1).max(4294967295);
export const lineSchema = z
  .object({
    styleId: uuid,
    colour: text(60),
    size: text(30),
    qty: z.number().int().min(1).max(1000000),
    unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
  })
  .strict();
export const editable = {
  customerId: uuid,
  salesTeamId: uuid,
  ownerId: uuid,
  currency: z.enum(["USD", "LKR", "GBP", "EUR"]),
  orderDate: date,
  buyerPoNumber: text(100).nullable(),
  buyerPoDate: date.nullable(),
  requestedDeliveryDate: date.nullable(),
  billingAddressId: uuid.nullable(),
  shippingAddressId: uuid.nullable(),
  paymentTerms: text(500).nullable(),
  publicNotes: z.string().max(5000).nullable(),
  internalNotes: z.string().max(5000).nullable(),
  lines: z.array(lineSchema).min(1).max(500),
};
export const createSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(editable).map(([k, v]) => [
        k,
        ["customerId", "salesTeamId", "ownerId", "currency", "lines"].includes(
          k,
        )
          ? v
          : v.optional(),
      ]),
    ),
  })
  .strict();
export const patchSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(editable).map(([k, v]) => [k, v.optional()]),
    ),
    version,
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, "Supply an editable field");
export const amendmentSchema = z
  .object({
    version,
    reason: text(1000),
    buyerReference: text(500),
    changes: z
      .object({
        requestedDeliveryDate: date.optional(),
        shippingAddressId: uuid.optional(),
        publicNotes: z.string().max(5000).nullable().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Supply an operational change"),
  })
  .strict();
export const actionSchemas = {
  confirm: z.object({ version, comment: text(1000).optional() }).strict(),
  cancel: z.object({ version, reason: text(1000) }).strict(),
  close: z.object({ version, comment: text(1000).optional() }).strict(),
  hold: z.object({ version, reason: text(1000) }).strict(),
  resume: z.object({ version, reason: text(1000) }).strict(),
  revisions: amendmentSchema,
};
export const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const listSchema = z
  .object({
    q: text(100).optional(),
    status: z.enum(statuses).optional(),
    customerId: uuid.optional(),
    salesTeamId: uuid.optional(),
    ownerId: uuid.optional(),
    source: z.enum(["direct", "quotation"]).optional(),
    onHold: z.enum(["true", "false"]).optional(),
    deliveryFrom: date.optional(),
    deliveryTo: date.optional(),
    ...pagination,
    sortBy: z
      .enum([
        "createdAt",
        "updatedAt",
        "orderDate",
        "orderNumber",
        "total",
        "requestedDeliveryDate",
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    (v) => !v.deliveryFrom || !v.deliveryTo || v.deliveryFrom <= v.deliveryTo,
    "deliveryFrom must not exceed deliveryTo",
  );
export const historySchema = z
  .object({
    ...pagination,
    revision: z.coerce.number().int().min(1).optional(),
  })
  .strict();
export const activitySchema = z
  .object({ ...pagination, action: z.enum(actions).optional() })
  .strict();
export const pdfQuerySchema = z
  .object({ revision: z.coerce.number().int().min(1).optional() })
  .strict();
export const eventSchema = z
  .object({
    orderId: uuid,
    provider: text(60),
    externalEventId: text(150),
    eventType: z.enum([
      "ProductionStarted",
      "ShipmentPosted",
      "DeliveryConfirmed",
    ]),
    externalReference: text(150).nullable().optional(),
    occurredAt: z.string().datetime({ offset: true }),
    lines: z
      .array(
        z
          .object({
            orderLineId: uuid,
            qty: z.number().int().min(1).max(1000000),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict();
