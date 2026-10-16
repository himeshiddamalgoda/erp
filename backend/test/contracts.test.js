import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import SwaggerParser from "@apidevtools/swagger-parser";
import { quotationPdf } from "../src/modules/quotations/quotation.pdf.js";
import { PDFParse } from "pdf-parse";
test("OpenAPI validates and describes exactly 15 quotation operations", async () => {
  const api = await SwaggerParser.validate("docs/quotations.openapi.yaml");
  const methods = ["get", "post", "patch", "delete", "put"];
  assert.equal(
    Object.values(api.paths).flatMap((p) =>
      Object.keys(p).filter((k) => methods.includes(k)),
    ).length,
    15,
  );
});
test("development principal is refused during production startup", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {createApp} from "./src/app.js"; createApp();',
    ],
    {
      env: { ...process.env, NODE_ENV: "production", DEV_AUTH_ENABLED: "true" },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Development authentication is forbidden in production/,
  );
});
test("500-line PDF retains first and last quantities and totals across pages", async () => {
  const detail = {
    quoteNumber: "QT-2026-9999",
    revision: 2,
    status: "Superseded",
    quotationDate: "2026-10-16",
    validUntil: "2026-10-31",
    requestedDeliveryDate: "2026-11-30",
    currency: "USD",
    paymentTerms: "30% advance; 70% before shipment",
    customerSnapshot: { name: "Ocean Apparel", country: "US", contacts: [] },
    billingAddressSnapshot: null,
    shippingAddressSnapshot: null,
    totalQty: 500,
    total: "2750.00",
    subtotal: "2750.00",
    notes: "SECRET",
    lines: Array.from({ length: 500 }, (_, i) => ({
      lineNo: i + 1,
      styleCode: `TS-${i + 1}`,
      styleName: "Cotton T-shirt",
      fabric: "100% cotton",
      gsm: 180,
      colour: "Navy",
      size: "S",
      qty: 1,
      uom: "PCS",
      unitPrice: "5.50",
      lineTotal: "5.50",
    })),
  };
  const buffer = await quotationPdf(detail);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    assert.ok(result.total > 1);
    for (const term of ["TS-1", "TS-500", "2750.00", "SUPERSEDED"])
      assert.ok(result.text.includes(term), term);
    assert.ok(!result.text.includes("SECRET"));
  } finally {
    await parser.destroy();
  }
});

test("database conflict responses hide SQL and internal constraint names", async () => {
  const { default: request } = await import("supertest");
  const { createApp } = await import("../src/app.js");
  for (const name of [
    "SequelizeForeignKeyConstraintError",
    "SequelizeUniqueConstraintError",
  ]) {
    const error = Object.assign(new Error("PRIVATE_SQL_AND_CONSTRAINT"), {
      name,
    });
    const app = createApp({
      database: { check: async () => {} },
      quotations: { service: {} },
      principalMiddleware: (_req, _res, next) => next(error),
    });
    const response = await request(app).get("/api/v1/quotations");
    assert.equal(response.status, 409);
    assert.ok(!JSON.stringify(response.body).includes("PRIVATE_SQL"));
    assert.ok(response.body.error.requestId);
  }
});
