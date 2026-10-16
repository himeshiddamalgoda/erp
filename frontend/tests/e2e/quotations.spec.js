import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ids } from "../fixtures";
const sales = "http://127.0.0.1:4310/api/v1";
const manager = "http://127.0.0.1:4311/api/v1";
const future = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
async function wire(page, { loseFirstConversion = false } = {}) {
  const attempts = [];
  let lost = false;
  // Re-route to real isolated MySQL-backed APIs; no API responses are mocked.
  for (const [from, to] of [
    ["http://localhost:4000", "http://127.0.0.1:4310"],
    ["http://localhost:4101", "http://127.0.0.1:4311"],
  ])
    await page.route(`${from}/api/v1/**`, async (route) => {
      const url = route.request().url().replace(from, to);
      const convert = url.endsWith("/convert");
      if (convert)
        attempts.push({
          body: route.request().postDataJSON(),
          key: route.request().headers()["idempotency-key"],
        });
      const response = await route.fetch({ url });
      if (convert && loseFirstConversion && !lost && response.ok()) {
        lost = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message:
                "The connection was interrupted after the order committed.",
              requestId: "test-lost-response",
            },
          }),
        });
      } else await route.fulfill({ response });
    });
  return attempts;
}
async function choose(page, name, option) {
  await page
    .getByRole("combobox", { name, exact: typeof name === "string" })
    .click();
  await page
    .getByRole("option", { name: option, exact: typeof option === "string" })
    .click();
}
async function switchWorkspace(page, workspace) {
  await choose(
    page,
    "Development workspace",
    workspace === "manager" ? "Manager workspace" : "Sales workspace",
  );
}
async function confirm(page, name, fields = {}) {
  const dialog = page.getByRole("dialog");
  for (const [label, value] of Object.entries(fields))
    await dialog.getByRole("textbox", { name: label, exact: true }).fill(value);
  await dialog.getByRole("button", { name, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function menuAction(page, name) {
  await page.getByRole("button", { name: "More quotation actions" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function prepare(request, status = "Draft") {
  const refs = (
    await (
      await request.get(`${sales}/reference-data/quotation-options`)
    ).json()
  ).data;
  const date = refs.company.businessDate;
  const body = {
    customerId: ids.customer,
    salesTeamId: ids.team,
    ownerId: ids.owner,
    currency: "USD",
    quotationDate: date,
    validUntil: future(date, 15),
    requestedDeliveryDate: future(date, 45),
    billingAddressId: ids.billing,
    shippingAddressId: ids.shipping,
    paymentTerms: "30% advance; 70% before shipment",
    notes: "E2E fixture",
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
  let response = await request.post(`${sales}/quotations`, { data: body });
  expect(response.status()).toBe(201);
  let q = (await response.json()).data;
  if (status === "Draft") return q;
  for (const [action, base, extra] of [
    ["submit", sales, {}],
    ["approve", manager, {}],
    ["issue", sales, { channel: "manual" }],
  ]) {
    response = await request.post(`${base}/quotations/${q.id}/${action}`, {
      data: { version: q.version, ...extra },
    });
    expect(response.status()).toBe(200);
    q = (await response.json()).data;
    if (q.status === status) break;
  }
  return q;
}

test("create six garment lines, approve as manager, issue, PDF, accept and safely retry conversion", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const attempts = await wire(page, { loseFirstConversion: true });
  await page.goto("/orders/quotations");
  await expect(
    page.getByRole("heading", { name: "Quotations", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "New quotation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New quotation", exact: true }),
  ).toBeVisible();
  await choose(page, /^Buyer/, "Ocean Apparel · OCEAN");
  const date = await page
    .getByLabel("Quotation date", { exact: true })
    .inputValue();
  await page.getByLabel("Valid until", { exact: true }).fill(future(date, 15));
  await page
    .getByLabel("Requested delivery", { exact: true })
    .fill(future(date, 45));
  const variants = ["Navy", "White"].flatMap((colour) =>
    ["S", "M", "L"].map((size) => ({
      colour,
      size,
      qty: size === "L" ? "100" : "200",
    })),
  );
  for (const [i, variant] of variants.entries()) {
    if (i)
      await page.getByRole("button", { name: "Add line", exact: true }).click();
    await choose(page, `Style, line ${i + 1}`, "TS-100 · Cotton T-shirt");
    await choose(page, `Colour, line ${i + 1}`, variant.colour);
    await choose(page, `Size, line ${i + 1}`, variant.size);
    await page
      .getByLabel(`Quantity, line ${i + 1}`, { exact: true })
      .fill(variant.qty);
    await page
      .getByLabel(`Unit price, line ${i + 1}`, { exact: true })
      .fill("5.50");
  }
  await expect(
    page.getByText("USD 5,500.00", { exact: true }).last(),
  ).toBeVisible();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/quotation-form-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save & submit", exact: true })
    .click();
  await page.waitForURL(/\/orders\/quotations\/[0-9a-f-]+$/);
  const id = page.url().split("/").at(-1);
  await expect(
    page.getByText("Pending approval", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve quotation", exact: true }),
  ).not.toBeVisible();
  await switchWorkspace(page, "manager");
  await page
    .getByRole("button", { name: "Approve quotation", exact: true })
    .click();
  await confirm(page, "Approve quotation", {
    "Review comment": "Pricing reviewed in browser",
  });
  await expect(
    page.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();
  await switchWorkspace(page, "sales");
  await page
    .getByRole("button", { name: "Issue quotation", exact: true })
    .click();
  await confirm(page, "Issue quotation");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/QT-.*\.pdf$/);
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  await page
    .getByRole("button", { name: "Record buyer response", exact: true })
    .click();
  await confirm(page, "Record acceptance", {
    "Buyer response reference": "Buyer email confirmed in browser",
  });
  await page
    .getByRole("button", { name: "Convert to sales order", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create Draft order", exact: true })
    .click();
  await expect(dialog.getByText(/connection was interrupted/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create Draft order", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Converted", { exact: true }).first(),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const result = (await (await request.get(`${sales}/quotations/${id}`)).json())
    .data;
  expect(result.total).toBe("5500.00");
  expect(result.lines).toHaveLength(6);
  expect(result.linkedOrder.status).toBe("Draft");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: "disabled",
    path: "test-results/quotation-converted-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(
    page.getByRole("heading", { name: "Converted to Draft order" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders/quotations");
  await expect(
    page.getByRole("heading", { name: "Quotations", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("table", { name: "Quotations", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    animations: "disabled",
    path: "test-results/quotation-list-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("edit with a stale version preserves input, reloads explicitly, and soft deletes a Draft", async ({
  page,
  request,
}) => {
  await wire(page);
  let q = await prepare(request);
  await page.goto(`/orders/quotations/${q.id}/edit`);
  const notes = page.getByRole("textbox", {
    name: "Internal notes",
    exact: true,
  });
  await notes.fill("Unsaved browser edit");
  const changed = await request.patch(`${sales}/quotations/${q.id}`, {
    data: { version: q.version, notes: "Changed in another session" },
  });
  expect(changed.status()).toBe(200);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("This quotation has changed")).toBeVisible();
  await expect(notes).toHaveValue("Unsaved browser edit");
  await page
    .getByRole("button", { name: "Reload latest version", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reload latest", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Internal notes", exact: true }),
  ).toHaveValue("Changed in another session");
  await page
    .getByRole("textbox", { name: "Internal notes", exact: true })
    .fill("Saved after explicit reload");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForURL(`/orders/quotations/${q.id}`);
  await menuAction(page, "Delete draft");
  await confirm(page, "Delete draft");
  await page.waitForURL("/orders/quotations");
  expect((await request.get(`${sales}/quotations/${q.id}`)).status()).toBe(404);
});

test("replacement revision supersedes old offer, records decline, then voids an approved successor", async ({
  page,
  request,
}) => {
  await wire(page);
  const original = await prepare(request, "Issued");
  await page.goto(`/orders/quotations/${original.id}`);
  await menuAction(page, "Create revision");
  await confirm(page, "Create new Draft", {
    Reason: "Buyer requested updated quantity",
  });
  await page.waitForURL(/\/edit$/);
  const replacement = page.url().split("/").at(-2);
  expect(replacement).not.toBe(original.id);
  expect(
    (await (await request.get(`${sales}/quotations/${original.id}`)).json())
      .data.status,
  ).toBe("Issued");
  await page
    .getByRole("button", { name: "Save & submit", exact: true })
    .click();
  await page.waitForURL(`/orders/quotations/${replacement}`);
  await switchWorkspace(page, "manager");
  await page
    .getByRole("button", { name: "Approve quotation", exact: true })
    .click();
  await confirm(page, "Approve quotation");
  await switchWorkspace(page, "sales");
  await page
    .getByRole("button", { name: "Issue quotation", exact: true })
    .click();
  await confirm(page, "Issue quotation");
  expect(
    (await (await request.get(`${sales}/quotations/${original.id}`)).json())
      .data.status,
  ).toBe("Superseded");
  await page
    .getByRole("button", { name: "Record buyer response", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("radio", { name: /Declined/ })
    .click();
  await confirm(page, "Record decline", {
    "Buyer response reference": "Buyer email",
    "Reason for declining": "Delivery too late",
  });
  await menuAction(page, "Create revision");
  await confirm(page, "Create new Draft", { Reason: "Revised delivery offer" });
  await page.waitForURL(/\/edit$/);
  await page
    .getByRole("button", { name: "Save & submit", exact: true })
    .click();
  await page.waitForURL(/\/quotations\/[0-9a-f-]+$/);
  await switchWorkspace(page, "manager");
  await page
    .getByRole("button", { name: "Approve quotation", exact: true })
    .click();
  await confirm(page, "Approve quotation");
  await menuAction(page, "Void quotation");
  await confirm(page, "Void quotation", { Reason: "Offer withdrawn" });
  await expect(
    page.getByText("Cancelled", { exact: true }).first(),
  ).toBeVisible();
});

test("withdrawal and manager rejection return to an editable Draft", async ({
  page,
  request,
}) => {
  await wire(page);
  const q = await prepare(request, "PendingApproval");
  await page.goto(`/orders/quotations/${q.id}`);
  await menuAction(page, "Withdraw submission");
  await confirm(page, "Withdraw submission", {
    Reason: "Buyer changed quantities",
  });
  await expect(
    page.getByRole("link", { name: "Edit draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await confirm(page, "Submit for approval");
  await switchWorkspace(page, "manager");
  await menuAction(page, "Reject submission");
  await confirm(page, "Reject submission", { Reason: "Please review prices" });
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
});
