import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const admin = "http://127.0.0.1:4312/api/v1";
async function wire(page, { lost = false } = {}) {
  const attempts = [];
  let interrupted = false;
  for (const [from, to] of [
    ["http://localhost:4000", "http://127.0.0.1:4310"],
    ["http://localhost:4101", "http://127.0.0.1:4311"],
    ["http://localhost:4102", "http://127.0.0.1:4312"],
  ])
    await page.route(from + "/api/v1/**", async (route) => {
      const req = route.request(),
        url = req.url().replace(from, to),
        create = req.method() === "POST" && url.endsWith("/customers");
      if (create)
        attempts.push({
          key: req.headers()["idempotency-key"],
          body: req.postDataJSON(),
        });
      const response = await route.fetch({ url });
      if (create && lost && !interrupted && response.ok()) {
        interrupted = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message: "Create response lost after commit",
              requestId: "test-timeout",
            },
          }),
        });
      } else await route.fulfill({ response });
    });
  return attempts;
}
async function choose(page, label, name) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function adminWorkspace(page) {
  await choose(page, "Development workspace", "Admin workspace");
}
async function fillCreate(page, name) {
  await page
    .getByRole("textbox", { name: "Legal company name", exact: true })
    .fill(name);
  await choose(page, "Country", "LK");
  await page
    .getByRole("textbox", { name: "Payment terms", exact: true })
    .fill("30% advance; 70% before shipment");
  await page
    .getByRole("textbox", { name: "Contact 1 name", exact: true })
    .fill("Nimal Silva");
  await page
    .getByRole("textbox", { name: "Contact 1 email", exact: true })
    .fill("buyer@example.test");
  for (const [i, line] of [
    [1, "Head Office"],
    [2, "Warehouse A"],
  ]) {
    await page
      .getByRole("textbox", { name: `Address ${i} line 1`, exact: true })
      .fill(line);
    await page
      .getByRole("textbox", { name: `Address ${i} city`, exact: true })
      .fill("Colombo");
  }
}
const sample = (name) => ({
  name,
  country: "LK",
  currency: "USD",
  paymentTerms: "Net 30",
  salesTeamId: "20000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000001",
  contacts: [{ name: "Buyer", email: "buyer@example.test", primary: true }],
  addresses: [
    {
      addressType: "billing",
      line1: "Head Office",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
    {
      addressType: "shipping",
      label: "Warehouse A",
      line1: "Warehouse A",
      city: "Colombo",
      country: "LK",
      isDefault: true,
    },
  ],
});
async function createViaApi(request, name) {
  const r = await request.post(admin + "/customers", {
    headers: { "Idempotency-Key": randomUUID() },
    data: sample(name),
  });
  expect(r.status()).toBe(201);
  return (await r.json()).data;
}
test("Customers: create, edit stable warehouse defaults, quotation shortcut, archive and reactivate", async ({
  page,
}) => {
  await wire(page);
  const name = "UI Buyer " + randomUUID().slice(0, 8);
  await page.goto("/orders/customers");
  await adminWorkspace(page);
  await page.getByRole("link", { name: "New customer", exact: true }).click();
  await fillCreate(page, name);
  await page
    .getByRole("button", { name: "Create customer", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/customers-profile.png",
    fullPage: true,
  });
  const id = page.url().split("/").pop();
  await page.getByRole("link", { name: "Edit customer", exact: true }).click();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Contact 2 name", exact: true })
    .fill("Amali Perera");
  await page
    .getByRole("textbox", { name: "Contact 2 email", exact: true })
    .fill("amali@example.test");
  await page
    .getByRole("radio", { name: "Primary contact 2", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Contact 1 active", exact: true })
    .uncheck();

  await page
    .getByRole("button", { name: "Add shipping address", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Address 3 label", exact: true })
    .fill("Warehouse B");
  await page
    .getByRole("textbox", { name: "Address 3 line 1", exact: true })
    .fill("Warehouse B address");
  await page
    .getByRole("textbox", { name: "Address 3 city", exact: true })
    .fill("Gampaha");
  await page
    .getByRole("radio", { name: "Default address 3", exact: true })
    .check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Create quotation", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Buyer", exact: true }),
  ).toContainText(name);
  await expect(
    page.getByRole("combobox", { name: "Shipping address", exact: true }),
  ).toContainText("Warehouse B address");
  await page.goto("/orders/customers/" + id);
  await adminWorkspace(page);
  await page
    .getByRole("button", { name: "Archive customer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Buyer no longer active");
  await dialog
    .getByRole("button", { name: "Archive customer", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reactivate customer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reactivate customer", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Buyer resumed purchases");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reactivate customer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Archive customer", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Quotations", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No quotations");
  await page.getByRole("tab", { name: "Sales orders", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No sales orders");
});
test("Customers: timeout retry retains original key/body without duplicating buyer", async ({
  page,
}) => {
  const attempts = await wire(page, { lost: true }),
    name = "Retry buyer " + randomUUID().slice(0, 8);
  await page.goto("/orders/customers");
  await adminWorkspace(page);
  await page.getByRole("link", { name: "New customer", exact: true }).click();
  await fillCreate(page, name);
  await page
    .getByRole("button", { name: "Create customer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original create", exact: true }),
  ).toBeVisible();
  await page.reload();
  await adminWorkspace(page);
  await page
    .getByRole("button", { name: "Retry original create", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});
test("Customers: stale version preserves edits and requires explicit reload", async ({
  page,
  request,
}) => {
  await wire(page);
  const c = await createViaApi(
    request,
    "Stale buyer " + randomUUID().slice(0, 8),
  );
  await page.goto("/orders/customers");
  await adminWorkspace(page);
  await page.goto("/orders/customers/" + c.id + "/edit");
  await adminWorkspace(page);
  const name = page.getByRole("textbox", {
    name: "Legal company name",
    exact: true,
  });
  await name.fill("My unsaved customer edit");
  const update = await request.patch(admin + "/customers/" + c.id, {
    data: { version: 1, displayName: "Server updated name" },
  });
  expect(update.status()).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("This customer has changed")).toBeVisible();
  await expect(name).toHaveValue("My unsaved customer edit");
  await page
    .getByRole("button", { name: "Reload and review server data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard edits and reload", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Display name", exact: true }),
  ).toHaveValue("Server updated name");
});
test("Customers: scoped Sales read-only UI, filters and responsive layout", async ({
  page,
  request,
}) => {
  await wire(page);
  const c = await createViaApi(
    request,
    "Read buyer " + randomUUID().slice(0, 8),
  );
  await page.goto("/orders/customers");
  await expect(
    page.getByRole("link", { name: "New customer", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search customers", exact: true })
    .fill(c.code);
  await expect(
    page.getByRole("link", { name: c.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: c.name, exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Edit customer", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: c.name, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/customers-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Customers: open Draft blockers and address-in-use preserve unsaved form rows", async ({
  page,
  request,
}) => {
  await wire(page);
  const c = await createViaApi(
    request,
    "Blocked buyer " + randomUUID().slice(0, 8),
  );
  await page.goto("/orders/customers/" + c.id);
  await adminWorkspace(page);
  await expect(
    page.getByRole("button", { name: "Archive customer", exact: true }),
  ).toBeVisible();
  const options = (
    await (
      await request.get(admin + "/reference-data/quotation-options")
    ).json()
  ).data;
  const created = await request.post(
    "http://127.0.0.1:4310/api/v1/quotations",
    {
      data: {
        customerId: c.id,
        salesTeamId: c.salesTeamId,
        ownerId: c.ownerId,
        currency: c.currency,
        quotationDate: options.company.businessDate,
        billingAddressId: c.addresses.find((a) => a.addressType === "billing")
          .id,
        shippingAddressId: c.addresses.find((a) => a.addressType === "shipping")
          .id,
        paymentTerms: c.paymentTerms,
        lines: [
          {
            styleId: "50000000-0000-4000-8000-000000000001",
            colour: "Navy",
            size: "S",
            qty: 10,
            unitPrice: "5.00",
          },
        ],
      },
    },
  );
  expect(created.status()).toBe(201);
  const q = (await created.json()).data;
  await page
    .getByRole("button", { name: "Archive customer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Archive attempt with an open Draft");
  await dialog
    .getByRole("button", { name: "Archive customer", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: q.quoteNumber, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Reason", exact: true }),
  ).toHaveValue("Archive attempt with an open Draft");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "Edit customer", exact: true }).click();
  await page
    .getByRole("button", { name: "Add shipping address", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Address 3 label", exact: true })
    .fill("Warehouse B");
  await page
    .getByRole("textbox", { name: "Address 3 line 1", exact: true })
    .fill("New warehouse");
  await page
    .getByRole("textbox", { name: "Address 3 city", exact: true })
    .fill("Gampaha");
  await page
    .getByRole("radio", { name: "Default address 3", exact: true })
    .check();
  const index = c.addresses.findIndex((a) => a.addressType === "shipping") + 1;
  await page
    .getByRole("checkbox", { name: `Address ${index} active`, exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("link", { name: q.quoteNumber, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Address 3 line 1", exact: true }),
  ).toHaveValue("New warehouse");
  const removed = await request.delete(
    "http://127.0.0.1:4310/api/v1/quotations/" + q.id,
    { headers: { "If-Match": `"${q.version}"` } },
  );
  expect(removed.status()).toBe(204);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: c.name, exact: true }),
  ).toBeVisible();
});
