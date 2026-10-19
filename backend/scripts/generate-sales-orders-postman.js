import { writeFile } from "node:fs/promises";
const variables = [
  ["salesBaseUrl", "http://localhost:4000/api/v1"],
  ["managerBaseUrl", "http://localhost:4101/api/v1"],
  ["customerId", "30000000-0000-4000-8000-000000000001"],
  ["salesTeamId", "20000000-0000-4000-8000-000000000001"],
  ["ownerId", "10000000-0000-4000-8000-000000000001"],
  ["billingAddressId", "40000000-0000-4000-8000-000000000001"],
  ["shippingAddressId", "40000000-0000-4000-8000-000000000002"],
  ["styleId", "50000000-0000-4000-8000-000000000001"],
  ["orderId", ""],
  ["version", "1"],
].map(([key, value]) => ({ key, value, type: "string" }));
const tests = (status, kind = "order") => [
  `pm.test('HTTP ${status}',()=>pm.response.to.have.status(${status}));`,
  ...(kind === "order"
    ? [
        "if(pm.response.code < 300){const d=pm.response.json().data;pm.collectionVariables.set('orderId',d.id);pm.collectionVariables.set('version',String(d.version));}",
      ]
    : kind === "revision"
      ? [
          "if(pm.response.code < 300){const d=pm.response.json().data.order;pm.collectionVariables.set('orderId',d.id);pm.collectionVariables.set('version',String(d.version));}",
        ]
      : kind === "pdf"
        ? [
            "pm.test('PDF content type',()=>pm.expect(pm.response.headers.get('Content-Type')).to.include('application/pdf'));",
          ]
        : []),
];
function req(
  name,
  method,
  path,
  {
    body,
    status = 200,
    kind = "order",
    manager = false,
    idempotent = false,
    header = [],
    pre = [],
  } = {},
) {
  return {
    name,
    request: {
      method,
      header: [
        ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
        ...(idempotent
          ? [{ key: "Idempotency-Key", value: "{{attemptKey}}" }]
          : []),
        ...header,
      ],
      url: `{{${manager ? "manager" : "sales"}BaseUrl}}${path}`,
      ...(body
        ? {
            body: {
              mode: "raw",
              raw: JSON.stringify(body, null, 2),
              options: { raw: { language: "json" } },
            },
          }
        : {}),
      description:
        "Backend actor is determined by the selected fixed development server. Never send actor headers. For uncertain-outcome idempotent retries keep the original attempt key AND original version/body. Unknown transport/5xx outcomes retain the key and original body for the next retry. Definitive responses clear the attempt.",
    },
    event: [
      ...(pre.length || idempotent
        ? [
            {
              listen: "prerequest",
              script: {
                type: "text/javascript",
                exec: [
                  ...pre,
                  ...(idempotent
                    ? [
                        "const scope='soAttempt:'+pm.request.method+':'+pm.variables.replaceIn(pm.request.url.toString());pm.variables.set('soAttemptScope',scope);let saved=pm.collectionVariables.get(scope);saved=saved?JSON.parse(saved):{key:pm.variables.replaceIn('{{$guid}}'),body:pm.variables.replaceIn(pm.request.body.raw)};pm.collectionVariables.set(scope,JSON.stringify(saved));pm.variables.set('attemptKey',saved.key);pm.request.body.update(saved.body);",
                      ]
                    : []),
                ],
              },
            },
          ]
        : []),
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: [
            ...tests(status, kind),
            ...(idempotent
              ? [
                  "if(pm.response.code<500)pm.collectionVariables.unset(pm.variables.get('soAttemptScope'));",
                ]
              : []),
          ],
        },
      },
    ],
  };
}
const lines = ["Navy", "White"].flatMap((colour) =>
  ["S", "M", "L"].map((size) => ({
    styleId: "{{styleId}}",
    colour,
    size,
    qty: size === "L" ? 100 : 200,
    unitPrice: "5.50",
  })),
);
const create = {
  customerId: "{{customerId}}",
  salesTeamId: "{{salesTeamId}}",
  ownerId: "{{ownerId}}",
  currency: "USD",
  orderDate: "{{businessDate}}",
  buyerPoNumber: "{{buyerPoNumber}}",
  buyerPoDate: "{{businessDate}}",
  requestedDeliveryDate: "{{deliveryDate}}",
  billingAddressId: "{{billingAddressId}}",
  shippingAddressId: "{{shippingAddressId}}",
  paymentTerms: "30% advance; 70% before shipment",
  publicNotes: "Pack by colour and size",
  internalNotes: "Internal QA only",
  lines,
};
// Raw placeholders for numeric versions must not be JSON-quoted.
const fix = (item) => {
  if (item.request?.body)
    item.request.body.raw = item.request.body.raw.replaceAll(
      '"{{version}}"',
      "{{version}}",
    );
  if (item.item) item.item.forEach(fix);
};
const collection = {
  info: {
    name: "Garment ERP - Sales Orders",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "15 Sales Orders operations plus existing reference-data lookup. Run folder 1 in order. Folders 2/3/4 need the documented states or a new disposable order. No public fulfilment ingestion route; use CLI fixtures then Refresh detail before Close. Numeric versions are stored from responses. Postman retains the original key/body across missing responses or 5xx; the next retry reuses both. Definitive responses clear the saved attempt.",
  },
  variable: variables,
  item: [
    {
      name: "1. Direct order - create, confirm, hold, amend, resume",
      item: [
        req(
          "Load form choices and company date",
          "GET",
          "/reference-data/quotation-options",
          { kind: "lookup" },
        ),
        req("Create six-line direct Draft", "POST", "/sales-orders", {
          body: create,
          status: 201,
          idempotent: true,
          pre: [
            "const d=new Date();const day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Colombo'});pm.variables.set('businessDate',pm.collectionVariables.get('businessDate')||day);const future=new Date(pm.variables.get('businessDate')+'T12:00:00Z');future.setUTCDate(future.getUTCDate()+45);pm.variables.set('deliveryDate',future.toISOString().slice(0,10));pm.variables.set('buyerPoNumber','PM-'+pm.variables.replaceIn('{{$guid}}'));",
          ],
        }),
        req("Inspect detail", "GET", "/sales-orders/{{orderId}}"),
        req(
          "Edit operational Draft fields",
          "PATCH",
          "/sales-orders/{{orderId}}",
          {
            body: {
              version: "{{version}}",
              publicNotes: "Pack by colour - reviewed",
            },
          },
        ),
        req("Manager confirm", "POST", "/sales-orders/{{orderId}}/confirm", {
          manager: true,
          idempotent: true,
          body: { version: "{{version}}", comment: "PO and delivery checked" },
        }),
        req(
          "Manager hold queued handoff",
          "POST",
          "/sales-orders/{{orderId}}/hold",
          {
            manager: true,
            body: {
              version: "{{version}}",
              reason: "Buyer asked to review delivery",
            },
          },
        ),
        req(
          "Manager operational amendment",
          "POST",
          "/sales-orders/{{orderId}}/revisions",
          {
            manager: true,
            idempotent: true,
            status: 201,
            kind: "revision",
            body: {
              version: "{{version}}",
              reason: "Buyer changed packing instruction",
              buyerReference: "Buyer email",
              changes: { publicNotes: "Deliver grouped by colour" },
            },
          },
        ),
        req("Manager resume", "POST", "/sales-orders/{{orderId}}/resume", {
          manager: true,
          body: {
            version: "{{version}}",
            reason: "Buyer approved instruction",
          },
        }),
      ],
    },
    {
      name: "2. Read screens and immutable documents",
      item: [
        req(
          "List direct orders",
          "GET",
          "/sales-orders?page=1&pageSize=20&source=direct&sortBy=createdAt&sortOrder=desc",
          { kind: "list" },
        ),
        req(
          "Delivery progress",
          "GET",
          "/sales-orders/{{orderId}}/fulfilment",
          { kind: "feed" },
        ),
        req(
          "Revisions",
          "GET",
          "/sales-orders/{{orderId}}/revisions?page=1&pageSize=20",
          { kind: "list" },
        ),
        req(
          "Activity",
          "GET",
          "/sales-orders/{{orderId}}/activity?page=1&pageSize=20",
          { kind: "list" },
        ),
        req("Download latest PDF", "GET", "/sales-orders/{{orderId}}/pdf", {
          kind: "pdf",
        }),
        req(
          "Download revision 1 PDF",
          "GET",
          "/sales-orders/{{orderId}}/pdf?revision=1",
          { kind: "pdf" },
        ),
      ],
    },
    {
      name: "3. Fixture delivery then close (read instructions first)",
      description:
        "Run backend CLI demo:fulfilment with this orderId partial, then complete. Requests below do not manufacture delivery events.",
      item: [
        req(
          "Refresh version after CLI fixtures",
          "GET",
          "/sales-orders/{{orderId}}",
        ),
        req(
          "Manager close delivered order",
          "POST",
          "/sales-orders/{{orderId}}/close",
          {
            manager: true,
            body: { version: "{{version}}", comment: "Every size delivered" },
          },
        ),
      ],
    },
    {
      name: "4. Alternative terminal actions (new disposable Draft)",
      description:
        "Create a fresh Draft before each alternative. Do not delete/cancel the completed order from folder 3.",
      item: [
        req(
          "Manager cancel Draft or queued Confirmed",
          "POST",
          "/sales-orders/{{orderId}}/cancel",
          {
            manager: true,
            body: { version: "{{version}}", reason: "Buyer withdrew PO" },
          },
        ),
        req("Delete disposable Draft", "DELETE", "/sales-orders/{{orderId}}", {
          status: 204,
          kind: "none",
          header: [{ key: "If-Match", value: '"{{version}}"' }],
        }),
      ],
    },
  ],
};
collection.item[0].item[0].event[0].script.exec.push(
  "if(pm.response.code===200)pm.collectionVariables.set('businessDate',pm.response.json().data.company.businessDate);",
);
collection.item.forEach(fix);
await writeFile(
  new URL(
    "../docs/postman/sales-orders.postman_collection.json",
    import.meta.url,
  ),
  JSON.stringify(collection, null, 2) + "\n",
);
console.log("Sales Orders Postman collection generated");
