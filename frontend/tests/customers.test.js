import { describe, it, expect } from "vitest";
import {
  customerFormValues,
  customerPayload,
  emptyAddress,
  emptyContact,
  readCustomerFilters,
  customerFilterSearch,
  quotationDefaultsForCustomer,
} from "@/utils/customer";
import {
  customerSchema,
  customerReasonSchema,
} from "@/features/customers/schemas/customer.schema";
import { canManageCustomers, canAssignCustomers } from "@/constants/customers";
import { toApiError } from "@/utils/api-error";
import { beginOrderAttempt, clearOrderAttempt } from "@/utils/order-attempt";
import { customerAttemptScope } from "@/features/customers/hooks/use-customer-attempt";
import { ids } from "./fixtures";
const options = {
  actor: { role: "Admin" },
  company: {
    countries: ["LK", "US"],
    currencies: ["USD", "LKR", "GBP", "EUR"],
  },
  teams: [
    {
      id: ids.team,
      name: "Apparel",
      members: [{ id: ids.owner, displayName: "Demo Sales" }],
    },
  ],
};
const buyer = {
  id: ids.customer,
  version: 7,
  name: "Ocean Apparel",
  displayName: "Ocean",
  country: "LK",
  currency: "USD",
  paymentTerms: "Net 30",
  salesTeamId: ids.team,
  ownerId: ids.owner,
  contacts: [
    {
      ...emptyContact(),
      id: "60000000-0000-4000-8000-000000000001",
      name: "Nimal",
      email: "buyer@example.test",
      primary: true,
    },
  ],
  addresses: [
    {
      ...emptyAddress("billing", "LK"),
      id: ids.billing,
      line1: "14 Road",
      city: "Colombo",
      isDefault: true,
    },
    {
      ...emptyAddress("shipping", "LK"),
      id: ids.shipping,
      line1: "Warehouse A",
      city: "Colombo",
      isDefault: true,
    },
    {
      ...emptyAddress("shipping", "LK"),
      id: "40000000-0000-4000-8000-000000000003",
      line1: "Warehouse B",
      city: "Gampaha",
    },
  ],
};
describe("Customer aggregate form contract", () => {
  it("accepts complete buyer, rejects unsupported countries, invalid websites and primary/default failures", () => {
    const values = customerFormValues(buyer, options);
    expect(customerSchema(options, buyer).safeParse(values).success).toBe(true);
    for (const change of [
      { website: "not a url" },
      { website: "javascript:alert(1)" },
      { country: "ZZ" },
      { contacts: values.contacts.map((c) => ({ ...c, primary: false })) },
      { addresses: values.addresses.map((a) => ({ ...a, isDefault: false })) },
      {
        contacts: values.contacts.map((c) => ({ ...c, email: "", phone: "" })),
      },
    ])
      expect(
        customerSchema(options, buyer).safeParse({ ...values, ...change })
          .success,
      ).toBe(false);
  });
  it("omitted rows and IDs survive no-op/scalar edits; transport does not include response fields", () => {
    const values = customerFormValues(buyer, options);
    expect(customerPayload(values, buyer)).toEqual({
      version: 7,
      contacts: [],
      addresses: [],
    });
    values.displayName = " New buyer ";
    expect(customerPayload(values, buyer)).toEqual({
      version: 7,
      displayName: "New buyer",
      contacts: [],
      addresses: [],
    });
  });
  it("builds explicit old-false/new-true swaps and preserves original UUIDs", () => {
    const values = customerFormValues(buyer, options);
    values.addresses[1].isDefault = false;
    values.addresses[2].isDefault = true;
    expect(customerPayload(values, buyer).addresses).toEqual([
      { id: ids.shipping, isDefault: false },
      { id: buyer.addresses[2].id, isDefault: true },
    ]);
  });
  it("new child has no caller ID and inactive old child is an explicit change set", () => {
    const values = customerFormValues(buyer, options);
    values.contacts[0].primary = false;
    values.contacts[0].isActive = false;
    values.contacts.push({
      ...emptyContact(),
      name: "Amali",
      email: "amali@example.test",
      primary: true,
    });
    const payload = customerPayload(values, buyer);
    expect(payload.contacts[0]).toEqual({
      id: buyer.contacts[0].id,
      primary: false,
      isActive: false,
    });
    expect(payload.contacts[1]).not.toHaveProperty("id");
    expect(payload.contacts[1].phone).toBeNull();
    expect(customerSchema(options, buyer).safeParse(values).success).toBe(true);
  });
  it("requires ownership reason and always sends both assignment IDs on change", () => {
    const values = customerFormValues(buyer, options);
    values.ownerId = "10000000-0000-4000-8000-000000000002";
    expect(customerSchema(options, buyer).safeParse(values).success).toBe(
      false,
    );
    values.reason = "New merchandiser";
    const payload = customerPayload(values, buyer);
    expect(payload).toMatchObject({
      version: 7,
      ownerId: values.ownerId,
      salesTeamId: ids.team,
      reason: values.reason,
    });
  });
  it("create rejects supplied protected state and submits only editable fields without version", () => {
    const values = customerFormValues(buyer, options);
    values.contacts = values.contacts.map(({ id: _id, ...c }) => c);
    values.addresses = values.addresses.map(({ id: _id, ...a }) => a);
    const payload = customerPayload({
      ...values,
      code: "injected",
      status: "Archived",
      createdBy: "other",
    });
    expect(payload).not.toHaveProperty("code");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("version");
    expect(payload.contacts).toHaveLength(1);
  });
  it("limits child changes to 100 even when inactive history is larger", () => {
    const values = customerFormValues(buyer, options);
    values.contacts = Array.from({ length: 101 }, () => ({
      ...emptyContact(),
      name: "New",
    }));
    expect(() => customerPayload(values, buyer)).toThrow("at most 100");
  });
  it("enforces reason and separates membership from master-data/assignment permission", () => {
    expect(customerReasonSchema.safeParse({ reason: "   " }).success).toBe(
      false,
    );
    expect(
      canManageCustomers({ role: "SalesManager", salesTeamIds: [ids.team] }),
    ).toBeFalsy();
    expect(canManageCustomers({ role: "Admin" })).toBe(true);
    expect(
      canManageCustomers({ role: "Sales", capabilities: ["customers:write"] }),
    ).toBe(true);
    expect(
      canAssignCustomers({ role: "Sales", capabilities: ["customers:write"] }),
    ).toBeFalsy();
  });
  it("normalizes filter URLs and resets invalid pagination/sort inputs", () => {
    const filters = readCustomerFilters(
      new URLSearchParams("page=0&pageSize=500&sortBy=notes&status=Wrong"),
    );
    expect(filters).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: "name",
      status: "Active",
    });
    const q = customerFilterSearch({
      ...filters,
      status: "Archived",
      q: "Ocean %_",
    });
    expect(new URLSearchParams(q).get("q")).toBe("Ocean %_");
    expect(q).not.toContain("page=");
  });
  it("preserves visibility-filtered blockers through Axios error normalization", () => {
    const details = {
      blockerCount: 3,
      archiveBlockers: [],
      restrictedBlockers: true,
    };
    const error = toApiError({
      response: {
        status: 409,
        data: {
          error: {
            code: "CUSTOMER_HAS_OPEN_DOCUMENTS",
            message: "Resolve records",
            details,
          },
        },
      },
    });
    expect(error.details).toEqual(details);
    expect(error.status).toBe(409);
  });
  it("retains original key and frozen body on uncertain retry, separated by actor/workspace", () => {
    const scope = customerAttemptScope("admin-api", "admin");
    clearOrderAttempt(scope, "create");
    const original = beginOrderAttempt(scope, "create", { name: "Ocean" }),
      retry = beginOrderAttempt(scope, "create", {
        name: "Edited after timeout",
      });
    expect(retry).toEqual(original);
    expect(retry.body.name).toBe("Ocean");
    expect(scope).not.toBe(customerAttemptScope("sales-api", "admin"));
    clearOrderAttempt(scope, "create");
  });
  it("quotation shortcut takes the selected current defaults without staff notes", () => {
    const defaults = quotationDefaultsForCustomer({
      ...buyer,
      internalNotes: "private",
    });
    expect(defaults).toMatchObject({
      customerId: ids.customer,
      billingAddressId: ids.billing,
      shippingAddressId: ids.shipping,
      paymentTerms: "Net 30",
    });
    expect(defaults).not.toHaveProperty("internalNotes");
  });
});
