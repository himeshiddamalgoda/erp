import { it, expect, vi, beforeEach } from "vitest";
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/axios", () => ({ getHttpClient: () => client }));
import * as service from "@/features/sales-orders/services/sales-order.service";
import { orderKeys } from "@/features/sales-orders/hooks/use-sales-orders";
beforeEach(() => {
  for (const fn of Object.values(client))
    fn.mockReset().mockResolvedValue({ data: { data: { id: "order" } } });
});
it("binds resource operations, conditional deletion, history, fulfilment and versioned PDF", async () => {
  const signal = new AbortController().signal;
  await service.listSalesOrders("api", { source: "quotation" }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders", {
    params: { source: "quotation" },
    signal,
  });
  await service.getSalesOrder("api", "id", signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders/id", { signal });
  await service.createSalesOrder("api", {
    body: { currency: "USD" },
    idempotencyKey: "key",
  });
  expect(client.post).toHaveBeenLastCalledWith(
    "/sales-orders",
    { currency: "USD" },
    { headers: { "Idempotency-Key": "key" } },
  );
  await service.updateSalesOrder("api", { id: "id", body: { version: 4 } });
  expect(client.patch).toHaveBeenLastCalledWith("/sales-orders/id", {
    version: 4,
  });
  await service.deleteSalesOrder("api", { id: "id", version: 4 });
  expect(client.delete).toHaveBeenLastCalledWith("/sales-orders/id", {
    headers: { "If-Match": '"4"' },
  });
  await service.getOrderRevisions("api", "id", { page: 2 }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders/id/revisions", {
    params: { page: 2 },
    signal,
  });
  await service.getOrderActivity("api", "id", { action: "hold" }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders/id/activity", {
    params: { action: "hold" },
    signal,
  });
  await service.getOrderFulfilment("api", "id", signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders/id/fulfilment", {
    signal,
  });
  await service.getOrderPdf("api", { id: "id", revision: 1 });
  expect(client.get).toHaveBeenLastCalledWith("/sales-orders/id/pdf", {
    responseType: "blob",
    params: { revision: 1 },
  });
});
it.each(["confirm", "cancel", "close", "hold", "resume", "revisions"])(
  "sends %s to the correct action endpoint with idempotency only where required",
  async (action) => {
    await service.salesOrderAction("api", {
      id: "id",
      action,
      body: { version: 3 },
      ...(["confirm", "revisions"].includes(action)
        ? { idempotencyKey: "original-key" }
        : {}),
    });
    expect(client.post).toHaveBeenLastCalledWith(
      `/sales-orders/id/${action}`,
      { version: 3 },
      {
        headers: ["confirm", "revisions"].includes(action)
          ? { "Idempotency-Key": "original-key" }
          : undefined,
      },
    );
  },
);
it("isolates list/detail/history caches across workspaces and pages", () => {
  expect(orderKeys.detail("sales", "id")).not.toEqual(
    orderKeys.detail("manager", "id"),
  );
  expect(orderKeys.history("sales", "id", "activity", { page: 1 })).not.toEqual(
    orderKeys.history("sales", "id", "activity", { page: 2 }),
  );
});
