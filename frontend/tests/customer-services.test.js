import { it, expect, vi } from "vitest";
const client = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: { id: "customer" } } }),
  post: vi.fn().mockResolvedValue({ data: { data: { id: "customer" } } }),
  patch: vi.fn().mockResolvedValue({ data: { data: { id: "customer" } } }),
}));
vi.mock("@/lib/axios", () => ({ getHttpClient: () => client }));
import * as api from "@/features/customers/services/customer.service";
import { customerKeys } from "@/features/customers/hooks/use-customers";
it("binds the six customer APIs, cancellation, inactive detail and idempotent create", async () => {
  const signal = new AbortController().signal;
  await api.listCustomers("api", { page: 2 }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/customers", {
    params: { page: 2 },
    signal,
  });
  await api.getCustomer("api", "buyer", true, signal);
  expect(client.get).toHaveBeenLastCalledWith("/customers/buyer", {
    params: { includeInactiveChildren: true },
    signal,
  });
  await api.createCustomer("api", {
    body: { name: "Ocean" },
    idempotencyKey: "same-key",
  });
  expect(client.post).toHaveBeenLastCalledWith(
    "/customers",
    { name: "Ocean" },
    { headers: { "Idempotency-Key": "same-key" } },
  );
  await api.updateCustomer("api", {
    id: "buyer",
    body: { version: 2, contacts: [] },
  });
  expect(client.patch).toHaveBeenLastCalledWith("/customers/buyer", {
    version: 2,
    contacts: [],
  });
  for (const action of ["archive", "reactivate"]) {
    await api.customerLifecycle("api", {
      id: "buyer",
      action,
      body: { version: 3, reason: "Reason" },
    });
    expect(client.post).toHaveBeenLastCalledWith(`/customers/buyer/${action}`, {
      version: 3,
      reason: "Reason",
    });
  }
  await expect(
    api.customerLifecycle("api", { id: "buyer", action: "delete" }),
  ).rejects.toThrow("Unsupported");
});
it("separates active/inactive detail and workspace query caches", () => {
  expect(customerKeys.detail("sales", "id", false)).not.toEqual(
    customerKeys.detail("sales", "id", true),
  );
  expect(customerKeys.detail("admin", "id", true)).not.toEqual(
    customerKeys.detail("sales", "id", true),
  );
});
