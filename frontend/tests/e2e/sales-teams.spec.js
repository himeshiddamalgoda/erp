import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const admin = "http://127.0.0.1:4312/api/v1",
  manager = "10000000-0000-4000-8000-000000000002",
  sales = "10000000-0000-4000-8000-000000000001";
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
        create = req.method() === "POST" && url.endsWith("/sales-teams");
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
              message: "Lost response after commit",
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
async function workspace(page) {
  await choose(page, "Development workspace", "Admin workspace");
}
async function create(request, name, members = [manager, sales]) {
  const response = await request.post(admin + "/sales-teams", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { name, managerId: manager, memberIds: members },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
async function fill(page, name) {
  await page
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill(name);
  await choose(page, "Team manager", "Demo SalesManager");
  await choose(page, "Active team members", "Demo Sales");
  await page.keyboard.press("Escape");
}
test("Teams: create, remove with reason/history, archive and reactivate", async ({
  page,
}) => {
  await wire(page);
  const name = "UI Team " + randomUUID().slice(0, 8);
  await page.goto("/orders/sales-teams");
  await workspace(page);
  await page.getByRole("link", { name: "New team", exact: true }).click();
  await fill(page, name);
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/sales-teams-profile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Edit team", exact: true }).click();
  await choose(page, "Active team members", "Demo Sales");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Change reason", exact: true })
    .fill("Merchandiser moved to another team");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Demo Sales");
  await page
    .getByRole("button", { name: "Confirm removals and save", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show membership history" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Demo Sales" })
      .filter({ hasText: "Removed" }),
  ).toBeVisible();
  for (const action of ["Archive team", "Reactivate team"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill("Lifecycle testing");
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});
test("Teams: timeout retry keeps original key and body across reload", async ({
  page,
}) => {
  const attempts = await wire(page, { lost: true }),
    name = "Retry team " + randomUUID().slice(0, 8);
  await page.goto("/orders/sales-teams");
  await workspace(page);
  await page.getByRole("link", { name: "New team", exact: true }).click();
  await fill(page, name);
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry original create" }),
  ).toBeVisible();
  await page.reload();
  await workspace(page);
  await page.getByRole("button", { name: "Retry original create" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});
test("Teams: stale update retains edits until explicit reload", async ({
  page,
  request,
}) => {
  await wire(page);
  const team = await create(request, "Stale team " + randomUUID().slice(0, 8));
  await page.goto(`/orders/sales-teams/${team.id}/edit`);
  await workspace(page);
  const field = page.getByRole("textbox", { name: "Team name", exact: true });
  await field.fill("My unsaved team edit");
  const updated = await request.patch(admin + "/sales-teams/" + team.id, {
    data: { version: 1, description: "Latest server description" },
  });
  expect(updated.status()).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("This sales team has changed")).toBeVisible();
  await expect(field).toHaveValue("My unsaved team edit");
  await page
    .getByRole("button", { name: "Reload and review server data" })
    .click();
  await page.getByRole("button", { name: "Discard edits and reload" }).click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Latest server description");
});
test("Teams: blocked member removal, transfer customer, retry complete set", async ({
  page,
  request,
}) => {
  await wire(page);
  const source = await create(
      request,
      "Source team " + randomUUID().slice(0, 8),
    ),
    target = await create(request, "Target team " + randomUUID().slice(0, 8));
  const response = await request.post(admin + "/customers", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      name: "Transfer buyer " + randomUUID().slice(0, 8),
      country: "LK",
      currency: "USD",
      paymentTerms: "Net 30",
      salesTeamId: source.id,
      ownerId: sales,
      contacts: [{ name: "Buyer", email: "buyer@example.test", primary: true }],
      addresses: [
        {
          addressType: "billing",
          line1: "Office",
          city: "Colombo",
          country: "LK",
          isDefault: true,
        },
        {
          addressType: "shipping",
          line1: "Warehouse",
          city: "Colombo",
          country: "LK",
          isDefault: true,
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const buyer = (await response.json()).data;
  await page.goto(`/orders/sales-teams/${source.id}/edit`);
  await workspace(page);
  await choose(page, "Active team members", "Demo Sales");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Change reason", exact: true })
    .fill("Move responsibility first");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm removals and save", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: buyer.code, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Change reason", exact: true }),
  ).toHaveValue("Move responsibility first");
  // Cancel through the explicit discard guard, then resolve on the profile.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Leave form", exact: true }).click();
  await page.getByRole("tab", { name: "Customers", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: buyer.name })
    .getByRole("button", { name: "Reassign" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Target sales team" })
    .fill(target.code);
  await page
    .getByRole("option", {
      name: `${target.code} · ${target.name}`,
      exact: true,
    })
    .click();
  await choose(page, "Target owner", "Demo SalesManager");
  await dialog
    .getByRole("textbox", { name: "Transfer reason" })
    .fill("Clear member assignments");
  await dialog.getByRole("button", { name: "Transfer assignment" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: buyer.name, exact: true }),
  ).toHaveCount(0);
  const current = (
    await (await request.get(admin + "/customers/" + buyer.id)).json()
  ).data;
  expect(current.salesTeamId).toBe(target.id);
  expect(current.version).toBe(buyer.version + 1);
  await page.getByRole("link", { name: "Edit team", exact: true }).click();
  await choose(page, "Active team members", "Demo Sales");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Change reason", exact: true })
    .fill("Assignments transferred");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm removals and save", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: source.name, exact: true }),
  ).toBeVisible();
});
test("Teams: scoped read-only list, filters and mobile layout", async ({
  page,
}) => {
  await wire(page);
  await page.goto("/orders/sales-teams");
  await expect(
    page.getByRole("link", { name: "New team", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search teams" }).fill("Apparel");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "Apparel Sales", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Edit team", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Apparel Sales", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sales-teams-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
