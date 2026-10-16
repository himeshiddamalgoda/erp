import { describe, it, expect } from "vitest";
import {
  quotationSchema,
  quotationSubmissionSchema,
  makeActionSchema,
} from "@/features/quotations/schemas/quotation.schema";
import {
  toFormValues,
  toQuotationPayload,
  actionBody,
} from "@/utils/quotation-form";
import { formatMoney, quotationTotals } from "@/utils/format";
import { readListFilters, filtersToSearch } from "@/utils/list-filters";
import { getConversionAttempt } from "@/utils/conversion-attempt";
import { quotation, ids, options } from "./fixtures";
describe("quotation form contracts", () => {
  it("validates the 1000 PCS example and calculates exactly 5500.00", () => {
    const values = quotationSchema.parse(toFormValues(quotation));
    expect(quotationTotals(values.lines)).toEqual({
      qty: 1000,
      amount: "5500.00",
    });
    expect(formatMoney("9999999999999999.99", "USD")).toBe(
      "USD 9,999,999,999,999,999.99",
    );
  });
  it.each([
    { qty: 0 },
    { qty: 1.5 },
    { qty: 1000001 },
    { unitPrice: "1.001" },
    { unitPrice: "100000000.00" },
    { styleId: "not-a-uuid" },
  ])("rejects invalid line %j", (change) => {
    const values = toFormValues(quotation);
    values.lines[0] = { ...values.lines[0], ...change };
    expect(quotationSchema.safeParse(values).success).toBe(false);
  });
  it("rejects duplicate variants and invalid commercial dates", () => {
    const values = toFormValues(quotation);
    values.lines.push(values.lines[0]);
    expect(quotationSchema.safeParse(values).success).toBe(false);
    expect(
      quotationSchema.safeParse({
        ...toFormValues(quotation),
        validUntil: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      quotationSchema.safeParse({
        ...toFormValues(quotation),
        requestedDeliveryDate: "2026-01-01",
      }).success,
    ).toBe(false);
  });
  it("allows unfinished draft terms and zero prices, and rejects document overflow", () => {
    const values = {
      ...toFormValues(quotation),
      validUntil: "",
      requestedDeliveryDate: "",
      paymentTerms: "",
      billingAddressId: "",
      shippingAddressId: "",
      lines: [
        {
          styleId: ids.style,
          colour: "Navy",
          size: "S",
          qty: 1,
          unitPrice: "0.00",
        },
      ],
    };
    expect(quotationSchema.safeParse(values).success).toBe(true);
    values.lines = Array.from({ length: 101 }, (_, i) => ({
      styleId: ids.style,
      colour: `Colour ${i}`,
      size: "S",
      qty: 1000000,
      unitPrice: "99999999.99",
    }));
    expect(quotationSchema.safeParse(values).success).toBe(false);
  });
  it("requires complete commercial data only when submitting", () => {
    const schema = quotationSubmissionSchema("2026-10-16", options.customers);
    expect(schema.safeParse(toFormValues(quotation)).success).toBe(true);
    const incomplete = {
      ...toFormValues(quotation),
      paymentTerms: "",
      validUntil: "",
      billingAddressId: "",
    };
    incomplete.lines[0].unitPrice = "0.00";
    expect(quotationSchema.safeParse(incomplete).success).toBe(true);
    const result = schema.safeParse(incomplete);
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining([
        "paymentTerms",
        "validUntil",
        "billingAddressId",
        "lines.0.unitPrice",
      ]),
    );
    expect(
      quotationSubmissionSchema("2026-11-01", options.customers).safeParse(
        toFormValues(quotation),
      ).success,
    ).toBe(false);
    expect(
      quotationSubmissionSchema("2026-10-16", [
        { ...options.customers[0], contacts: [] },
      ]).safeParse(toFormValues(quotation)).success,
    ).toBe(false);
  });
  it("maps editable payloads without IDs, totals, status, or actor fields", () => {
    const result = toQuotationPayload(toFormValues(quotation));
    expect(result).not.toHaveProperty("version");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("total");
    expect(result.lines[0]).not.toHaveProperty("id");
    expect(
      toQuotationPayload({ ...toFormValues(quotation), validUntil: "" })
        .validUntil,
    ).toBe(null);
  });
  it("requires reasons and buyer response references before a request", () => {
    const empty = {
      reason: "",
      comment: "",
      decision: "Accepted",
      reference: "",
    };
    expect(makeActionSchema("reject").safeParse(empty).success).toBe(false);
    expect(
      makeActionSchema("buyer-response").safeParse({
        ...empty,
        reference: "Buyer email",
      }).success,
    ).toBe(true);
    expect(
      makeActionSchema("buyer-response").safeParse({
        ...empty,
        decision: "Declined",
        reference: "Buyer email",
      }).success,
    ).toBe(false);
    expect(
      actionBody(
        "buyer-response",
        {
          ...empty,
          decision: "Accepted",
          reference: " Email ",
          reason: "ignored",
        },
        4,
      ),
    ).toEqual({ version: 4, decision: "Accepted", reference: "Email" });
    expect(actionBody("issue", empty, 3)).toEqual({
      version: 3,
      channel: "manual",
    });
  });
  it("retains conversion key and accepted version across retries and refreshed state", () => {
    const scope = "test:" + crypto.randomUUID();
    const first = getConversionAttempt(
      scope,
      { id: ids.quote, version: 5 },
      sessionStorage,
    );
    const retry = getConversionAttempt(
      scope,
      { id: ids.quote, version: 6 },
      sessionStorage,
    );
    expect(retry).toEqual(first);
    expect(retry.version).toBe(5);
    expect(
      getConversionAttempt(
        scope + ":manager",
        { id: ids.quote, version: 5 },
        sessionStorage,
      ).idempotencyKey,
    ).not.toBe(first.idempotencyKey);
  });
  it("round-trips URL filters and bounds page size", () => {
    const filters = readListFilters(
      new URLSearchParams(
        "q=Ocean&page=2&pageSize=50&status=Issued&includeRevisions=true",
      ),
    );
    expect(
      readListFilters(new URLSearchParams(filtersToSearch(filters))),
    ).toEqual(filters);
    expect(
      readListFilters(
        new URLSearchParams("pageSize=100000&page=-1&sortBy=DROP"),
      ).pageSize,
    ).toBe(20);
  });
});
