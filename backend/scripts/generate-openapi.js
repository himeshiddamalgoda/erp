import fs from "node:fs/promises";
import YAML from "yaml";
import { demoIds as ids } from "../src/middleware/auth-context.js";
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = (maxLength, extra = {}) => ({
  type: "string",
  ...(maxLength ? { maxLength } : {}),
  ...extra,
});
const nullable = (schema) =>
  schema.$ref
    ? { type: "object", allOf: [schema], nullable: true }
    : { ...schema, nullable: true };
const id = string(null, { format: "uuid" });
const date = string(null, { format: "date" });
const time = string(null, { format: "date-time" });
const integer = { type: "integer", minimum: 1 };
const money = string(null, { pattern: "^\\d+\\.\\d{2}$", example: "5500.00" });
const object = (
  properties,
  required = Object.keys(properties),
  extra = {},
) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
  ...extra,
});
const array = (items) => ({ type: "array", items });
const status = string(null, {
  enum: [
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
  ],
});
const exampleInput = {
  customerId: ids.customer,
  salesTeamId: ids.team,
  ownerId: ids.sales,
  currency: "USD",
  quotationDate: "2026-10-16",
  validUntil: "2026-10-31",
  requestedDeliveryDate: "2026-11-30",
  billingAddressId: ids.billing,
  shippingAddressId: ids.shipping,
  paymentTerms: "30% advance; 70% before shipment",
  notes: "Staff-only: Pack by colour and size",
  lines: ["Navy", "White"].flatMap((colour) =>
    ["S", "M", "L"].map((size) => ({
      styleId: ids.style,
      colour,
      size,
      qty: size === "L" ? 100 : 200,
      unitPrice: "5.50",
    })),
  ),
};
const quoteId = "80000000-0000-4000-8000-000000000001";
const familyId = "90000000-0000-4000-8000-000000000001";
const orderId = "a0000000-0000-4000-8000-000000000001";
const summary = {
  id: quoteId,
  familyId,
  quoteNumber: "QT-2026-0001",
  revision: 1,
  status: "Draft",
  customerId: ids.customer,
  customerName: "Ocean Apparel",
  salesTeamId: ids.team,
  ownerId: ids.sales,
  currency: "USD",
  totalQty: 1000,
  subtotal: "5500.00",
  total: "5500.00",
  validUntil: "2026-10-31",
  requestedDeliveryDate: "2026-11-30",
  version: 1,
  createdAt: "2026-10-16T04:00:00.000Z",
  updatedAt: "2026-10-16T04:00:00.000Z",
};
const addressExample = {
  id: ids.billing,
  addressType: "billing",
  line1: "100 Ocean Avenue",
  line2: null,
  city: "New York",
  postalCode: "10001",
  country: "US",
};
const buyerExample = {
  id: ids.customer,
  code: "OCEAN",
  name: "Ocean Apparel",
  country: "US",
  currency: "USD",
  contacts: [
    {
      id: ids.contact,
      name: "Ocean Purchasing",
      email: "purchasing@example.com",
      phone: null,
      isPrimary: true,
    },
  ],
};
const detail = {
  ...summary,
  quotationDate: "2026-10-16",
  billingAddressId: ids.billing,
  shippingAddressId: ids.shipping,
  paymentTerms: exampleInput.paymentTerms,
  notes: exampleInput.notes,
  priorRevisionId: null,
  customerSnapshot: null,
  billingAddressSnapshot: null,
  shippingAddressSnapshot: null,
  draftBuyer: {
    customer: buyerExample,
    billingAddress: addressExample,
    shippingAddress: {
      ...addressExample,
      id: ids.shipping,
      addressType: "shipping",
    },
  },
  lines: exampleInput.lines.map((l, i) => ({
    id: `b0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    lineNo: i + 1,
    variantId: `70000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    styleId: l.styleId,
    styleCode: "TS-100",
    styleName: "Cotton T-shirt",
    fabric: "100% cotton",
    gsm: 180,
    colour: l.colour,
    size: l.size,
    uom: "PCS",
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: (l.qty * 5.5).toFixed(2),
  })),
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  issuedAt: null,
  buyerDecision: null,
  buyerResponseReference: null,
  buyerResponseReason: null,
  buyerResponseAt: null,
  salesOrderId: null,
  linkedOrder: null,
  familyLocked: false,
  revisions: [
    {
      id: quoteId,
      revision: 1,
      status: "Draft",
      version: 1,
      priorRevisionId: null,
    },
  ],
  audit: [
    {
      id: "c0000000-0000-4000-8000-000000000001",
      actorId: ids.sales,
      action: "create",
      fromStatus: null,
      toStatus: "Draft",
      reason: null,
      metadata: null,
      requestId: "req-example",
      createdAt: summary.createdAt,
    },
  ],
  allowedActions: ["pdf", "edit", "delete", "submit"],
};
const schemas = {
  LineInput: object({
    styleId: id,
    colour: string(60, { minLength: 1 }),
    size: string(30, { minLength: 1 }),
    qty: { type: "integer", minimum: 1, maximum: 1000000 },
    unitPrice: string(null, {
      pattern: "^(?:0|[1-9]\\d{0,7})(?:\\.\\d{1,2})?$",
      example: "5.50",
    }),
  }),
  CreateQuotation: object(
    {
      customerId: id,
      salesTeamId: id,
      ownerId: id,
      currency: string(3, { enum: ["USD", "LKR", "GBP", "EUR"] }),
      quotationDate: date,
      validUntil: nullable(date),
      requestedDeliveryDate: nullable(date),
      billingAddressId: nullable(id),
      shippingAddressId: nullable(id),
      paymentTerms: nullable(string(500, { minLength: 1 })),
      notes: nullable(string(10000)),
      lines: { ...array(ref("LineInput")), minItems: 1, maxItems: 500 },
    },
    [
      "customerId",
      "salesTeamId",
      "ownerId",
      "currency",
      "quotationDate",
      "lines",
    ],
  ),
  VersionAction: object({ version: { ...integer, maximum: 4294967295 } }),
  ReasonAction: object({
    version: integer,
    reason: string(1000, { minLength: 1 }),
  }),
  ApproveAction: object(
    { version: integer, comment: string(1000, { minLength: 1 }) },
    ["version"],
  ),
  IssueAction: object({
    version: integer,
    channel: string(null, { enum: ["manual"] }),
  }),
  BuyerResponse: {
    oneOf: [
      object({
        version: integer,
        decision: { type: "string", enum: ["Accepted"] },
        reference: string(500, { minLength: 1 }),
      }),
      object({
        version: integer,
        decision: { type: "string", enum: ["Declined"] },
        reference: string(500, { minLength: 1 }),
        reason: string(1000, { minLength: 1 }),
      }),
    ],
    discriminator: { propertyName: "decision" },
  },
  Contact: object({
    id,
    name: string(150),
    email: nullable(string(254)),
    phone: nullable(string(40)),
    isPrimary: { type: "boolean" },
  }),
  Buyer: object({
    id,
    code: string(30),
    name: string(200),
    country: string(2),
    currency: string(3),
    contacts: array(ref("Contact")),
  }),
  Address: object({
    id,
    addressType: string(20, { enum: ["billing", "shipping"] }),
    line1: string(200),
    line2: nullable(string(200)),
    city: string(100),
    postalCode: nullable(string(30)),
    country: string(2),
  }),
  QuotationSummary: object({
    id,
    familyId: id,
    quoteNumber: string(40),
    revision: integer,
    status,
    customerId: id,
    customerName: string(200),
    salesTeamId: id,
    ownerId: id,
    currency: string(3),
    totalQty: { type: "integer", minimum: 0, maximum: 500000000 },
    subtotal: money,
    total: money,
    validUntil: nullable(date),
    requestedDeliveryDate: nullable(date),
    version: integer,
    createdAt: time,
    updatedAt: time,
  }),
  QuotationLine: object({
    id,
    lineNo: integer,
    variantId: id,
    styleId: id,
    styleCode: string(40),
    styleName: string(150),
    fabric: string(250),
    gsm: { type: "integer", minimum: 0, nullable: true },
    colour: string(60),
    size: string(30),
    uom: { type: "string", enum: ["PCS"] },
    qty: { type: "integer", minimum: 1, maximum: 1000000 },
    unitPrice: money,
    lineTotal: money,
  }),
  Revision: object({
    id,
    revision: integer,
    status,
    version: integer,
    priorRevisionId: nullable(id),
  }),
  Audit: object({
    id,
    actorId: nullable(id),
    action: string(50),
    fromStatus: nullable(status),
    toStatus: nullable(status),
    reason: nullable(string()),
    metadata: { type: "object", nullable: true, additionalProperties: true },
    requestId: nullable(string(100)),
    createdAt: time,
  }),
  SalesOrderSummary: object({
    id,
    salesOrderId: id,
    orderNumber: string(40),
    status: { type: "string", enum: ["Draft"] },
    sourceQuotationId: id,
    sourceQuoteNumber: string(40),
    sourceRevision: integer,
    currency: string(3),
    totalQty: { type: "integer" },
    subtotal: money,
    total: money,
    version: integer,
    deletedAt: nullable(time),
    archived: { type: "boolean" },
  }),
  Error: object({
    error: object(
      {
        code: string(),
        message: string(),
        fields: { type: "object", additionalProperties: { type: "string" } },
        requestId: string(100),
      },
      ["code", "message", "requestId"],
    ),
  }),
};
schemas.PatchQuotation = object(
  {
    ...schemas.CreateQuotation.properties,
    version: { ...integer, maximum: 4294967295 },
  },
  ["version"],
  {
    minProperties: 2,
    description:
      "Only supplied fields change. lines atomically replaces the whole nonempty collection; line IDs may change. Protected/unknown fields are rejected.",
  },
);
schemas.QuotationDetail = object({
  ...schemas.QuotationSummary.properties,
  quotationDate: date,
  billingAddressId: nullable(id),
  shippingAddressId: nullable(id),
  paymentTerms: nullable(string(500)),
  notes: nullable(
    string(10000, { description: "Staff-only notes; excluded from PDF." }),
  ),
  priorRevisionId: nullable(id),
  customerSnapshot: nullable(ref("Buyer")),
  billingAddressSnapshot: nullable(ref("Address")),
  shippingAddressSnapshot: nullable(ref("Address")),
  draftBuyer: nullable(
    object({
      customer: ref("Buyer"),
      billingAddress: nullable(ref("Address")),
      shippingAddress: nullable(ref("Address")),
    }),
  ),
  lines: array(ref("QuotationLine")),
  submittedBy: nullable(id),
  submittedAt: nullable(time),
  approvedBy: nullable(id),
  approvedAt: nullable(time),
  issuedAt: nullable(time),
  buyerDecision: nullable(string(null, { enum: ["Accepted", "Declined"] })),
  buyerResponseReference: nullable(string(500)),
  buyerResponseReason: nullable(string(1000)),
  buyerResponseAt: nullable(time),
  salesOrderId: nullable(id),
  linkedOrder: nullable(ref("SalesOrderSummary")),
  familyLocked: { type: "boolean" },
  revisions: array(ref("Revision")),
  audit: array(ref("Audit")),
  allowedActions: array(
    string(null, {
      enum: [
        "pdf",
        "edit",
        "delete",
        "submit",
        "approve",
        "reject",
        "withdraw",
        "issue",
        "buyer-response",
        "revisions",
        "void",
        "convert",
      ],
    }),
  ),
});
const json = (schema, example) => ({
  "application/json": { schema, ...(example ? { example } : {}) },
});
const envelope = (schema) => object({ data: schema });
const errorResponse = (description, code) => ({
  description,
  content: json(ref("Error"), {
    error: { code, message: description, requestId: "req-example" },
  }),
});
const errors = {
  400: errorResponse(
    "Malformed JSON, query or required header",
    "INVALID_REQUEST",
  ),
  401: errorResponse(
    "A valid trusted principal is required",
    "UNAUTHENTICATED",
  ),
  403: errorResponse("Action is not permitted for this role", "FORBIDDEN"),
  404: errorResponse(
    "Quotation not found or outside visible scope",
    "NOT_FOUND",
  ),
  409: {
    description: "Lifecycle, version, expiry or idempotency conflict",
    content: {
      "application/json": {
        schema: ref("Error"),
        examples: Object.fromEntries(
          [
            "STALE_VERSION",
            "INVALID_TRANSITION",
            "QUOTATION_EXPIRED",
            "FAMILY_ALREADY_ACCEPTED",
            "IDEMPOTENCY_KEY_REUSED",
            "WORKING_REVISION_EXISTS",
          ].map((code) => [
            code,
            {
              value: {
                error: {
                  code,
                  message:
                    code === "STALE_VERSION"
                      ? "Quotation changed; reload before retrying"
                      : code,
                  requestId: "req-example",
                },
              },
            },
          ]),
        ),
      },
    },
  },
  422: {
    description: "Field validation failure",
    content: json(ref("Error"), {
      error: {
        code: "VALIDATION_ERROR",
        message: "Check highlighted fields",
        fields: { "lines[0].qty": "Must be a positive integer" },
        requestId: "req-example",
      },
    }),
  },
  500: errorResponse("Internal server error", "INTERNAL_ERROR"),
};
const idParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: id,
  description: "Quotation revision ID, not family ID.",
};
const requestBody = (schema, example) => ({
  required: true,
  content: json(ref(schema), example),
});
const response = (
  code,
  description,
  example = detail,
  schema = "QuotationDetail",
) => ({
  [code]: {
    description,
    content: json(envelope(ref(schema)), { data: example }),
  },
  ...errors,
});
const op = (operationId, summary, description, extra = {}) => ({
  operationId,
  summary,
  description,
  tags: ["Quotations"],
  ...extra,
});
const paths = {
  "/quotations": {
    get: op(
      "listQuotations",
      "List quotations",
      "Defaults to latest nondeleted revision per family. Status and other filters apply after latest selection. includeRevisions=true includes history. Scope uses authorized teams. Commercial dates are inclusive; ordering always includes ID.",
      {
        parameters: Object.entries({
          q: string(200),
          status,
          customerId: id,
          salesTeamId: id,
          ownerId: id,
          fromDate: date,
          toDate: date,
          page: { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          sortBy: {
            type: "string",
            enum: [
              "createdAt",
              "quotationDate",
              "quoteNumber",
              "total",
              "updatedAt",
            ],
            default: "createdAt",
          },
          sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc" },
          includeRevisions: { type: "boolean", default: false },
        }).map(([name, schema]) => ({ name, in: "query", schema })),
        responses: {
          200: {
            description: "Paged quotation summaries",
            content: json(
              object({
                data: array(ref("QuotationSummary")),
                meta: object({
                  page: integer,
                  pageSize: integer,
                  total: { type: "integer", minimum: 0 },
                }),
              }),
              { data: [summary], meta: { page: 1, pageSize: 20, total: 1 } },
            ),
          },
          ...errors,
        },
      },
    ),
    post: op(
      "createQuotation",
      "Create Draft family and revision 1",
      "Generates quote number and exact totals server-side. Missing final terms, validity and addresses are allowed for Draft. Buyer/team/owner and variants must be active.",
      {
        requestBody: requestBody("CreateQuotation", exampleInput),
        responses: response("201", "Created Draft revision"),
      },
    ),
  },
  "/quotations/{id}": {
    parameters: [idParameter],
    get: op(
      "getQuotation",
      "Read revision detail",
      "Includes scoped revision summaries, audit, stored commercial snapshots, linked order (including archived state), and allowedActions. Draft garments and draftBuyer reflect current masters; frozen statuses use stored snapshots. allowedActions does not replace server validation.",
      { responses: response("200", "Quotation detail") },
    ),
    patch: op(
      "patchQuotation",
      "Edit Draft",
      "Requires current version and an unlocked family. Omitted fields stay unchanged. Supplied lines replace the entire collection and IDs may change. No generic status/number/total/actor patch is allowed.",
      {
        requestBody: requestBody("PatchQuotation", {
          version: 1,
          lines: [{ ...exampleInput.lines[0], qty: 1000 }],
        }),
        responses: response("200", "Updated Draft", {
          ...detail,
          version: 2,
          lines: [
            {
              ...detail.lines[0],
              id: "b0000000-0000-4000-8000-000000000010",
              qty: 1000,
              lineTotal: "5500.00",
            },
          ],
          revisions: [{ ...detail.revisions[0], version: 2 }],
        }),
      },
    ),
    delete: op(
      "deleteQuotation",
      "Soft-delete Draft",
      "Only Draft in an unlocked family. Retains lines, audit and used revision number.",
      {
        parameters: [
          {
            name: "If-Match",
            in: "header",
            required: true,
            schema: {
              type: "string",
              pattern: '^"[1-9][0-9]*"$',
              example: '"3"',
            },
          },
        ],
        responses: { 204: { description: "Soft-deleted; no body" }, ...errors },
      },
    ),
  },
};
const actions = {
  submit: [
    "VersionAction",
    "Draft to PendingApproval",
    "Requires active buyer with contact (email/phone), billing/shipping addresses, validUntil, requestedDeliveryDate, paymentTerms and positive prices. Captures customer/address/garment snapshots. Commercial fields then freeze.",
    { version: 1 },
    "PendingApproval",
    200,
  ],
  approve: [
    "ApproveAction",
    "PendingApproval to Approved",
    "SalesManager/Admin within scope; approver must differ from submittedBy, including Admin. Rechecks active masters and inclusive local validity.",
    { version: 2, comment: "Pricing reviewed" },
    "Approved",
    200,
  ],
  reject: [
    "ReasonAction",
    "PendingApproval to Draft",
    "Manager/Admin only. Requires trimmed reason; clears current submission/approval metadata. Audit remains.",
    { version: 2, reason: "Please review unit prices" },
    "Draft",
    200,
  ],
  withdraw: [
    "ReasonAction",
    "Withdraw submission to Draft",
    "Authorized Sales/team member or manager/admin. Clears submission/approval metadata; resubmission recaptures snapshots.",
    { version: 2, reason: "Buyer changed quantities" },
    "Draft",
    200,
  ],
  issue: [
    "IssueAction",
    "Approved to Issued",
    "Rechecks active masters and validity. Atomically supersedes previous active Issued revision and increments its version. Sets active family offer. Records manual channel without sending email.",
    { version: 3, channel: "manual" },
    "Issued",
    200,
  ],
  "buyer-response": [
    "BuyerResponse",
    "Record buyer acceptance or decline",
    "Staff-reported response, not a portal or signature. Only active unexpired Issued offer. Reference required; decline additionally requires reason. Acceptance locks every competing revision; decline clears active offer. Delayed expiry persists independently of a conflict response.",
    {
      version: 4,
      decision: "Accepted",
      reference: "Buyer email dated 2026-10-16",
    },
    "Accepted",
    200,
  ],
  revisions: [
    "ReasonAction",
    "Create a separate replacement Draft",
    "Source must be latest nondeleted Approved/Issued/Declined/Expired revision. Family must be unlocked and have no working successor. Same quote number, new ID and higher revision; old offer remains valid until replacement issue. Validity is copied without extension.",
    { version: 4, reason: "Buyer requested updated quantity" },
    "Draft",
    201,
  ],
  void: [
    "ReasonAction",
    "Approved or Issued to Cancelled",
    "Manager/Admin only, unlocked family. Clears active offer when appropriate. Does not affect any sales order.",
    { version: 4, reason: "Offer withdrawn" },
    "Cancelled",
    200,
  ],
};
for (const [
  name,
  [schema, title, description, example, newStatus, code],
] of Object.entries(actions)) {
  const exampleDetail = {
    ...detail,
    status: newStatus,
    version: name === "revisions" ? 1 : example.version + 1,
    customerSnapshot: newStatus === "Draft" ? null : buyerExample,
    billingAddressSnapshot: newStatus === "Draft" ? null : addressExample,
    shippingAddressSnapshot:
      newStatus === "Draft"
        ? null
        : { ...addressExample, id: ids.shipping, addressType: "shipping" },
    draftBuyer: newStatus === "Draft" ? detail.draftBuyer : null,
    submittedBy: newStatus === "Draft" ? null : ids.sales,
    submittedAt: newStatus === "Draft" ? null : summary.createdAt,
    approvedBy: ["Approved", "Issued", "Accepted", "Cancelled"].includes(
      newStatus,
    )
      ? ids.manager
      : null,
    approvedAt: ["Approved", "Issued", "Accepted", "Cancelled"].includes(
      newStatus,
    )
      ? summary.createdAt
      : null,
    issuedAt: ["Issued", "Accepted"].includes(newStatus)
      ? summary.createdAt
      : null,
    buyerDecision: newStatus === "Accepted" ? "Accepted" : null,
    buyerResponseReference: newStatus === "Accepted" ? example.reference : null,
    buyerResponseAt: newStatus === "Accepted" ? summary.createdAt : null,
    familyLocked: newStatus === "Accepted",
    allowedActions: {
      PendingApproval: ["pdf", "reject", "withdraw", "approve"],
      Approved: ["pdf", "issue", "void", "revisions"],
      Issued: ["pdf", "buyer-response", "void", "revisions"],
      Accepted: ["pdf", "convert"],
      Cancelled: ["pdf"],
      Draft: ["pdf", "edit", "delete", "submit"],
    }[newStatus],
  };
  if (name === "revisions")
    Object.assign(exampleDetail, {
      id: "80000000-0000-4000-8000-000000000002",
      revision: 2,
      priorRevisionId: quoteId,
    });
  exampleDetail.revisions = [
    {
      id: exampleDetail.id,
      revision: exampleDetail.revision,
      status: newStatus,
      version: exampleDetail.version,
      priorRevisionId: exampleDetail.priorRevisionId,
    },
  ];
  exampleDetail.audit = [
    {
      ...detail.audit[0],
      actorId: ["approve", "reject", "void"].includes(name)
        ? ids.manager
        : ids.sales,
      action: name === "revisions" ? "create_revision" : name,
      fromStatus: {
        submit: "Draft",
        approve: "PendingApproval",
        reject: "PendingApproval",
        withdraw: "PendingApproval",
        issue: "Approved",
        "buyer-response": "Issued",
        revisions: null,
        void: "Approved",
      }[name],
      toStatus: newStatus,
      reason: example.reason || example.comment || null,
    },
  ];
  if (name === "revisions")
    exampleDetail.revisions.push({
      ...detail.revisions[0],
      status: "Issued",
      version: example.version,
    });
  paths[`/quotations/{id}/${name}`] = {
    parameters: [idParameter],
    post: op(name.replace("-", "") + "Quotation", title, description, {
      requestBody: requestBody(schema, example),
      responses: response(String(code), title, exampleDetail),
    }),
  };
}
paths["/quotations/{id}/buyer-response"].post.requestBody.content[
  "application/json"
].examples = {
  accepted: {
    value: {
      version: 4,
      decision: "Accepted",
      reference: "Buyer email dated 2026-10-16",
    },
  },
  declined: {
    value: {
      version: 4,
      decision: "Declined",
      reference: "Buyer email",
      reason: "Delivery too late",
    },
  },
};
delete paths["/quotations/{id}/buyer-response"].post.requestBody.content[
  "application/json"
].example;
paths["/quotations/{id}/pdf"] = {
  parameters: [idParameter],
  get: op(
    "downloadQuotationPdf",
    "Download quotation PDF",
    "Uses current draft buyer/garments for Draft and immutable stored snapshots otherwise. Includes seller, revision/status, addresses, dates, terms, fabric/GSM, colour/size, quantities, prices and totals. Watermarks nonissued states and labels Accepted/Converted. Staff-only notes are excluded. Generation never changes status.",
    {
      responses: {
        200: {
          description: "Binary PDF attachment",
          headers: {
            "Content-Disposition": {
              schema: { type: "string" },
              example: 'attachment; filename="QT-2026-0001-R1.pdf"',
            },
          },
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        },
        ...errors,
      },
    },
  ),
};
const orderExample = {
  id: orderId,
  salesOrderId: orderId,
  orderNumber: "SO-2026-0001",
  status: "Draft",
  sourceQuotationId: quoteId,
  sourceQuoteNumber: "QT-2026-0001",
  sourceRevision: 1,
  currency: "USD",
  totalQty: 1000,
  subtotal: "5500.00",
  total: "5500.00",
  version: 1,
  deletedAt: null,
  archived: false,
};
paths["/quotations/{id}/convert"] = {
  parameters: [idParameter],
  post: op(
    "convertQuotation",
    "Convert accepted revision to one Draft order",
    "Requires Idempotency-Key. Locks reservation then family/revision, validates accepted link and active buyer/team/owner, and copies accepted snapshots/lines exactly. Acceptance remains convertible after validUntil. First success 201; identical key/payload replays saved status/body. Reused key/different payload 409. New key on an existing conversion returns linked identity with 200 before stale-version checks, including deleted/archived state. No production, shipping, invoice or payment is started.",
    {
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: string(128, { minLength: 1 }),
          example: "d0000000-0000-4000-8000-000000000001",
        },
      ],
      requestBody: requestBody("VersionAction", { version: 5 }),
      responses: {
        ...response(
          "201",
          "Created Draft sales order, or replay of the original 201",
          orderExample,
          "SalesOrderSummary",
        ),
        200: {
          description:
            "Existing linked order with a new key (may be archived), or replay of a saved 200",
          content: json(envelope(ref("SalesOrderSummary")), {
            data: {
              ...orderExample,
              deletedAt: "2026-11-01T00:00:00.000Z",
              archived: true,
            },
          }),
        },
      },
    },
  ),
};
const doc = {
  openapi: "3.0.3",
  info: {
    title: "Garment ERP Quotations",
    version: "1.0.0",
    description:
      "Revision IDs identify commercial offers within one family. Exactly 15 quotation operations. Trusted server middleware supplies req.user = {id, role, salesTeamIds}. Authentication/login is outside this module; no client actor IDs/roles are accepted. Development-only fixed principals are configured by server environment, never HTTP headers. USD/LKR/GBP/EUR only, two decimals, PCS integer quantities, no FX/tax/freight/discounts. Company timezone defaults to Asia/Colombo; validUntil includes its entire local date. Dates in examples are illustrative; demo data uses future relative dates. See quotations.md for setup, roles and UI mapping.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [{ name: "Quotations" }],
  paths,
  components: { schemas },
};
await fs.writeFile(
  "docs/quotations.openapi.yaml",
  YAML.stringify(doc, { lineWidth: 120 }),
);
console.log("Generated OpenAPI: 15 operations");
