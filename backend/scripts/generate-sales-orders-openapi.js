import { writeFile } from "node:fs/promises";
import YAML from "yaml";
import {
  statuses,
  actions,
} from "../src/modules/sales-orders/sales-order.schemas.js";
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (extra = {}) => ({ type: "string", ...extra });
const nullable = (s) => ({ ...s, nullable: true });
const uuid = () => str({ format: "uuid" });
const date = () => str({ format: "date" });
const time = () => str({ format: "date-time" });
const num = (extra = {}) => ({ type: "integer", minimum: 0, ...extra });
const arr = (items) => ({ type: "array", items });
const obj = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const optRef = (name) => ({ allOf: [ref(name)], nullable: true });
const schemas = {};
schemas.Money = str({
  pattern: "^\\d+\\.\\d{2}$",
  example: "5500.00",
  description: "Exact decimal amount encoded as a string.",
});
schemas.LineInput = obj({
  styleId: uuid(),
  colour: str({ minLength: 1, maxLength: 60 }),
  size: str({ minLength: 1, maxLength: 30 }),
  qty: num({ minimum: 1, maximum: 1000000 }),
  unitPrice: str({
    pattern: "^(?:0|[1-9]\\d{0,7})(?:\\.\\d{1,2})?$",
    example: "5.50",
  }),
});
schemas.Line = obj({
  id: uuid(),
  lineNo: num({ minimum: 1 }),
  variantId: uuid(),
  styleId: uuid(),
  styleCode: str(),
  styleName: str(),
  fabric: str(),
  gsm: nullable(num()),
  colour: str(),
  size: str(),
  uom: str({ enum: ["PCS"] }),
  qty: num({ minimum: 1, maximum: 1000000 }),
  unitPrice: ref("Money"),
  lineTotal: ref("Money"),
});
schemas.Contact = obj({
  id: uuid(),
  name: str(),
  email: nullable(str()),
  phone: nullable(str()),
  isPrimary: {
    oneOf: [{ type: "boolean" }, { type: "integer", enum: [0, 1] }],
  },
});
schemas.Buyer = obj({
  id: uuid(),
  code: str(),
  name: str(),
  country: str({ pattern: "^[A-Z]{2}$" }),
  currency: str({ enum: ["USD", "LKR", "GBP", "EUR"] }),
  contacts: arr(ref("Contact")),
});
schemas.Address = obj({
  id: uuid(),
  addressType: str({ enum: ["billing", "shipping"] }),
  line1: str(),
  line2: nullable(str()),
  city: str(),
  postalCode: nullable(str()),
  country: str({ pattern: "^[A-Z]{2}$" }),
});
const input = {
  customerId: uuid(),
  salesTeamId: uuid(),
  ownerId: uuid(),
  currency: str({ enum: ["USD", "LKR", "GBP", "EUR"] }),
  orderDate: date(),
  buyerPoNumber: nullable(str({ minLength: 1, maxLength: 100 })),
  buyerPoDate: nullable(date()),
  requestedDeliveryDate: nullable(date()),
  billingAddressId: nullable(uuid()),
  shippingAddressId: nullable(uuid()),
  paymentTerms: nullable(str({ minLength: 1, maxLength: 500 })),
  publicNotes: nullable(str({ maxLength: 5000 })),
  internalNotes: nullable(str({ maxLength: 5000 })),
  lines: { ...arr(ref("LineInput")), minItems: 1, maxItems: 500 },
};
schemas.DirectOrderInput = obj(input, [
  "customerId",
  "salesTeamId",
  "ownerId",
  "currency",
  "lines",
]);
schemas.DirectOrderInput.description =
  "Direct Draft only. sourceQuotationId/status/numbers/totals/actors are rejected. orderDate defaults to the company business date. No quotation conversion bypass.";
schemas.PatchOrderInput = obj(
  { version: num({ minimum: 1, maximum: 4294967295 }), ...input },
  ["version"],
);
schemas.PatchOrderInput.minProperties = 2;
schemas.PatchOrderInput.description =
  "Direct Draft: any editable input. Converted Draft: only buyerPoNumber, buyerPoDate, requestedDeliveryDate, shippingAddressId, publicNotes, internalNotes, plus version. Frozen fields rejected even if unchanged. Supplying lines replaces all Draft lines.";
const allowed = str({
  enum: [
    "downloadPdf",
    "edit",
    "delete",
    "confirm",
    "cancel",
    "close",
    "hold",
    "resume",
    "revisions",
  ],
});
const summary = {
  id: uuid(),
  orderNumber: str(),
  sourceQuotationId: nullable(uuid()),
  sourceQuoteNumber: nullable(str()),
  sourceRevisionNo: nullable(num()),
  customerId: uuid(),
  customerName: str(),
  salesTeamId: uuid(),
  ownerId: uuid(),
  status: str({ enum: statuses }),
  orderDate: date(),
  currency: str({ enum: ["USD", "LKR", "GBP", "EUR"] }),
  buyerPoNumber: nullable(str()),
  buyerPoDate: nullable(date()),
  requestedDeliveryDate: nullable(date()),
  subtotal: ref("Money"),
  total: ref("Money"),
  totalQty: num({ maximum: 500000000 }),
  documentRevision: num(),
  isOnHold: { type: "boolean" },
  version: num({ minimum: 1 }),
  createdAt: time(),
  updatedAt: time(),
  allowedActions: arr(allowed),
};
schemas.OrderSummary = obj(summary);
schemas.Handoff = obj({
  id: uuid(),
  documentRevision: num({ minimum: 1 }),
  status: str({
    enum: [
      "Queued",
      "Claimed",
      "Dispatched",
      "Acknowledged",
      "Failed",
      "Cancelled",
    ],
  }),
  externalReference: nullable(str()),
  attemptCount: num(),
  claimedAt: nullable(time()),
  dispatchedAt: nullable(time()),
  acknowledgedAt: nullable(time()),
  version: num({ minimum: 1 }),
  createdAt: time(),
  updatedAt: time(),
});
schemas.ProgressLine = obj({
  orderLineId: uuid(),
  styleCode: str(),
  colour: str(),
  size: str(),
  orderedQty: num(),
  deliveredQty: num(),
  remainingQty: num(),
});
schemas.Progress = obj({
  orderedQty: num(),
  deliveredQty: num(),
  remainingQty: num(),
  lines: arr(ref("ProgressLine")),
});
schemas.OrderDetail = obj({
  ...summary,
  source: str({ enum: ["direct", "quotation"] }),
  billingAddressId: nullable(uuid()),
  shippingAddressId: nullable(uuid()),
  paymentTerms: nullable(str()),
  publicNotes: nullable(str()),
  internalNotes: nullable(str()),
  customerSnapshot: optRef("Buyer"),
  billingAddressSnapshot: optRef("Address"),
  shippingAddressSnapshot: optRef("Address"),
  holdReason: nullable(str()),
  heldBy: nullable(uuid()),
  heldAt: nullable(time()),
  confirmedBy: nullable(uuid()),
  confirmedAt: nullable(time()),
  cancelledBy: nullable(uuid()),
  cancelledAt: nullable(time()),
  cancellationReason: nullable(str()),
  closedBy: nullable(uuid()),
  closedAt: nullable(time()),
  createdBy: uuid(),
  updatedBy: uuid(),
  deletedAt: nullable(time()),
  deletedBy: nullable(uuid()),
  lines: arr(ref("Line")),
  handoff: optRef("Handoff"),
  fulfilment: ref("Progress"),
});
schemas.DocumentSnapshot = obj({
  id: uuid(),
  orderNumber: str(),
  sourceQuotationId: nullable(uuid()),
  sourceQuoteNumber: nullable(str()),
  sourceRevisionNo: nullable(num()),
  customerId: uuid(),
  orderDate: date(),
  currency: str(),
  buyerPoNumber: nullable(str()),
  buyerPoDate: nullable(date()),
  requestedDeliveryDate: nullable(date()),
  paymentTerms: nullable(str()),
  publicNotes: nullable(str()),
  customerSnapshot: optRef("Buyer"),
  billingAddressSnapshot: optRef("Address"),
  shippingAddressSnapshot: optRef("Address"),
  subtotal: ref("Money"),
  total: ref("Money"),
  documentRevision: num(),
  totalQty: num(),
  seller: obj({ name: str() }),
  lines: arr(ref("Line")),
});
schemas.Revision = obj({
  revision: num({ minimum: 1 }),
  reason: str(),
  buyerReference: nullable(str()),
  createdBy: nullable(uuid()),
  createdAt: time(),
  snapshotSchemaVersion: num({ minimum: 1 }),
  snapshot: ref("DocumentSnapshot"),
});
schemas.AmendmentInput = obj({
  version: num({ minimum: 1 }),
  reason: str({ minLength: 1, maxLength: 1000 }),
  buyerReference: str({ minLength: 1, maxLength: 500 }),
  changes: {
    ...obj(
      {
        requestedDeliveryDate: date(),
        shippingAddressId: uuid(),
        publicNotes: nullable(str({ maxLength: 5000 })),
      },
      [],
    ),
    minProperties: 1,
  },
});
schemas.AmendmentResult = obj({
  order: ref("OrderDetail"),
  revision: ref("Revision"),
});
schemas.Event = obj({
  id: uuid(),
  provider: str(),
  externalEventId: str(),
  eventType: str({
    enum: ["ProductionStarted", "ShipmentPosted", "DeliveryConfirmed"],
  }),
  externalReference: nullable(str()),
  occurredAt: time(),
  receivedAt: time(),
  source: str({ enum: ["demo", "integration"] }),
});
schemas.Fulfilment = obj({
  orderId: uuid(),
  status: str({ enum: statuses }),
  source: str({ enum: ["demo", "integration"] }),
  ...schemas.Progress.properties,
  handoff: optRef("Handoff"),
  latestEvents: { ...arr(ref("Event")), maxItems: 20 },
});
schemas.Activity = obj({
  id: uuid(),
  action: str({ enum: actions }),
  actor: { ...obj({ id: uuid(), displayName: str() }), nullable: true },
  occurredAt: time(),
  fromStatus: nullable(str()),
  toStatus: nullable(str()),
  reason: nullable(str()),
  metadata: {
    ...obj(
      {
        sourceQuotationId: uuid(),
        source: str(),
        fields: arr(str()),
        shippingChange: obj({ from: nullable(uuid()), to: nullable(uuid()) }),
        documentRevision: num(),
        buyerReference: str(),
        changedFields: arr(str()),
        handoffId: uuid(),
        eventId: uuid(),
        provider: str(),
        externalEventId: str(),
      },
      [],
    ),
    nullable: true,
  },
});
schemas.Meta = obj({
  page: num({ minimum: 1 }),
  pageSize: num({ minimum: 1, maximum: 100 }),
  total: num(),
});
schemas.Error = obj({
  error: obj(
    {
      code: str({
        enum: [
          "INVALID_REQUEST",
          "MALFORMED_JSON",
          "INVALID_IF_MATCH",
          "INVALID_IDEMPOTENCY_KEY",
          "UNAUTHENTICATED",
          "INVALID_PRINCIPAL",
          "FORBIDDEN",
          "NOT_FOUND",
          "VALIDATION_ERROR",
          "STALE_VERSION",
          "INVALID_TRANSITION",
          "DUPLICATE_BUYER_PO",
          "FROZEN_QUOTATION_FIELDS",
          "CANCELLATION_BLOCKED",
          "HOLD_BLOCKED",
          "AMENDMENT_BLOCKED",
          "IDEMPOTENCY_KEY_REUSED",
          "DELIVERY_INCOMPLETE",
          "CONSTRAINT_CONFLICT",
          "REFERENCED_RECORD_CONFLICT",
          "INTERNAL_ERROR",
        ],
      }),
      message: str(),
      fields: { type: "object", additionalProperties: { type: "string" } },
      requestId: str(),
    },
    ["code", "message", "requestId"],
  ),
});
const response = (name, list = false) => ({
  description: "Successful operation",
  content: {
    "application/json": {
      schema: list
        ? obj({ data: arr(ref(name)), meta: ref("Meta") })
        : obj({ data: ref(name) }),
    },
  },
});
const errors = Object.fromEntries(
  [
    [400, "Malformed query, JSON or required header"],
    [401, "Missing, malformed or inactive trusted principal"],
    [403, "Role cannot perform this action"],
    [404, "Missing or out-of-scope order/document revision"],
    [
      409,
      "Concurrency, lifecycle, normalized PO, frozen source or idempotency conflict",
    ],
    [422, "Invalid editable fields or missing confirmation requirements"],
    [500, "Sanitized unexpected error"],
  ].map(([status, description]) => [
    status,
    { description, content: { "application/json": { schema: ref("Error") } } },
  ]),
);
const param = (name, schema, extra = {}) => ({
  name,
  in: "query",
  schema,
  ...extra,
});
const pages = [
  param("page", num({ minimum: 1, default: 1 })),
  param("pageSize", num({ minimum: 1, maximum: 100, default: 20 })),
];
const pathId = { name: "id", in: "path", required: true, schema: uuid() };
const keyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: str({ minLength: 1, maxLength: 128, pattern: "^[!-~]+$" }),
  description:
    "Persist and reuse the exact key, original body and path for a retry. Changed request returns 409 IDEMPOTENCY_KEY_REUSED. Replays still authorize current actor scope.",
};
const paths = {};
function op(
  path,
  method,
  summaryText,
  {
    schema,
    result = "OrderDetail",
    status = 200,
    list = false,
    parameters = [],
    description = "",
  } = {},
) {
  paths[path] ??= {};
  paths[path][method] = {
    tags: ["Sales Orders"],
    summary: summaryText,
    description,
    operationId: summaryText.replace(/[^A-Za-z0-9]+/g, ""),
    parameters: [...(path.includes("{id}") ? [pathId] : []), ...parameters],
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: typeof schema === "string" ? ref(schema) : schema,
              },
            },
          },
        }
      : {}),
    responses: { [status]: response(result, list), ...errors },
  };
}
op("/sales-orders", "get", "List sales orders", {
  result: "OrderSummary",
  list: true,
  parameters: [
    param("q", str({ maxLength: 100 })),
    param("status", str({ enum: statuses })),
    ...["customerId", "salesTeamId", "ownerId"].map((k) => param(k, uuid())),
    param("source", str({ enum: ["direct", "quotation"] })),
    param("onHold", str({ enum: ["true", "false"] })),
    param("deliveryFrom", date()),
    param("deliveryTo", date()),
    ...pages,
    param(
      "sortBy",
      str({
        enum: [
          "createdAt",
          "updatedAt",
          "orderDate",
          "orderNumber",
          "total",
          "requestedDeliveryDate",
        ],
        default: "createdAt",
      }),
    ),
    param("sortOrder", str({ enum: ["asc", "desc"], default: "desc" })),
  ],
  description:
    "Search order number, buyer snapshot name and buyer PO. Excludes soft-deleted orders. Admin global; other actors limited to assigned teams. Stable ID tie-breaker.",
});
op("/sales-orders", "post", "Create direct Draft", {
  schema: "DirectOrderInput",
  status: 201,
  parameters: [keyHeader],
  description:
    "Idempotent direct Draft creation. Quotation conversion stays under the quotation resource and is not an additional Sales Orders operation.",
});
op("/sales-orders/{id}", "get", "Get sales order");
op("/sales-orders/{id}", "patch", "Edit Draft order", {
  schema: "PatchOrderInput",
});
op("/sales-orders/{id}", "delete", "Delete Draft order", {
  parameters: [
    {
      name: "If-Match",
      in: "header",
      required: true,
      schema: str({ pattern: '^"[1-9][0-9]{0,9}"$', example: '"3"' }),
    },
  ],
  description:
    "Soft-delete only. No request body. Preserves lines and source quotation uniqueness.",
});
paths["/sales-orders/{id}"].delete.responses[204] = {
  description: "Draft soft-deleted; empty response",
};
delete paths["/sales-orders/{id}"].delete.responses[200];
for (const a of ["confirm", "cancel", "close", "hold", "resume"]) {
  const extra = ["cancel", "hold", "resume"].includes(a)
    ? { reason: str({ minLength: 1, maxLength: 1000 }) }
    : { comment: str({ minLength: 1, maxLength: 1000 }) };
  const body = obj(
    { version: num({ minimum: 1, maximum: 4294967295 }), ...extra },
    [
      "version",
      ...(["cancel", "hold", "resume"].includes(a) ? ["reason"] : []),
    ],
  );
  op(
    `/sales-orders/{id}/${a}`,
    "post",
    `${a[0].toUpperCase() + a.slice(1)} order`,
    {
      schema: body,
      parameters: a === "confirm" ? [keyHeader] : [],
      description:
        a === "confirm"
          ? "Manager/Admin: validates complete active master data, PO, positive prices and delivery date; writes revision 1, queued handoff and audit atomically. No external network call."
          : a === "close"
            ? "Manager/Admin: Delivered only, every line complete, no ambiguous/failed handoff. No payment assertion."
            : a === "cancel"
              ? "Manager/Admin: Draft or Confirmed with queued/unclaimed handoff and no activity. Retains source quotation conversion and history."
              : "Manager/Admin: Confirmed and queued/unclaimed only. Hold is orthogonal; resume releases local dispatch eligibility without claiming production started.",
    },
  );
}
op("/sales-orders/{id}/revisions", "post", "Create operational amendment", {
  schema: "AmendmentInput",
  result: "AmendmentResult",
  status: 201,
  parameters: [keyHeader],
  description:
    "Manager/Admin: queued Confirmed order only, with no activity. Changes delivery, shipping and public notes only. Same ID/number/status; increments documentRevision and version; appends immutable snapshot and updates outbox payload atomically. Hold flag preserved.",
});
op("/sales-orders/{id}/revisions", "get", "List document revisions", {
  result: "Revision",
  list: true,
  parameters: [...pages, param("revision", num({ minimum: 1 }))],
  description:
    "Newest first. Draft has empty history. Snapshots exclude internal notes.",
});
op("/sales-orders/{id}/activity", "get", "List order activity", {
  result: "Activity",
  list: true,
  parameters: [...pages, param("action", str({ enum: actions }))],
  description:
    "Paginated shared audit timeline, including private integration events exactly once. No secrets or integration credentials returned.",
});
op("/sales-orders/{id}/fulfilment", "get", "Get per line fulfilment", {
  result: "Fulfilment",
  description:
    "Only DeliveryConfirmed quantities contribute to delivery. No events means zero delivered. Demo label without a real integration. latestEvents capped at 20; use activity pagination for older timeline entries.",
});
op("/sales-orders/{id}/pdf", "get", "Download order confirmation PDF", {
  parameters: [param("revision", num({ minimum: 1 }))],
  description:
    "Latest immutable document by default; explicit missing revision is 404. Draft without revisions renders current Draft with watermark. Historical supersession and current hold/cancellation displayed separately. No internal notes, cost or margin.",
});
paths["/sales-orders/{id}/pdf"].get.responses[200] = {
  description: "Buyer-visible PDF",
  headers: {
    "Content-Disposition": {
      schema: str(),
      description: "Safe attachment filename",
    },
    "Cache-Control": { schema: str({ example: "private, no-store" }) },
  },
  content: { "application/pdf": { schema: str({ format: "binary" }) } },
};
const doc = {
  openapi: "3.0.3",
  info: {
    title: "Garment ERP Sales Orders",
    version: "1.0.0",
    description:
      "Exactly 15 HTTP operations. Trusted middleware supplies req.user; no actor headers or login endpoints. Admin has global scope, others are team scoped. Bearer/cookie authentication belongs to the host application. Dev fixed actor is configured only on each backend. No public fulfilment-ingestion endpoint. Outbox dispatch disabled until an authenticated integration is wired.",
  },
  servers: [
    {
      url: "http://localhost:4000/api/v1",
      description: "Sales development backend",
    },
    {
      url: "http://localhost:4101/api/v1",
      description: "Manager development backend",
    },
  ],
  tags: [{ name: "Sales Orders" }],
  paths,
  components: { schemas },
};
await writeFile(
  new URL("../docs/sales-orders.openapi.yaml", import.meta.url),
  YAML.stringify(doc),
);
console.log("Sales Orders OpenAPI generated: 15 operations");
