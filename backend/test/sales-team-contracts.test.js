import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import SwaggerParser from "@apidevtools/swagger-parser";
import {
  parse,
  patchSchema,
} from "../src/modules/sales-teams/sales-team.schemas.js";
test("Sales Teams OpenAPI validates and contains exactly six operations; dependencies separate", async () => {
  const api = await SwaggerParser.validate("docs/sales-teams.openapi.yaml");
  const operations = Object.entries(api.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((k) => ["get", "post", "patch", "put", "delete"].includes(k))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
  assert.deepEqual(
    operations.sort(),
    [
      "GET /sales-teams",
      "GET /sales-teams/{id}",
      "POST /sales-teams",
      "PATCH /sales-teams/{id}",
      "POST /sales-teams/{id}/archive",
      "POST /sales-teams/{id}/reactivate",
    ].sort(),
  );
  assert.ok(
    api.paths["/sales-teams"].post.parameters.find(
      (p) => p.name === "Idempotency-Key" && p.required,
    ),
  );
  assert.equal(
    api.components.schemas.TeamCreateInput.additionalProperties,
    false,
  );
  assert.equal(
    api.components.schemas.TeamCreateInput.properties.memberIds.uniqueItems,
    true,
  );
  const dependencies = await SwaggerParser.validate(
    "docs/team-supporting-apis.openapi.yaml",
  );
  assert.deepEqual(Object.keys(dependencies.paths).sort(), [
    "/assignments/reassign",
    "/users",
  ]);
  assert.ok(
    dependencies.components.schemas.ReassignmentResult.properties.data.oneOf
      .length === 3,
  );
});
test("Team PATCH distinguishes membership omission from a full desired active set", () => {
  assert.deepEqual(parse(patchSchema, { version: 1, name: "Updated" }), {
    version: 1,
    name: "Updated",
  });
  assert.throws(() => parse(patchSchema, { version: 1, memberIds: [] }));
  assert.throws(() => parse(patchSchema, { version: 1, isActive: false }));
});
test("Postman separates exactly six Team requests and captures current IDs/versions", () => {
  const c = JSON.parse(
    readFileSync("docs/postman/sales-teams.postman_collection.json"),
  );
  assert.equal(c.item[0].item.length, 6);
  assert.equal(
    c.item[1].item.find((i) => i.request.url.endsWith("/assignments/reassign"))
      .request.method,
    "POST",
  );
  for (const i of c.item[0].item) {
    assert.ok(i.event[0].script.exec.join("\n").includes("set('teamVersion'"));
    if (i.request.body)
      assert.doesNotThrow(() =>
        JSON.parse(i.request.body.raw.replaceAll("{{teamVersion}}", "1")),
      );
    assert.ok(
      !i.request.header.some((h) => /actor|role|authorization/i.test(h.key)),
    );
  }
});
