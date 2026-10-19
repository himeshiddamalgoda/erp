import { describe, it, expect, vi } from "vitest";
import {
  orderDraftSchema,
  orderActionSchema,
} from "@/features/sales-orders/schemas/sales-order.schema";
import {
  orderFormValues,
  orderPayload,
  orderActionBody,
  readOrderFilters,
  orderFilterSearch,
} from "@/utils/sales-order";
import {
  beginOrderAttempt,
  readOrderAttempt,
  clearOrderAttempt,
  attemptScope,
  uncertainOrderOutcome,
} from "@/utils/order-attempt";
import { quotation, options, ids } from "./fixtures";
const order = {
  ...quotation,
  orderNumber: "SO-2026-0001",
  orderDate: quotation.quotationDate,
  buyerPoNumber: "OA-1045",
  buyerPoDate: quotation.quotationDate,
  publicNotes: "Pack by colour",
  internalNotes: "Staff notes",
  sourceQuotationId: null,
};
describe("Sales Order contracts", () => {
  it("validates the six garment rows and permits incomplete direct Draft terms", () => {
    const v = orderFormValues(order);
    expect(orderDraftSchema("2026-10-16").safeParse(v).success).toBe(true);
    expect(
      orderDraftSchema("2026-10-16").safeParse({
        ...v,
        buyerPoNumber: "",
        requestedDeliveryDate: "",
        paymentTerms: "",
        lines: [{ ...v.lines[0], unitPrice: "0.00" }],
      }).success,
    ).toBe(true);
  });
  it.each([
    { qty: 0 },
    { qty: 1.5 },
    { qty: 1000001 },
    { unitPrice: "1.001" },
    { unitPrice: "-1" },
  ])("blocks invalid garment data %j", (change) => {
    const v = orderFormValues(order);
    v.lines[0] = { ...v.lines[0], ...change };
    expect(orderDraftSchema("2026-10-16").safeParse(v).success).toBe(false);
  });
  it("rejects duplicates, invalid dates and future PO dates", () => {
    const v = orderFormValues(order);
    expect(
      orderDraftSchema("2026-10-16").safeParse({
        ...v,
        lines: [v.lines[0], v.lines[0]],
      }).success,
    ).toBe(false);
    expect(
      orderDraftSchema("2026-10-16").safeParse({
        ...v,
        buyerPoDate: "2026-10-17",
      }).success,
    ).toBe(false);
    expect(
      orderDraftSchema("2026-10-16").safeParse({
        ...v,
        orderDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
  it("serializes converted Drafts with only the six operational fields", () => {
    const result = orderPayload(orderFormValues(order), true);
    expect(Object.keys(result).sort()).toEqual(
      [
        "buyerPoNumber",
        "buyerPoDate",
        "requestedDeliveryDate",
        "shippingAddressId",
        "publicNotes",
        "internalNotes",
      ].sort(),
    );
    expect(result).not.toHaveProperty("customerId");
    expect(result).not.toHaveProperty("lines");
    expect(
      orderDraftSchema("2026-10-16", true).parse(orderFormValues(order)),
    ).not.toHaveProperty("currency");
  });
  it("omits unchanged converted fields and retains long historical notes without resubmitting them", () => {
    const historical = { ...order, internalNotes: "x".repeat(6000) };
    const values = {
      ...orderFormValues(historical),
      buyerPoNumber: "UPDATED-PO",
    };
    expect(orderPayload(values, true, historical)).toEqual({
      buyerPoNumber: "UPDATED-PO",
    });
    expect(
      orderDraftSchema("2026-10-16", true, historical).safeParse(values)
        .success,
    ).toBe(true);
    expect(
      orderDraftSchema("2026-10-16", true, historical).safeParse({
        ...values,
        internalNotes: "y".repeat(6000),
      }).success,
    ).toBe(false);
  });
  it("requires a nonempty amendment, reason, buyer evidence and valid new delivery", () => {
    const values = {
      reason: "Buyer request",
      comment: "",
      buyerReference: "Email",
      requestedDeliveryDate: order.requestedDeliveryDate,
      shippingAddressId: order.shippingAddressId,
      publicNotes: order.publicNotes,
    };
    const schema = orderActionSchema("revisions", "2026-10-16", order);
    expect(schema.safeParse(values).success).toBe(false);
    expect(
      schema.safeParse({ ...values, publicNotes: "Revised" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...values, requestedDeliveryDate: "2026-10-15" })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...values,
        publicNotes: "Revised",
        buyerReference: "",
      }).success,
    ).toBe(false);
    expect(
      orderActionBody(
        "revisions",
        { ...values, publicNotes: "Revised" },
        order,
      ),
    ).toEqual({
      version: order.version,
      reason: "Buyer request",
      buyerReference: "Email",
      changes: { publicNotes: "Revised" },
    });
  });
  it("requires hold/cancel/resume reasons and keeps confirmation version explicit", () => {
    for (const action of ["hold", "resume", "cancel"])
      expect(
        orderActionSchema(action, "2026-10-16", order).safeParse({ reason: "" })
          .success,
      ).toBe(false);
    expect(orderActionBody("confirm", { comment: "Reviewed" }, order)).toEqual({
      version: order.version,
      comment: "Reviewed",
    });
  });
  it("preserves exact request and idempotency key across changed versions and reload", async () => {
    const scope = attemptScope("api", ids.owner, crypto.randomUUID());
    const original = { version: 3, changes: { publicNotes: "R2" } };
    const first = beginOrderAttempt(scope, "revisions", original);
    const retry = beginOrderAttempt(scope, "revisions", {
      version: 5,
      changes: { publicNotes: "Should not replace" },
    });
    expect(retry).toEqual(first);
    original.changes.publicNotes = "mutated locally";
    expect(readOrderAttempt(scope, "revisions").body.changes.publicNotes).toBe(
      "R2",
    );
    vi.resetModules();
    const reloaded = await import("@/utils/order-attempt");
    expect(reloaded.readOrderAttempt(scope, "revisions")).toEqual(first);
    reloaded.clearOrderAttempt(scope, "revisions");
    clearOrderAttempt(scope, "revisions");
    expect(readOrderAttempt(scope, "revisions")).toBe(null);
    expect(uncertainOrderOutcome({ status: 503 })).toBe(true);
    expect(uncertainOrderOutcome({ status: 0 })).toBe(true);
    expect(uncertainOrderOutcome({ status: 422 })).toBe(false);
  });
  it("scopes requests by actor, backend, operation and order", () => {
    const s = crypto.randomUUID();
    const first = beginOrderAttempt(
      attemptScope(s, "sales", "one"),
      "confirm",
      { version: 1 },
    );
    const other = beginOrderAttempt(
      attemptScope(s, "manager", "one"),
      "confirm",
      { version: 1 },
    );
    expect(first.idempotencyKey).not.toBe(other.idempotencyKey);
  });
  it("round trips list filters and bounds pagination", () => {
    const params = new URLSearchParams(
      "source=quotation&onHold=true&status=Confirmed&page=2&pageSize=50",
    );
    const values = readOrderFilters(params);
    expect(
      readOrderFilters(new URLSearchParams(orderFilterSearch(values))),
    ).toEqual(values);
    expect(
      readOrderFilters(new URLSearchParams("sortBy=DROP&page=-1&pageSize=500"))
        .pageSize,
    ).toBe(20);
  });
  it("keeps the existing lookup contract compatible with order forms", () => {
    expect(options.customers[0].id).toBe(order.customerId);
    expect(
      orderPayload({ ...orderFormValues(order), buyerPoDate: "" }).buyerPoDate,
    ).toBe(null);
  });
});
