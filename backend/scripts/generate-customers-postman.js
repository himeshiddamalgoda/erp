import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { customerDemoInput } from "../src/db/seeders/customers-demo.js";
const capture = [
  "if (pm.response.code >= 200 && pm.response.code < 300) {",
  " const data=pm.response.json().data;",
  " if (data && data.id) {pm.collectionVariables.set('customerId',data.id);pm.collectionVariables.set('version',String(data.version));}",
  " if (data && data.addresses) for (const a of data.addresses) {if(a.label==='Warehouse A')pm.collectionVariables.set('warehouseAId',a.id);if(a.label==='Warehouse B')pm.collectionVariables.set('warehouseBId',a.id);}",
  "}",
];
const item = (name, method, path, body, description, headers = []) => ({
  name,
  request: {
    method,
    header: [{ key: "Content-Type", value: "application/json" }, ...headers],
    url: "{{baseUrl}}" + path,
    description,
    ...(body
      ? {
          body: {
            mode: "raw",
            raw: JSON.stringify(body, null, 2),
            options: { raw: { language: "json" } },
          },
        }
      : {}),
  },
  event: [
    {
      listen: "test",
      script: {
        type: "text/javascript",
        exec: [
          "pm.test('Successful response',()=>pm.expect(pm.response.code).to.be.oneOf([200,201]));",
          ...capture,
        ],
      },
    },
  ],
});
const example = customerDemoInput();
example.salesTeamId = "{{salesTeamId}}";
example.ownerId = "{{ownerId}}";
const swap = {
  version: "__VERSION__",
  addresses: [
    { id: "{{warehouseAId}}", isDefault: false },
    { id: "{{warehouseBId}}", isDefault: true },
  ],
};
const lifecycle = (reason) => ({ version: "__VERSION__", reason });
const items = [
  item(
    "1 · List Active customers",
    "GET",
    "/customers?status=Active&page=1&pageSize=20",
    null,
    "Orders > Customers. Sales/manager/viewer can read within team scope.",
  ),
  item(
    "2 · Create buyer (Save)",
    "POST",
    "/customers",
    example,
    "Use a fixed idempotencyKey for retries. Generate a NEW key only when intentionally creating another buyer. Saves returned customerId/version/warehouse IDs.",
    [{ key: "Idempotency-Key", value: "{{idempotencyKey}}" }],
  ),
  item(
    "3 · Profile/edit detail",
    "GET",
    "/customers/{{customerId}}?includeInactiveChildren=true",
    null,
    "Refreshes current version. This GET is safe for archived buyers.",
  ),
  item(
    "4 · Switch default warehouse atomically",
    "PATCH",
    "/customers/{{customerId}}",
    swap,
    "Explicit old false/new true in one request. IDs and omitted rows preserved.",
  ),
  item(
    "5 · Archive with reason",
    "POST",
    "/customers/{{customerId}}/archive",
    lifecycle("Buyer account no longer used"),
    "409 CUSTOMER_HAS_OPEN_DOCUMENTS when open quotations or Draft orders exist; show authorized blockers and preserve input.",
  ),
  item(
    "6 · Reactivate with reason",
    "POST",
    "/customers/{{customerId}}/reactivate",
    lifecycle("Buyer resumed purchases"),
    "Revalidates current master/ownership. Repair via PATCH first if 422.",
  ),
];
for (const entry of items)
  if (entry.request.body)
    entry.request.body.raw = entry.request.body.raw.replace(
      '"__VERSION__"',
      "{{version}}",
    );
const collection = {
  info: {
    name: "Garment ERP · Customers (6 APIs)",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "Run in order against an Admin development server. No tokens or role headers. Default main4000 Sales server is read-only for Customers; use a separately configured Admin server4102. Preserve the idempotency key when retrying. GET /api/v1 alone has no route.",
  },
  variable: [
    { key: "baseUrl", value: "http://127.0.0.1:4102/api/v1" },
    { key: "customerId", value: "" },
    { key: "version", value: "1" },
    { key: "idempotencyKey", value: "customers-postman-create-v1" },
    { key: "salesTeamId", value: "20000000-0000-4000-8000-000000000001" },
    { key: "ownerId", value: "10000000-0000-4000-8000-000000000001" },
    { key: "warehouseAId", value: "" },
    { key: "warehouseBId", value: "" },
  ],
  item: items,
};
writeFileSync(
  fileURLToPath(
    new URL(
      "../docs/postman/customers.postman_collection.json",
      import.meta.url,
    ),
  ),
  JSON.stringify(collection, null, 2) + "\n",
);
console.log("Generated Customers Postman collection: 6 requests");
