import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { ids } from "../fixtures";
const sales = "http://127.0.0.1:4310/api/v1",
  manager = "http://127.0.0.1:4311/api/v1";
const future = (date, days) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
async function wire(page, { lostCreate = false } = {}) {
  const attempts = [];
  let lost = false;
  for (const [from, to] of [
    ["http://localhost:4000", "http://127.0.0.1:4310"],
    ["http://localhost:4101", "http://127.0.0.1:4311"],
  ])
    await page.route(from + "/api/v1/**", async (route) => {
      const r = route.request(),
        url = r.url().replace(from, to),
        create = r.method() === "POST" && url.endsWith("/sales-orders");
      if (create)
        attempts.push({
          key: r.headers()["idempotency-key"],
          body: r.postDataJSON(),
        });
      const response = await route.fetch({ url });
      if (create && lostCreate && !lost && response.ok()) {
        lost = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message: "Response interrupted after the order committed.",
              requestId: "test-lost-create",
            },
          }),
        });
      } else await route.fulfill({ response });
    });
  return attempts;
}
async function choose(page, label, option) {
  await page
    .getByRole("combobox", { name: label, exact: typeof label === "string" })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function workspace(page, name) {
  await choose(
    page,
    "Development workspace",
    name === "manager" ? "Manager workspace" : "Sales workspace",
  );
}
async function confirm(page, action, fields = {}) {
  const d = page.getByRole("dialog");
  for (const [name, value] of Object.entries(fields))
    await d.getByRole("textbox", { name, exact: true }).fill(value);
  await d.getByRole("button", { name: action, exact: true }).click();
  await expect(d).not.toBeVisible();
}
async function menu(page, action) {
  await page.getByRole("button", { name: "More order actions" }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
async function input(request) {
  const refs = (
    await (
      await request.get(sales + "/reference-data/quotation-options")
    ).json()
  ).data;
  const date = refs.company.businessDate;
  return {
    customerId: ids.customer,
    salesTeamId: ids.team,
    ownerId: ids.owner,
    currency: "USD",
    orderDate: date,
    buyerPoNumber: "UI-" + crypto.randomUUID(),
    buyerPoDate: date,
    requestedDeliveryDate: future(date, 45),
    billingAddressId: ids.billing,
    shippingAddressId: ids.shipping,
    paymentTerms: "30% advance; 70% before shipment",
    publicNotes: "Original public note",
    internalNotes: "Internal UI fixture",
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
}
async function create(request) {
  const response = await request.post(sales + "/sales-orders", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: await input(request),
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
async function order(request, id) {
  return (await (await request.get(sales + "/sales-orders/" + id)).json()).data;
}
async function saveScreen(page) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
}
test("six-line direct order, lost creation response recovered after reload, manager hold/amend/resume and historical PDF", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const attempts = await wire(page, { lostCreate: true });
  await page.goto("/orders/sales-orders");
  await page
    .getByRole("link", { name: "New direct order", exact: true })
    .first()
    .click();
  await choose(page, "Buyer", "Ocean Apparel · OCEAN");
  const date = await page
    .getByLabel("Order date", { exact: true })
    .inputValue();
  await page
    .getByLabel("Buyer PO number", { exact: true })
    .fill("UI-FORM-" + crypto.randomUUID());
  await page.getByLabel("Buyer PO date", { exact: true }).fill(date);
  await page
    .getByLabel("Requested delivery", { exact: true })
    .fill(future(date, 45));
  await page
    .getByLabel("Buyer-visible notes", { exact: true })
    .fill("Original public packing");
  let i = 0;
  for (const colour of ["Navy", "White"])
    for (const size of ["S", "M", "L"]) {
      if (i)
        await page
          .getByRole("button", { name: "Add line", exact: true })
          .click();
      await choose(page, `Style, line ${i + 1}`, "TS-100 · Cotton T-shirt");
      await choose(page, `Colour, line ${i + 1}`, colour);
      await choose(page, `Size, line ${i + 1}`, size);
      await page
        .getByLabel(`Quantity, line ${i + 1}`, { exact: true })
        .fill(size === "L" ? "100" : "200");
      await page
        .getByLabel(`Unit price, line ${i + 1}`, { exact: true })
        .fill("5.50");
      i++;
    }
  await expect(
    page.getByText("USD 5,500.00", { exact: true }).last(),
  ).toBeVisible();
  await saveScreen(page);
  await page.screenshot({
    path: "test-results/sales-order-form-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Response interrupted after the order committed."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry original request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .click();
  await page.waitForURL(/\/sales-orders\/[0-9a-f-]+$/);
  const id = page.url().split("/").at(-1);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect((await order(request, id)).lines).toHaveLength(6);
  await expect(
    page.getByRole("button", { name: "Confirm order", exact: true }),
  ).not.toBeVisible();
  await workspace(page, "manager");
  await page
    .getByRole("button", { name: "Confirm order", exact: true })
    .click();
  await confirm(page, "Confirm order", { "Review comment": "PO checked" });
  await expect(
    page.getByText("Confirmed", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hold handoff", exact: true }).click();
  await confirm(page, "Hold handoff", { Reason: "Buyer review" });
  await expect(
    page.getByText("Local handoff on hold:", { exact: false }),
  ).toBeVisible();
  await menu(page, "Amend order");
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Requested delivery", { exact: true })
    .fill(future(date, 60));
  await dialog
    .getByRole("textbox", { name: "Buyer-visible notes", exact: true })
    .fill("Revised warehouse packing");
  await confirm(page, "Amend order", {
    Reason: "Updated instructions",
    "Buyer reference": "Buyer email",
  });
  await expect(
    page.getByText("Document R2", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume handoff", exact: true })
    .click();
  await confirm(page, "Resume handoff", { Reason: "Buyer confirmed" });
  await page.getByRole("tab", { name: "Revisions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Document revision 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View snapshot", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Original public packing", { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download R1", exact: true }).click();
  const pdf = await downloadEvent;
  expect((await readFile(await pdf.path())).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Operational amendment", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await saveScreen(page);
  await page.screenshot({
    path: "test-results/sales-order-detail-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await menu(page, "Cancel order");
  await confirm(page, "Cancel order", { Reason: "Disposable UI test" });
  await expect(
    page.getByText("Cancelled", { exact: true }).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders/sales-orders");
  await expect(
    page.getByRole("table", { name: "Sales orders", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Sales orders", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "test-results/sales-orders-list-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("stale Draft preserves edits, explicit reload, cross-feature dirty navigation and conditional delete", async ({
  page,
  request,
}) => {
  await wire(page);
  const o = await create(request);
  await page.goto(`/orders/sales-orders/${o.id}/edit`);
  const notes = page.getByRole("textbox", {
    name: "Internal notes",
    exact: true,
  });
  await notes.fill("Unsaved UI note");
  await page
    .getByRole("link", { name: "Quotations", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(notes).toHaveValue("Unsaved UI note");
  expect(
    (
      await request.patch(sales + "/sales-orders/" + o.id, {
        data: { version: o.version, internalNotes: "Changed elsewhere" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("This sales order has changed")).toBeVisible();
  await expect(notes).toHaveValue("Unsaved UI note");
  await page
    .getByRole("button", { name: "Reload latest version", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reload latest", exact: true })
    .click();
  await expect(notes).toHaveValue("Changed elsewhere");
  await notes.fill("Reviewed edit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForURL(`/orders/sales-orders/${o.id}`);
  await menu(page, "Delete draft");
  await confirm(page, "Delete draft");
  await page.waitForURL("/orders/sales-orders");
  expect((await request.get(sales + "/sales-orders/" + o.id)).status()).toBe(
    404,
  );
});
test("delivery tab shows real per-line fixture progress then manager closes complete order", async ({
  page,
  request,
}) => {
  await wire(page);
  const o = await create(request);
  await page.goto(`/orders/sales-orders/${o.id}`);
  await workspace(page, "manager");
  await page
    .getByRole("button", { name: "Confirm order", exact: true })
    .click();
  await confirm(page, "Confirm order");
  await page.getByRole("tab", { name: "Delivery", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Delivery by garment line" }),
  ).toBeVisible();
  await expect(page.getByText("Demo feed.", { exact: false })).toBeVisible();
  const fixture = (stage) =>
    execFileSync(
      process.execPath,
      ["scripts/sales-order-fulfilment-demo.js", o.id, stage],
      {
        cwd: resolve(process.cwd(), "../backend"),
        env: {
          ...process.env,
          DB_NAME: process.env.TEST_DB_NAME,
          NODE_ENV: "development",
        },
        encoding: "utf8",
      },
    );
  fixture("partial");
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await expect(
    page.getByText("Partially delivered", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close order", exact: true }),
  ).not.toBeVisible();
  fixture("complete");
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await expect(
    page.getByText("Delivered", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close order", exact: true }).click();
  await confirm(page, "Close order", {
    "Review comment": "Every line complete",
  });
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
  await saveScreen(page);
  await page.screenshot({
    path: "test-results/sales-order-delivery-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("converted Draft freezes commercial controls and links both quotation and order workspaces", async ({
  page,
  request,
}) => {
  await wire(page);
  const source = await input(request);
  const {
    orderDate,
    buyerPoNumber: _po,
    buyerPoDate: _pd,
    publicNotes: _pub,
    internalNotes: _int,
    ...common
  } = source;
  let q = (
    await (
      await request.post(sales + "/quotations", {
        data: {
          ...common,
          quotationDate: orderDate,
          validUntil: future(orderDate, 15),
        },
      })
    ).json()
  ).data;
  for (const [base, action, extra] of [
    [sales, "submit", {}],
    [manager, "approve", {}],
    [sales, "issue", { channel: "manual" }],
    [sales, "buyer-response", { decision: "Accepted", reference: "UI email" }],
  ]) {
    const r = await request.post(`${base}/quotations/${q.id}/${action}`, {
      data: { version: q.version, ...extra },
    });
    expect(r.status()).toBe(200);
    q = (await r.json()).data;
  }
  const converted = await request.post(`${sales}/quotations/${q.id}/convert`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { version: q.version },
  });
  expect(converted.status()).toBe(201);
  const id = (await converted.json()).data.id;
  await page.goto(`/orders/quotations/${q.id}`);
  await page.getByRole("link", { name: /SO-2026-/ }).click();
  await page.waitForURL(`/orders/sales-orders/${id}`);
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Currency", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add line", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Buyer PO number", exact: true })
    .fill("CONVERT-UI-" + crypto.randomUUID());
  let patch;
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/sales-orders/"))
      patch = r.postDataJSON();
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForURL(`/orders/sales-orders/${id}`);
  expect(patch).not.toHaveProperty("lines");
  expect(patch).not.toHaveProperty("customerId");
  expect(patch).not.toHaveProperty("currency");
  expect(patch).not.toHaveProperty("shippingAddressId");
  expect(patch).not.toHaveProperty("internalNotes");
  await workspace(page, "manager");
  await page
    .getByRole("button", { name: "Confirm order", exact: true })
    .click();
  await confirm(page, "Confirm order");
  await expect(
    page.getByText("Confirmed", { exact: true }).first(),
  ).toBeVisible();
  expect((await order(request, id)).sourceQuotationId).toBe(q.id);
});
