import { describe, it, expect, vi, beforeEach } from "vitest";
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/axios", () => ({ getHttpClient: () => client }));
import * as service from "@/features/quotations/services/quotation.service";
import { quotationKeys } from "@/features/quotations/hooks/use-quotations";
import { downloadPdf } from "@/utils/download";
beforeEach(() => {
  for (const fn of Object.values(client))
    fn.mockReset().mockResolvedValue({
      data: { data: { id: "revision", version: 4 } },
      headers: {},
    });
});
describe("quotation Axios boundary", () => {
  it("maps list, detail, create, update, conditional delete and PDF to the six resource operations", async () => {
    const signal = new AbortController().signal;
    await service.listQuotations("base", { page: 1 }, signal);
    expect(client.get).toHaveBeenLastCalledWith("/quotations", {
      params: { page: 1 },
      signal,
    });
    await service.getQuotation("base", "revision", signal);
    expect(client.get).toHaveBeenLastCalledWith("/quotations/revision", {
      signal,
    });
    await service.createQuotation("base", { currency: "USD" });
    expect(client.post).toHaveBeenLastCalledWith("/quotations", {
      currency: "USD",
    });
    await service.updateQuotation("base", {
      id: "revision",
      body: { version: 4, notes: "change" },
    });
    expect(client.patch).toHaveBeenLastCalledWith("/quotations/revision", {
      version: 4,
      notes: "change",
    });
    await service.deleteQuotation("base", { id: "revision", version: 4 });
    expect(client.delete).toHaveBeenLastCalledWith("/quotations/revision", {
      headers: { "If-Match": '"4"' },
    });
    await service.getQuotationPdf("base", "revision");
    expect(client.get).toHaveBeenLastCalledWith("/quotations/revision/pdf", {
      responseType: "blob",
    });
  });
  it.each([
    "submit",
    "approve",
    "reject",
    "withdraw",
    "issue",
    "buyer-response",
    "revisions",
    "void",
    "convert",
  ])("calls the named %s action without actor headers", async (action) => {
    await service.quotationAction("base", {
      id: "revision",
      action,
      body: { version: 4 },
      ...(action === "convert" ? { idempotencyKey: "attempt-key" } : {}),
    });
    expect(client.post).toHaveBeenLastCalledWith(
      `/quotations/revision/${action}`,
      { version: 4 },
      {
        headers:
          action === "convert"
            ? { "Idempotency-Key": "attempt-key" }
            : undefined,
      },
    );
  });
  it("separates every query cache by API workspace", () => {
    expect(quotationKeys.detail("sales", "revision")).not.toEqual(
      quotationKeys.detail("manager", "revision"),
    );
    expect(quotationKeys.all("sales")).toEqual(["quotations", "sales"]);
  });
  it("never downloads JSON as a quotation PDF", async () => {
    const response = {
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        text: async () =>
          JSON.stringify({
            error: { code: "FORBIDDEN", message: "Not allowed" },
          }),
      },
    };
    await expect(downloadPdf(response)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Not allowed",
    });
  });
});
