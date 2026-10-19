import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import SwaggerParser from "@apidevtools/swagger-parser";
import {
  parse,
  patchSchema,
  createSchema,
} from "../src/modules/customers/customer.schemas.js";
import { customerDemoInput } from "../src/db/seeders/customers-demo.js";
test("Customers OpenAPI validates and exposes exactly six operations", async () => {
  const api = await SwaggerParser.validate("docs/customers.openapi.yaml");
  assert.deepEqual(
    Object.entries(api.paths)
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) =>
            ["get", "post", "patch", "put", "delete"].includes(method),
          )
          .map((method) => method.toUpperCase() + " " + path),
      )
      .sort(),
    [
      "GET /customers",
      "GET /customers/{id}",
      "PATCH /customers/{id}",
      "POST /customers",
      "POST /customers/{id}/archive",
      "POST /customers/{id}/reactivate",
    ].sort(),
  );
  assert.ok(
    api.paths["/customers"].post.parameters.some(
      (p) => p.name === "Idempotency-Key" && p.required,
    ),
  );
  assert.equal(
    api.components.schemas.CustomerCreateInput.additionalProperties,
    false,
  );
  assert.equal(
    api.components.schemas.CustomerPatchInput.additionalProperties,
    false,
  );
  for (const path of Object.values(api.paths))
    for (const operation of Object.values(path)) {
      assert.ok(operation["x-authentication"]);
      assert.ok(operation.responses[401]);
      assert.ok(operation.responses[500]);
    }
});
test("Existing-child PATCH never materializes omitted defaults", () => {
  const id = "60000000-0000-4000-8000-000000000002",
    parsed = parse(patchSchema, {
      version: 1,
      contacts: [{ id, jobTitle: "Buyer" }],
      addresses: [{ id, label: "Warehouse" }],
    });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "addresses",
    "contacts",
    "version",
  ]);
  assert.deepEqual(parsed.contacts, [{ id, jobTitle: "Buyer" }]);
  assert.deepEqual(parsed.addresses, [{ id, label: "Warehouse" }]);
  const create = parse(createSchema, customerDemoInput());
  assert.equal(create.contacts[0].isActive, true);
  assert.equal(create.addresses[2].isDefault, false);
});
test("Customers Postman covers six requests and captures versions/IDs", () => {
  const collection = JSON.parse(
    readFileSync("docs/postman/customers.postman_collection.json", "utf8"),
  );
  assert.equal(collection.item.length, 6);
  assert.equal(
    collection.variable.find((v) => v.key === "baseUrl").value,
    "http://127.0.0.1:4102/api/v1",
  );
  for (const item of collection.item) {
    assert.ok(
      item.event[0].script.exec
        .join("\n")
        .includes("pm.collectionVariables.set('version'"),
    );
    if (item.request.body) {
      const raw = item.request.body.raw
        .replaceAll("{{version}}", "1")
        .replaceAll(/\{\{[^}]+\}\}/g, "placeholder");
      assert.doesNotThrow(() => JSON.parse(raw));
    }
    assert.ok(
      !item.request.header.some((h) => /actor|role|authorization/i.test(h.key)),
    );
  }
});
