import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { customerDemoInput } from "../src/db/seeders/customers-demo.js";
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const str = (maxLength, extra = {}) => ({
  type: "string",
  ...(maxLength ? { maxLength } : {}),
  ...extra,
});
const nullable = (maxLength, extra = {}) =>
  str(maxLength, { nullable: true, ...extra });
const uuid = str(undefined, { format: "uuid" }),
  time = str(undefined, { format: "date-time" }),
  bool = { type: "boolean" },
  version = { type: "integer", minimum: 1, maximum: 4294967295 };
const object = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const country = str(2, {
  minLength: 2,
  pattern: "^[A-Z]{2}$",
  description: "Must belong to COMPANY_COUNTRIES. Input trimmed/uppercased.",
});
const scalar = {
  name: str(200, { minLength: 2 }),
  displayName: nullable(150),
  country,
  currency: { type: "string", enum: ["USD", "LKR", "GBP", "EUR"] },
  paymentTerms: str(500, { minLength: 1 }),
  salesTeamId: uuid,
  ownerId: uuid,
  email: nullable(254, {
    format: "email",
    description:
      "Trim; preserve local-part case; lowercase domain. No delivery/ownership verification.",
  }),
  phone: nullable(40, {
    description:
      "International prefixes, spaces, parentheses, dots and hyphens; 7–18 digits.",
  }),
  website: nullable(500, {
    format: "uri",
    description: "Absolute http/https only. Stored as text; never fetched.",
  }),
  registrationNumber: nullable(100),
  internalNotes: nullable(5000),
};
const requiredScalar = [
  "name",
  "country",
  "currency",
  "paymentTerms",
  "salesTeamId",
  "ownerId",
];
const contact = {
  name: str(150, { minLength: 1 }),
  jobTitle: nullable(100),
  email: scalar.email,
  phone: scalar.phone,
  primary: { ...bool, default: false },
  isActive: { ...bool, default: true },
};
const address = {
  addressType: { type: "string", enum: ["billing", "shipping"] },
  label: nullable(100),
  line1: str(200, { minLength: 1 }),
  line2: nullable(200),
  city: str(100, { minLength: 1 }),
  region: nullable(100),
  postalCode: nullable(30),
  country,
  isDefault: { ...bool, default: false },
  isActive: { ...bool, default: true },
};
const array = (items, maxItems = 100, minItems) => ({
  type: "array",
  items,
  maxItems,
  ...(minItems ? { minItems } : {}),
});
const contactChange = { ...contact, primary: bool, isActive: bool },
  addressChange = { ...address, isDefault: bool, isActive: bool };
const blocker = object(
  {
    entityType: { type: "string", enum: ["quotation", "sales_order"] },
    id: uuid,
    number: str(50),
    status: str(32),
    validityEnded: bool,
    href: str(200),
  },
  ["entityType", "id", "number", "status", "validityEnded", "href"],
);
const counts = {
  blockerCount: { type: "integer", minimum: 0 },
  visibleBlockerCount: { type: "integer", minimum: 0 },
  openQuotationCount: { type: "integer", minimum: 0 },
  draftOrderCount: { type: "integer", minimum: 0 },
  archiveBlockers: array(ref("Blocker"), 20),
  restrictedBlockers: bool,
  countsScope: { type: "string", enum: ["all-company", "actor-visible-teams"] },
  blockerCountScope: { type: "string", enum: ["all-dependent-documents"] },
};
const summary = {
  id: uuid,
  code: str(30),
  name: scalar.name,
  displayName: scalar.displayName,
  country,
  currency: scalar.currency,
  status: { type: "string", enum: ["Active", "Archived"] },
  version,
  salesTeam: object({ id: uuid, name: str(200) }, ["id", "name"]),
  owner: object({ id: uuid, displayName: str(200) }, ["id", "displayName"]),
};
const schemas = {
  CustomerCreateInput: object(
    {
      ...scalar,
      contacts: array(ref("ContactCreate"), 100, 1),
      addresses: array(ref("AddressCreate"), 100, 2),
    },
    [...requiredScalar, "contacts", "addresses"],
  ),
  ContactCreate: object(contact, ["name"]),
  AddressCreate: object(address, ["addressType", "line1", "city", "country"]),
  ExistingContactChange: object({ id: uuid, ...contactChange }, ["id"]),
  ExistingAddressChange: object({ id: uuid, ...addressChange }, ["id"]),
  CustomerPatchInput: {
    ...object(
      {
        version,
        ...scalar,
        reason: str(1000, { minLength: 1 }),
        contacts: array({
          oneOf: [ref("ExistingContactChange"), ref("ContactCreate")],
        }),
        addresses: array({
          oneOf: [ref("ExistingAddressChange"), ref("AddressCreate")],
        }),
      },
      ["version"],
    ),
    description:
      "Aggregate change set; omitted fields/children and empty arrays preserve existing rows. Child IDs belong to this customer and appear once. Existing child flags have no defaults. New children use create defaults. Address type is immutable. Final state needs exactly one active primary and one active default per address type. Ownership changes require both assignment IDs plus reason. No-op keeps version/audit unchanged; stale no-op still conflicts.",
  },
  LifecycleInput: object({ version, reason: str(1000, { minLength: 1 }) }, [
    "version",
    "reason",
  ]),
  Contact: object(
    { id: uuid, ...contactChange, createdAt: time, updatedAt: time },
    ["id", "name", "primary", "isActive", "createdAt", "updatedAt"],
  ),
  Address: object(
    { id: uuid, ...addressChange, createdAt: time, updatedAt: time },
    [
      "id",
      "addressType",
      "line1",
      "city",
      "country",
      "isDefault",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
  ),
  Blocker: blocker,
  BlockerDetails: object(counts, Object.keys(counts)),
  CommercialSummary: object(
    {
      ...counts,
      activeOrderCount: { type: "integer", minimum: 0 },
      canArchive: bool,
    },
    [...Object.keys(counts), "activeOrderCount", "canArchive"],
  ),
  CustomerSummary: object(summary, [
    "id",
    "code",
    "name",
    "country",
    "currency",
    "status",
    "salesTeam",
    "owner",
    "version",
  ]),
  CustomerDetail: object(
    {
      ...summary,
      ...scalar,
      contacts: array(ref("Contact"), 500),
      addresses: array(ref("Address"), 500),
      createdAt: time,
      updatedAt: time,
      createdBy: uuid,
      updatedBy: uuid,
      archivedAt: { ...time, nullable: true },
      archivedBy: { ...uuid, nullable: true },
      archiveReason: nullable(1000),
      allowedActions: array(
        { type: "string", enum: ["edit", "archive", "reactivate"] },
        3,
      ),
      commercialSummary: ref("CommercialSummary"),
    },
    [
      "id",
      "code",
      ...requiredScalar,
      "status",
      "version",
      "salesTeam",
      "owner",
      "contacts",
      "addresses",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
      "archivedAt",
      "archivedBy",
      "archiveReason",
      "allowedActions",
      "commercialSummary",
    ],
  ),
  CustomerResponse: object({ data: ref("CustomerDetail") }, ["data"]),
  CustomerList: object(
    {
      data: array(ref("CustomerSummary"), 100),
      meta: object(
        {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          total: { type: "integer", minimum: 0 },
        },
        ["page", "pageSize", "total"],
      ),
    },
    ["data", "meta"],
  ),
  Error: object(
    {
      error: object(
        {
          code: {
            type: "string",
            enum: [
              "INVALID_REQUEST",
              "MALFORMED_JSON",
              "INVALID_IDEMPOTENCY_KEY",
              "UNAUTHENTICATED",
              "INVALID_PRINCIPAL",
              "FORBIDDEN",
              "NOT_FOUND",
              "STALE_VERSION",
              "VERSION_EXHAUSTED",
              "SEQUENCE_EXHAUSTED",
              "INVALID_TRANSITION",
              "INVALID_CHILD_REFERENCE",
              "INVALID_TEAM_OWNER",
              "CUSTOMER_HAS_OPEN_DOCUMENTS",
              "ADDRESS_IN_USE",
              "IDEMPOTENCY_KEY_REUSED",
              "CONSTRAINT_CONFLICT",
              "REFERENCED_RECORD_CONFLICT",
              "VALIDATION_ERROR",
              "PAYLOAD_TOO_LARGE",
              "INTERNAL_ERROR",
            ],
          },
          message: str(),
          fields: { type: "object", additionalProperties: { type: "string" } },
          details: ref("BlockerDetails"),
          requestId: uuid,
        },
        ["code", "message", "requestId"],
      ),
    },
    ["error"],
  ),
};
const response = (description, schema, example) => ({
  description,
  headers: {
    "X-Request-Id": { schema: uuid },
    "Cache-Control": {
      schema: { type: "string" },
      example: "private, no-store",
    },
  },
  content: {
    "application/json": {
      schema: ref(schema),
      ...(example ? { example } : {}),
    },
  },
});
const errors = {
  400: response(
    "INVALID_REQUEST (query/path), MALFORMED_JSON or INVALID_IDEMPOTENCY_KEY",
    "Error",
  ),
  401: response("UNAUTHENTICATED or INVALID_PRINCIPAL", "Error"),
  403: response(
    "FORBIDDEN: master-data or assignment permission required",
    "Error",
  ),
  404: response("NOT_FOUND including out-of-scope customers", "Error"),
  409: response(
    "STALE_VERSION, INVALID_TRANSITION, CUSTOMER_HAS_OPEN_DOCUMENTS, ADDRESS_IN_USE, IDEMPOTENCY_KEY_REUSED or database constraint conflict; blocker details are visibility filtered",
    "Error",
  ),
  413: response("PAYLOAD_TOO_LARGE (>1 MB JSON)", "Error"),
  422: response(
    "VALIDATION_ERROR, INVALID_CHILD_REFERENCE or INVALID_TEAM_OWNER",
    "Error",
  ),
  500: response("INTERNAL_ERROR: sanitized unexpected failure", "Error"),
};
const param = (
  name,
  schema,
  description,
  location = "query",
  required = false,
) => ({ name, in: location, required, description, schema });
const id = param("id", uuid, "Customer UUID", "path", true);
const requestBody = (schema, example) => ({
  required: true,
  content: { "application/json": { schema: ref(schema), example } },
});
const example = customerDemoInput();
const exampleDetail = {
  ...example,
  id: "30000000-0000-4000-8000-000000000002",
  code: "CUS-000001",
  version: 1,
  status: "Active",
  salesTeam: { id: example.salesTeamId, name: "Apparel Sales" },
  owner: { id: example.ownerId, displayName: "Demo Sales" },
  contacts: [
    {
      ...example.contacts[0],
      id: "60000000-0000-4000-8000-000000000002",
      isActive: true,
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:00:00.000Z",
    },
  ],
  addresses: example.addresses.map((x, i) => ({
    ...x,
    id: `40000000-0000-4000-8000-${String(i + 3).padStart(12, "0")}`,
    isActive: true,
    isDefault: !!x.isDefault,
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  })),
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  createdBy: "10000000-0000-4000-8000-000000000003",
  updatedBy: "10000000-0000-4000-8000-000000000003",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  allowedActions: ["edit", "archive"],
  commercialSummary: {
    blockerCount: 0,
    visibleBlockerCount: 0,
    openQuotationCount: 0,
    draftOrderCount: 0,
    activeOrderCount: 0,
    canArchive: true,
    archiveBlockers: [],
    restrictedBlockers: false,
    countsScope: "all-company",
    blockerCountScope: "all-dependent-documents",
  },
};
const operation = (operationId, summary, description, extra = {}) => ({
  operationId,
  summary,
  description,
  tags: ["Customers"],
  "x-authentication":
    "Trusted upstream req.user; no caller-controlled role/actor headers. Admin global; other roles scoped by salesTeamIds. Writes require Admin or trusted customers:write; assignment also needs customers:assign.",
  ...extra,
});
const paths = {
  "/customers": {
    get: operation(
      "listCustomers",
      "Search buyers",
      "Default Active, actor scope applied before count/pagination. q searches code/name/displayName only. Escape literal backslash, % and _. Broad %q% matching is not indexed full-text search.",
      {
        parameters: [
          param("q", str(100, { minLength: 1 }), "Literal substring, trimmed"),
          param(
            "status",
            {
              type: "string",
              enum: ["Active", "Archived", "All"],
              default: "Active",
            },
            "Stored canonical status is is_active",
          ),
          ...["salesTeamId", "ownerId"].map((k) =>
            param(k, uuid, "Optional exact filter"),
          ),
          param("country", country, "Configured ISO code"),
          param("currency", scalar.currency, "Exact currency filter"),
          param(
            "page",
            { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
            "Page number",
          ),
          param(
            "pageSize",
            { type: "integer", minimum: 1, maximum: 100, default: 20 },
            "Rows per page",
          ),
          param(
            "sortBy",
            {
              type: "string",
              enum: ["name", "code", "createdAt"],
              default: "name",
            },
            "Allowlisted sort; ID breaks ties",
          ),
          param(
            "sortOrder",
            { type: "string", enum: ["asc", "desc"], default: "asc" },
            "Sort direction",
          ),
        ],
        responses: {
          200: response(
            "Customer list; empty data array is valid",
            "CustomerList",
            { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
          ),
          400: errors[400],
          401: errors[401],
          500: errors[500],
        },
      },
    ),
    post: operation(
      "createCustomer",
      "Create buyer atomically",
      "Requires Admin or scoped master-data capability. Idempotency hash binds POST /api/v1/customers and canonical parsed body. Same key/body replays exact saved result after current authorization; a different key creates another buyer even with identical name/email. New records Active. At most 50 active contacts and addresses, 500 stored per type.",
      {
        parameters: [
          param(
            "Idempotency-Key",
            str(128, { minLength: 1, pattern: "^[!-~]+$" }),
            "Reuse on unknown timeout; never create a fresh key for the same attempt",
            "header",
            true,
          ),
        ],
        requestBody: requestBody("CustomerCreateInput", example),
        responses: {
          201: response(
            "Created or authorized idempotent replay",
            "CustomerResponse",
            { data: exampleDetail },
          ),
          ...errors,
        },
      },
    ),
  },
  "/customers/{id}": {
    get: operation(
      "getCustomer",
      "Read profile and bounded commercial summary",
      "Archived profiles remain readable. Active children by default; edit/history requests includeInactiveChildren=true. Document examples max20 and visibility filtered; blockerCount is all dependent records; other counts are actor-visible. commercialSummary.canArchive is factual eligibility; allowedActions additionally reflects permission. History uses existing document list APIs with customerId; no unbounded history.",
      {
        parameters: [
          id,
          param(
            "includeInactiveChildren",
            { type: "boolean", default: false },
            "True includes deactivated rows (at most500/type)",
          ),
        ],
        responses: {
          200: response("Customer profile", "CustomerResponse", {
            data: exampleDetail,
          }),
          400: errors[400],
          401: errors[401],
          404: errors[404],
          500: errors[500],
        },
      },
    ),
    patch: operation(
      "patchCustomer",
      "Edit buyer and nested change sets",
      "Checks version under customer UPDATE lock; exactly one parent version increment if anything changes. Clears affected default/primary slots first. All changes, audit and flags roll back together. Archived repairs allowed; same child completeness rules. Changing assignment requires both IDs + reason and assignment permission. Existing documents/snapshots never rewritten. Deactivation blocked by live Draft billing/shipping IDs in either module; frozen or snapshot-only use does not block.",
      {
        parameters: [id],
        requestBody: requestBody("CustomerPatchInput", {
          version: 1,
          addresses: [
            { id: "40000000-0000-4000-8000-000000000004", isDefault: false },
            { id: "40000000-0000-4000-8000-000000000005", isDefault: true },
          ],
        }),
        responses: {
          200: response(
            "Updated detail including inactive children; no-op returns unchanged version",
            "CustomerResponse",
          ),
          ...errors,
        },
      },
    ),
  },
  "/customers/{id}/archive": {
    post: operation(
      "archiveCustomer",
      "Archive buyer",
      "Active → Archived. Mandatory reason/version. All nondeleted revisions Draft/PendingApproval/Approved/Issued/Accepted and Draft orders block. Stale date-expired Issued offers conservatively block with validityEnded hint; resolve through existing quotation workflow. Confirmed order fulfilment continues. Checks all dependencies under parent lock with fresh READ COMMITTED reads; never locks document rows in reverse order.",
      {
        parameters: [id],
        requestBody: requestBody("LifecycleInput", {
          version: 3,
          reason: "Buyer account no longer used",
        }),
        responses: {
          200: response(
            "Archived profile; children preserved",
            "CustomerResponse",
          ),
          ...errors,
        },
      },
    ),
  },
  "/customers/{id}/reactivate": {
    post: operation(
      "reactivateCustomer",
      "Reactivate repaired buyer",
      "Archived → Active after revalidating full master, active team/owner/membership and primary/default child completeness. Repair through PATCH first. Clears current archive metadata and retains append-only history. Never reopens commercial documents.",
      {
        parameters: [id],
        requestBody: requestBody("LifecycleInput", {
          version: 4,
          reason: "Buyer resumed purchases",
        }),
        responses: {
          200: response("Active profile", "CustomerResponse"),
          ...errors,
        },
      },
    ),
  },
};
const doc = {
  openapi: "3.0.3",
  info: {
    title: "Garment ERP Customers API",
    version: "1.0.0",
    description:
      "Exactly six Customers endpoints. Single-company buyer master. Authentication supplied by trusted upstream middleware; no login/token endpoints are introduced. Development uses server-configured DEV_AUTH_ENABLED=true DEV_ACTOR=admin, prohibited in production. Fields camelCase; contacts.primary maps is_primary; addresses.addressType is canonical. Optional blank strings normalize to null. Exactly-one aggregate invariants enforced in service; at-most-one also enforced by generated nullable MySQL slots.",
  },
  servers: [
    {
      url: "http://127.0.0.1:4000/api/v1",
      description:
        "Existing API server (write access depends on configured principal)",
    },
  ],
  tags: [{ name: "Customers" }],
  paths,
  components: { schemas },
};
writeFileSync(
  fileURLToPath(new URL("../docs/customers.openapi.yaml", import.meta.url)),
  YAML.stringify(doc, { lineWidth: 100 }),
);
console.log("Generated Customers OpenAPI: 6 operations");
