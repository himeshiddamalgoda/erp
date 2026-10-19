import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const capture = [
  "if (pm.response.code >= 200 && pm.response.code < 300) { const data=pm.response.json().data; if(data && data.code && data.code.startsWith('TEAM-')) {pm.collectionVariables.set('teamId',data.id);pm.collectionVariables.set('teamVersion',String(data.version));}}",
];
const item = (name, method, path, body, description, headers = []) => ({
  name,
  request: {
    method,
    url: "{{baseUrl}}" + path,
    header: [{ key: "Content-Type", value: "application/json" }, ...headers],
    description,
    ...(body
      ? {
          body: {
            mode: "raw",
            raw: JSON.stringify(body, null, 2).replaceAll(
              '"__VERSION__"',
              "{{teamVersion}}",
            ),
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
          "pm.test('Request completed',()=>pm.expect(pm.response.code).to.be.oneOf([200,201]));",
          ...capture,
        ],
      },
    },
  ],
});
const team = [
  item(
    "1 · List teams",
    "GET",
    "/sales-teams?status=Active&page=1&pageSize=20",
    null,
    "List summaries and live membership counts.",
  ),
  item(
    "2 · Create Export Sales",
    "POST",
    "/sales-teams",
    {
      name: "Export Sales",
      description: "Overseas garment buyers",
      managerId: "{{managerId}}",
      memberIds: [
        "{{managerId}}",
        "{{merchandiserAId}}",
        "{{merchandiserBId}}",
      ],
    },
    "Retain createKey and exact payload on retries; change key only for an intentionally different team.",
    [{ key: "Idempotency-Key", value: "{{createKey}}" }],
  ),
  item(
    "3 · Profile/edit detail",
    "GET",
    "/sales-teams/{{teamId}}?includeInactiveMembers=true",
    null,
    "Captures the current teamVersion. Inspect warnings, blockers and durable rows.",
  ),
  item(
    "4 · Update profile",
    "PATCH",
    "/sales-teams/{{teamId}}",
    {
      version: "__VERSION__",
      description: "Updated export buyer responsibilities",
    },
    "memberIds omitted preserves membership. To remove, supply the COMPLETE final set and a reason; do not send only additions.",
  ),
  item(
    "5 · Archive team",
    "POST",
    "/sales-teams/{{teamId}}/archive",
    { version: "__VERSION__", reason: "Team merged into regional sales" },
    "409 when active customer/open quotation/order assignments remain. Delivered orders also block.",
  ),
  item(
    "6 · Reactivate team",
    "POST",
    "/sales-teams/{{teamId}}/reactivate",
    { version: "__VERSION__", reason: "Export sales operation resumed" },
    "Repair manager/member eligibility via PATCH before retrying a422.",
  ),
];
const dependencies = [
  item(
    "Existing staff directory",
    "GET",
    "/users?status=Active&page=1&pageSize=100",
    null,
    "Separate supporting dependency; returns only ID/display name/role/manager eligibility.",
  ),
  item(
    "Eligible managers",
    "GET",
    "/users?status=Active&managerEligible=true",
    null,
    "Select active SalesManager/Admin; membership does not promote global role.",
  ),
  item(
    "Reassign one customer or open document",
    "POST",
    "/assignments/reassign",
    {
      entityType: "quotation",
      entityId: "{{entityId}}",
      salesTeamId: "{{teamId}}",
      ownerId: "{{merchandiserBId}}",
      version: 1,
      reason: "Reassigned before member removal",
    },
    "Separate supporting route. Supply the ENTITY version, not teamVersion. customer, quotation or salesOrder. Current source+target permission is required.",
  ),
  item(
    "Customer assignments",
    "GET",
    "/customers?salesTeamId={{teamId}}&status=All&page=1&pageSize=20",
    null,
    "Existing customer history/assignments.",
  ),
  item(
    "Quotation assignments",
    "GET",
    "/quotations?salesTeamId={{teamId}}&includeRevisions=true&page=1&pageSize=20",
    null,
    "Existing quotation list; include all revisions.",
  ),
  item(
    "Sales order assignments",
    "GET",
    "/sales-orders?salesTeamId={{teamId}}&page=1&pageSize=20",
    null,
    "Existing order list; terminal history remains linked.",
  ),
];
const collection = {
  info: {
    name: "Garment ERP · Sales Teams",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "Six Team APIs in the first folder; separately identified supporting/dependent APIs in the second. Uses the fixed Admin development server4102. No role headers or fake tokens. Run seed:teams first for Merchandiser B. See sales-teams-verification.md for the blocker/reassignment/removal journey.",
  },
  variable: [
    { key: "baseUrl", value: "http://127.0.0.1:4102/api/v1" },
    { key: "teamId", value: "" },
    { key: "teamVersion", value: "1" },
    { key: "createKey", value: "postman-export-team-v1" },
    { key: "managerId", value: "10000000-0000-4000-8000-000000000002" },
    { key: "merchandiserAId", value: "10000000-0000-4000-8000-000000000001" },
    { key: "merchandiserBId", value: "10000000-0000-4000-8000-000000000005" },
    { key: "entityId", value: "" },
  ],
  item: [
    { name: "Sales Teams · exactly six APIs", item: team },
    {
      name: "Separate supporting dependencies and existing assignment lists",
      item: dependencies,
    },
  ],
};
writeFileSync(
  fileURLToPath(
    new URL(
      "../docs/postman/sales-teams.postman_collection.json",
      import.meta.url,
    ),
  ),
  JSON.stringify(collection, null, 2) + "\n",
);
console.log("Generated Sales Teams Postman collection");
