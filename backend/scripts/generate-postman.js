import fs from "node:fs/promises";
import { demoIds } from "../src/middleware/auth-context.js";

const script = (listen, source) => ({
  listen,
  script: { type: "text/javascript", exec: source.trim().split("\n") },
});
const formatBody = (value) =>
  JSON.stringify(value, null, 2).replace(
    /"\{\{(quoteVersion|conversionVersion)\}\}"/g,
    "{{$1}}",
  );
const dateScript = `
const offset = Number(pm.variables.get('companyUtcOffsetMinutes') || 330);
if (!Number.isFinite(offset) || Math.abs(offset) > 840) throw new Error('companyUtcOffsetMinutes must be between -840 and 840');
const today = new Date(Date.now() + offset * 60000).toISOString().slice(0,10);
function future(days) { const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0,10); }
pm.collectionVariables.set('quotationDate', today);
pm.collectionVariables.set('validUntil', future(15));
pm.collectionVariables.set('requestedDeliveryDate', future(45));
for (const name of ['quoteId','quoteVersion','quoteNumber','originalQuoteId','originalQuoteVersion','salesOrderId','idempotencyKey','retryIdempotencyKey','conversionVersion']) pm.collectionVariables.unset(name);
`;
const input = {
  customerId: "{{customerId}}",
  salesTeamId: "{{salesTeamId}}",
  ownerId: "{{ownerId}}",
  currency: "USD",
  quotationDate: "{{quotationDate}}",
  validUntil: "{{validUntil}}",
  requestedDeliveryDate: "{{requestedDeliveryDate}}",
  billingAddressId: "{{billingAddressId}}",
  shippingAddressId: "{{shippingAddressId}}",
  paymentTerms: "30% advance; 70% before shipment",
  notes: "Staff-only: Pack by colour and size",
  lines: ["Navy", "White"].flatMap((colour) =>
    ["S", "M", "L"].map((size) => ({
      styleId: "{{styleId}}",
      colour,
      size,
      qty: size === "L" ? 100 : 200,
      unitPrice: "5.50",
    })),
  ),
};
function request(
  name,
  method,
  path,
  {
    actor = "sales",
    body,
    expected = 200,
    capture = false,
    state,
    extra = "",
    before = "",
    headers = [],
    pdf = false,
    description = "",
  } = {},
) {
  const base = actor === "manager" ? "{{managerBaseUrl}}" : "{{salesBaseUrl}}";
  const tests = `
pm.test('HTTP ${expected}', function () { pm.response.to.have.status(${expected}); });
${
  pdf
    ? `pm.test('PDF attachment', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/pdf'); pm.expect(pm.response.headers.get('Content-Disposition')).to.include('attachment'); });`
    : expected === 204
      ? `pm.test('No response body', function () { pm.expect(pm.response.text()).to.equal(''); });`
      : `
pm.test('JSON response', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });
let payload;
try { payload = pm.response.json(); } catch (_) {}
${expected < 300 ? `pm.test('Data envelope', function () { pm.expect(payload).to.have.property('data'); });` : `pm.test('Error envelope with request ID', function () { pm.expect(payload.error.code).to.be.a('string'); pm.expect(payload.error.requestId).to.be.a('string'); });`}
if (pm.response.code === ${expected} && payload && payload.data) {
  const data = payload.data;
  ${capture ? `pm.collectionVariables.set('quoteId', data.id); pm.collectionVariables.set('quoteVersion', data.version); pm.collectionVariables.set('quoteNumber', data.quoteNumber);` : ""}
  ${state ? `pm.test('Status is ${state}', function () { pm.expect(data.status).to.equal('${state}'); });` : ""}
  ${extra}
}
`
}
`;
  return {
    name,
    request: {
      method,
      header: [
        { key: "Accept", value: pdf ? "application/pdf" : "application/json" },
        ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
        ...headers,
      ],
      url: base + path,
      ...(body
        ? {
            body: {
              mode: "raw",
              raw: formatBody(body),
              options: { raw: { language: "json" } },
            },
          }
        : {}),
      description,
    },
    event: [
      ...(before ? [script("prerequest", before)] : []),
      script("test", tests),
    ],
  };
}
const create = () =>
  request(
    "Create Draft — Ocean Apparel, 1,000 PCS / USD 5,500.00",
    "POST",
    "/quotations",
    {
      body: input,
      expected: 201,
      capture: true,
      state: "Draft",
      before: dateScript,
      extra: `pm.test('Ocean example totals', function () { pm.expect(data.totalQty).to.equal(1000); pm.expect(data.subtotal).to.equal('5500.00'); pm.expect(data.total).to.equal('5500.00'); pm.expect(data.lines).to.have.lengthOf(6); });`,
      description:
        "Creates a new family and Draft. Generates current company-local dates with +15-day validity and +45-day delivery. Resets saved workflow variables so this folder can be rerun safely. Requires npm run migrate and npm run seed.",
    },
  );
const get = () =>
  request(
    "Get current revision — refresh version and allowedActions",
    "GET",
    "/quotations/{{quoteId}}",
    {
      capture: true,
      description:
        "Refresh before editing an existing revision. Saves its ID, number and version; inspect allowedActions before calling actions.",
    },
  );
const edit = () =>
  request(
    "Edit Draft — update internal notes",
    "PATCH",
    "/quotations/{{quoteId}}",
    {
      body: {
        version: "{{quoteVersion}}",
        notes: "Staff-only: Revised packing instructions",
      },
      capture: true,
      state: "Draft",
      description:
        "Only supplied editable fields change. To replace lines, supply the entire nonempty lines array; line IDs may change. Uses the saved current version.",
    },
  );
const action = (name, options = {}) =>
  request(
    {
      submit: "Submit for approval",
      approve: "Approve — separate manager",
      reject: "Reject — return to Draft",
      withdraw: "Withdraw — return to Draft",
      issue: "Issue manually",
      void: "Void — manager cancels offer",
      revisions: "Create replacement Draft revision",
      "buyer-response": "Record buyer response",
    }[name],
    "POST",
    "/quotations/{{quoteId}}/" + name,
    {
      body: { version: "{{quoteVersion}}", ...options.body },
      capture: true,
      ...options,
      description:
        options.description ||
        "Uses quoteId and quoteVersion from the most recent successful detail/action response. Failed requests do not change saved IDs or versions.",
    },
  );
const submit = () => action("submit", { state: "PendingApproval" });
const approve = () =>
  action("approve", {
    actor: "manager",
    body: { version: "{{quoteVersion}}", comment: "Pricing reviewed" },
    state: "Approved",
    description:
      "Uses managerBaseUrl because the approver must differ from the submitter. Both servers connect to the same MySQL database.",
  });
const issue = () =>
  action("issue", {
    body: { version: "{{quoteVersion}}", channel: "manual" },
    state: "Issued",
  });
const response = (decision) =>
  action("buyer-response", {
    state: decision,
    body: {
      version: "{{quoteVersion}}",
      decision,
      reference: "Buyer email recorded during Postman test",
      ...(decision === "Declined" ? { reason: "Delivery too late" } : {}),
    },
    description:
      "Records a staff-reported buyer response for the active, unexpired issued offer. Does not send email or perform e-signing.",
  });
const revise = () =>
  action("revisions", {
    body: {
      version: "{{quoteVersion}}",
      reason: "Buyer requested updated quantity",
    },
    expected: 201,
    state: "Draft",
    before: `pm.collectionVariables.set('originalQuoteId', pm.collectionVariables.get('quoteId')); pm.collectionVariables.set('originalQuoteVersion', pm.collectionVariables.get('quoteVersion'));`,
    extra: `pm.test('Separate revision, same family number', function () { pm.expect(data.id).not.to.equal(pm.collectionVariables.get('originalQuoteId')); pm.expect(data.priorRevisionId).to.equal(pm.collectionVariables.get('originalQuoteId')); });`,
    description:
      "Saves the source ID as originalQuoteId and switches quoteId/quoteVersion to the NEW Draft. The existing offer remains valid until the replacement is issued.",
  });
const remove = () =>
  request(
    "Soft-delete Draft — If-Match version",
    "DELETE",
    "/quotations/{{quoteId}}",
    {
      expected: 204,
      headers: [{ key: "If-Match", value: '"{{quoteVersion}}"' }],
      description:
        "Draft only. Sends a quoted version in If-Match. Records and lines remain in history.",
    },
  );
const conversionExtra = `pm.test('Draft order, exact quote total', function () { pm.expect(data.status).to.equal('Draft'); pm.expect(data.total).to.equal('5500.00'); pm.expect(data.sourceQuotationId).to.equal(pm.collectionVariables.get('quoteId')); });
pm.collectionVariables.set('salesOrderId', data.salesOrderId);`;
const collection = {
  info: {
    _postman_id: "0a3877c0-e637-4c82-a398-02905fec9d6c",
    name: "Garment ERP — Quotations",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "All 15 quotation APIs with executable happy-path and alternative lifecycle workflows. Import the paired local environment, migrate/seed MySQL, then start separate fixed-principal Sales and Manager development servers. Defaults: Sales http://127.0.0.1:4100/api/v1 and Manager http://127.0.0.1:4101/api/v1. No tokens or actor headers are invented: identity comes from each server's DEV_ACTOR setting. Run folders in their listed order; each folder creates its own Draft and captures actual returned IDs/versions. Generated dates use companyUtcOffsetMinutes (330 for Asia/Colombo). Running the full collection creates test commercial records and Draft orders in whichever database those servers use. See README.md in this folder for commands.",
  },
  variable: [
    ["salesBaseUrl", "http://127.0.0.1:4100/api/v1"],
    ["managerBaseUrl", "http://127.0.0.1:4101/api/v1"],
    ["companyUtcOffsetMinutes", "330"],
    ["customerId", demoIds.customer],
    ["salesTeamId", demoIds.team],
    ["ownerId", demoIds.sales],
    ["billingAddressId", demoIds.billing],
    ["shippingAddressId", demoIds.shipping],
    ["styleId", demoIds.style],
    ...[
      "quoteId",
      "quoteVersion",
      "quoteNumber",
      "originalQuoteId",
      "originalQuoteVersion",
      "salesOrderId",
      "conversionVersion",
      "idempotencyKey",
      "retryIdempotencyKey",
      "quotationDate",
      "validUntil",
      "requestedDeliveryDate",
    ].map((k) => [k, ""]),
  ].map(([key, value]) => ({ key, value, type: "string" })),
  item: [
    {
      name: "01 — Happy path and idempotent conversion",
      description:
        "Run this folder first. Covers list, create, detail, update, submit, approve, issue, PDF, acceptance and conversion. Replays the original conversion and checks another key returns the same existing order.",
      item: [
        request(
          "List quotations — filters and pagination",
          "GET",
          "/quotations?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&includeRevisions=false",
          {
            extra: `pm.test('Pagination metadata', function () { pm.expect(payload.meta.page).to.equal(1); pm.expect(payload.meta.pageSize).to.equal(20); pm.expect(data).to.be.an('array'); });`,
            description:
              "Optional query filters: q, status, customerId, salesTeamId, ownerId, fromDate, toDate. Latest nondeleted revision per family by default; includeRevisions=true returns history.",
          },
        ),
        create(),
        get(),
        edit(),
        submit(),
        approve(),
        issue(),
        request(
          "Download quotation PDF",
          "GET",
          "/quotations/{{quoteId}}/pdf",
          {
            pdf: true,
            description:
              "Use Send and Download in Postman to save the PDF. Tests verify PDF content type and attachment header. Does not change status.",
          },
        ),
        response("Accepted"),
        request(
          "Convert accepted quotation — first attempt",
          "POST",
          "/quotations/{{quoteId}}/convert",
          {
            body: { version: "{{conversionVersion}}" },
            expected: 201,
            headers: [{ key: "Idempotency-Key", value: "{{idempotencyKey}}" }],
            before: `if (!pm.collectionVariables.get('idempotencyKey')) { pm.collectionVariables.set('idempotencyKey', pm.variables.replaceIn('{{$guid}}')); pm.collectionVariables.set('conversionVersion', pm.collectionVariables.get('quoteVersion')); }`,
            extra: conversionExtra,
            description:
              "Generates an idempotency key once and freezes the accepted version for all retries. Stores salesOrderId. Does not replace quoteVersion with the order version.",
          },
        ),
        request(
          "Replay identical conversion — same key and payload",
          "POST",
          "/quotations/{{quoteId}}/convert",
          {
            body: { version: "{{conversionVersion}}" },
            expected: 201,
            headers: [{ key: "Idempotency-Key", value: "{{idempotencyKey}}" }],
            extra: `pm.test('Same linked order', function () { pm.expect(data.salesOrderId).to.equal(pm.collectionVariables.get('salesOrderId')); });`,
            description:
              "Reuses the exact same key and accepted version. Expected 201 is the saved original response, not a second creation.",
          },
        ),
        request(
          "Retry conversion with another key — existing order",
          "POST",
          "/quotations/{{quoteId}}/convert",
          {
            body: { version: "{{conversionVersion}}" },
            expected: 200,
            headers: [
              { key: "Idempotency-Key", value: "{{retryIdempotencyKey}}" },
            ],
            before: `if (!pm.collectionVariables.get('retryIdempotencyKey')) pm.collectionVariables.set('retryIdempotencyKey', pm.variables.replaceIn('{{$guid}}'));`,
            extra: `pm.test('No duplicate order', function () { pm.expect(data.salesOrderId).to.equal(pm.collectionVariables.get('salesOrderId')); });`,
            description:
              "A new key on an already converted quotation returns the same order with 200, even with the old accepted version.",
          },
        ),
        get(),
      ],
    },
    {
      name: "02 — Rejection and withdrawal cycles",
      description:
        "Independent fixture: create, submit, reject, edit/resubmit, then withdraw.",
      item: [
        create(),
        submit(),
        action("reject", {
          actor: "manager",
          body: {
            version: "{{quoteVersion}}",
            reason: "Please review unit prices",
          },
          state: "Draft",
        }),
        edit(),
        submit(),
        action("withdraw", {
          body: {
            version: "{{quoteVersion}}",
            reason: "Buyer changed quantities",
          },
          state: "Draft",
        }),
        get(),
      ],
    },
    {
      name: "03 — Revision, supersession, decline and void",
      description:
        "Independent fixture: issue original, create and issue replacement, confirm original was superseded, record decline, prepare another revision and void it after approval.",
      item: [
        create(),
        submit(),
        approve(),
        issue(),
        revise(),
        submit(),
        approve(),
        issue(),
        request(
          "Read original revision — now Superseded",
          "GET",
          "/quotations/{{originalQuoteId}}",
          {
            state: "Superseded",
            description:
              "Reads saved originalQuoteId without replacing current quoteId/quoteVersion for the replacement offer.",
          },
        ),
        response("Declined"),
        revise(),
        submit(),
        approve(),
        action("void", {
          actor: "manager",
          body: { version: "{{quoteVersion}}", reason: "Offer withdrawn" },
          state: "Cancelled",
        }),
        get(),
      ],
    },
    {
      name: "04 — Draft soft deletion",
      description:
        "Independent Draft; deletion preserves audit/lines and subsequent detail returns 404.",
      item: [
        create(),
        remove(),
        request(
          "Deleted revision — expected 404",
          "GET",
          "/quotations/{{quoteId}}",
          { expected: 404 },
        ),
      ],
    },
    {
      name: "05 — Validation and concurrency errors",
      description:
        "Expected errors are intentional passing assertions. Creates its own Draft and cleans it up by soft deletion.",
      item: [
        create(),
        request(
          "Protected status patch — expected 422",
          "PATCH",
          "/quotations/{{quoteId}}",
          {
            body: { version: "{{quoteVersion}}", status: "Accepted" },
            expected: 422,
          },
        ),
        request(
          "Stale edit version — expected 409",
          "PATCH",
          "/quotations/{{quoteId}}",
          {
            body: {
              version: 4294967295,
              notes: "Must not overwrite current Draft",
            },
            expected: 409,
          },
        ),
        request(
          "Sales cannot approve — expected 403",
          "POST",
          "/quotations/{{quoteId}}/approve",
          { body: { version: "{{quoteVersion}}" }, expected: 403 },
        ),
        remove(),
      ],
    },
  ],
};
const environment = {
  id: "95df7ea7-339a-44af-8f5d-5709bdab3b3a",
  name: "Garment ERP — Local development",
  _postman_variable_scope: "environment",
  values: collection.variable
    .filter((v) =>
      [
        "salesBaseUrl",
        "managerBaseUrl",
        "companyUtcOffsetMinutes",
        "customerId",
        "salesTeamId",
        "ownerId",
        "billingAddressId",
        "shippingAddressId",
        "styleId",
      ].includes(v.key),
    )
    .map((v) => ({ ...v, enabled: true, type: "default" })),
};
await fs.mkdir("docs/postman", { recursive: true });
await fs.writeFile(
  "docs/postman/quotations.postman_collection.json",
  JSON.stringify(collection, null, 2) + "\n",
);
await fs.writeFile(
  "docs/postman/local.postman_environment.json",
  JSON.stringify(environment, null, 2) + "\n",
);
console.log(
  `Generated collection: ${collection.item.reduce((n, f) => n + f.item.length, 0)} requests covering all 15 quotation operations`,
);
