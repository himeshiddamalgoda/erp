import { test, expect } from "@playwright/test";
test("one API switches Sales, Manager and Admin, retries failures and restores role on reload", async ({
  page,
}) => {
  const apiRequests = [];
  let failNextSwitch = true;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) apiRequests.push(request.url());
  });
  await page.route("http://localhost:4000/api/v1/**", async (route) => {
    const req = route.request();
    if (
      failNextSwitch &&
      req.method() === "POST" &&
      req.url().endsWith("/dev/session")
    ) {
      failNextSwitch = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "UNAVAILABLE",
            message: "Simulated connection failure",
          },
        }),
      });
      return;
    }
    const response = await route.fetch({
      url: req.url().replace("http://localhost:4000", "http://127.0.0.1:4310"),
    });
    await route.fulfill({ response });
  });
  const choose = async (name) => {
    await page.getByRole("combobox", { name: "Development workspace" }).click();
    await page.getByRole("option", { name, exact: true }).click();
  };
  await page.goto("/orders/sales-teams");
  await expect(
    page.getByRole("banner").getByText("Demo Sales", { exact: true }),
  ).toBeVisible();
  await choose("Manager workspace");
  await expect(page.getByText("Simulated connection failure")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Development workspace" }),
  ).toContainText("Sales workspace");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("banner").getByText("Demo SalesManager", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New team", exact: true }),
  ).toHaveCount(0);
  await choose("Admin workspace");
  await expect(
    page.getByRole("banner").getByText("Demo Admin", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New team", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Development workspace" }),
  ).toContainText("Admin workspace");
  await expect(
    page.getByRole("banner").getByText("Demo Admin", { exact: true }),
  ).toBeVisible();
  await choose("Sales workspace");
  await expect(
    page.getByRole("banner").getByText("Demo Sales", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New team", exact: true }),
  ).toHaveCount(0);
  expect(apiRequests.length).toBeGreaterThan(5);
  expect(apiRequests.every((url) => new URL(url).port === "4000")).toBe(true);
});
