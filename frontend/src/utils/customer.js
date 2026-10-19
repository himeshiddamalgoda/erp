import {
  CUSTOMER_SCALARS,
  CONTACT_FIELDS,
  ADDRESS_FIELDS,
  CUSTOMER_FILTERS,
} from "@/constants/customers";
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? ""]));
const normalize = (value) =>
  typeof value === "string" ? value.trim() || null : value;
export const emptyContact = () => ({
  name: "",
  jobTitle: "",
  email: "",
  phone: "",
  primary: false,
  isActive: true,
});
export const emptyAddress = (type = "shipping", country = "") => ({
  addressType: type,
  label: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country,
  isDefault: false,
  isActive: true,
});
export function customerFormValues(customer, options) {
  return {
    ...Object.fromEntries(
      CUSTOMER_SCALARS.map((k) => [k, customer?.[k] ?? ""]),
    ),
    currency: customer?.currency || "USD",
    salesTeamId: customer?.salesTeamId || options.teams[0]?.id || "",
    ownerId: customer?.ownerId || options.teams[0]?.members[0]?.id || "",
    reason: "",
    contacts: customer
      ? customer.contacts.map((c) => ({ ...pick(c, CONTACT_FIELDS), id: c.id }))
      : [{ ...emptyContact(), primary: true }],
    addresses: customer
      ? customer.addresses.map((a) => ({
          ...pick(a, ADDRESS_FIELDS),
          id: a.id,
        }))
      : [
          { ...emptyAddress("billing"), isDefault: true },
          { ...emptyAddress("shipping"), isDefault: true },
        ],
  };
}
const normalized = (values, keys) =>
  Object.fromEntries(keys.map((k) => [k, normalize(values[k])]));
export function customerPayload(values, baseline) {
  const body = normalized(values, CUSTOMER_SCALARS);
  for (const kind of ["contacts", "addresses"]) {
    const fields = kind === "contacts" ? CONTACT_FIELDS : ADDRESS_FIELDS;
    const old = new Map((baseline?.[kind] || []).map((c) => [c.id, c]));
    body[kind] = values[kind].flatMap((row) => {
      const result = normalized(row, fields);
      if (!row.id) return [result];
      const original = old.get(row.id);
      if (!original)
        throw new Error(
          "Reload the customer before saving an unknown child ID",
        );
      const changed = Object.fromEntries(
        Object.entries(result).filter(
          ([key, value]) => value !== normalize(original[key] ?? null),
        ),
      );
      return Object.keys(changed).length ? [{ id: row.id, ...changed }] : [];
    });
    if (body[kind].length > 100)
      throw new Error(`Save at most 100 ${kind} changes at once`);
  }
  if (!baseline) return body;
  for (const key of CUSTOMER_SCALARS)
    if (body[key] === normalize(baseline[key] ?? null)) delete body[key];
  if ("ownerId" in body || "salesTeamId" in body) {
    body.ownerId = values.ownerId;
    body.salesTeamId = values.salesTeamId;
    body.reason = values.reason.trim();
  }
  return { version: baseline.version, ...body };
}
export function readCustomerFilters(search) {
  const result = { ...CUSTOMER_FILTERS };
  for (const key of Object.keys(result))
    if (search.has(key)) result[key] = search.get(key);
  for (const key of ["page", "pageSize"]) {
    const n = Number(result[key]);
    result[key] = Number.isInteger(n) && n > 0 ? n : CUSTOMER_FILTERS[key];
  }
  if (![10, 20, 50, 100].includes(result.pageSize)) result.pageSize = 20;
  if (!["Active", "Archived", "All"].includes(result.status))
    result.status = "Active";
  if (!["name", "code", "createdAt"].includes(result.sortBy))
    result.sortBy = "name";
  if (!["asc", "desc"].includes(result.sortOrder)) result.sortOrder = "asc";
  return result;
}
export function customerFilterSearch(filters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== "" && value !== CUSTOMER_FILTERS[key])
      search.set(key, String(value));
  return search.toString();
}
export const selectedOptions = (
  options,
  value,
  label = "Unavailable current selection",
) =>
  value && !options.some((o) => o.id === value)
    ? [...options, { id: value, label, disabled: true }]
    : options;
export function quotationDefaultsForCustomer(buyer) {
  if (!buyer) return null;
  return {
    customerId: buyer.id,
    salesTeamId: buyer.salesTeamId,
    ownerId: buyer.ownerId,
    currency: buyer.currency,
    paymentTerms: buyer.paymentTerms,
    billingAddressId:
      buyer.addresses.find((a) => a.addressType === "billing" && a.isDefault)
        ?.id || "",
    shippingAddressId:
      buyer.addresses.find((a) => a.addressType === "shipping" && a.isDefault)
        ?.id || "",
  };
}
