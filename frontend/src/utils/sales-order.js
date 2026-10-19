import { ORDER_FILTERS, ORDER_STATUSES } from "@/constants/sales-orders";
import { emptyLine } from "./quotation-form";
const optionalFields = [
  "buyerPoNumber",
  "buyerPoDate",
  "requestedDeliveryDate",
  "shippingAddressId",
  "publicNotes",
  "internalNotes",
];
export function orderFormValues(order, today = "") {
  return {
    customerId: order?.customerId || "",
    salesTeamId: order?.salesTeamId || "",
    ownerId: order?.ownerId || "",
    currency: order?.currency || "USD",
    orderDate: order?.orderDate || today,
    billingAddressId: order?.billingAddressId || "",
    paymentTerms: order?.paymentTerms || "",
    ...Object.fromEntries(optionalFields.map((k) => [k, order?.[k] || ""])),
    lines: order?.lines?.map((l) => ({
      styleId: l.styleId,
      colour: l.colour,
      size: l.size,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })) || [emptyLine()],
  };
}
export function orderPayload(values, converted = false, original) {
  const keys = converted
    ? optionalFields
    : [
        "customerId",
        "salesTeamId",
        "ownerId",
        "currency",
        "orderDate",
        "billingAddressId",
        "paymentTerms",
        "lines",
        ...optionalFields,
      ];
  return Object.fromEntries(
    keys
      .map((k) => [k, values[k] === "" ? null : values[k]])
      .filter(
        ([key, value]) =>
          !converted || !original || value !== (original[key] ?? null),
      ),
  );
}
export function orderActionBody(action, values, order) {
  const body = { version: order.version };
  if (["cancel", "hold", "resume", "revisions"].includes(action))
    body.reason = values.reason.trim();
  if (["confirm", "close"].includes(action) && values.comment.trim())
    body.comment = values.comment.trim();
  if (action === "revisions") {
    body.buyerReference = values.buyerReference.trim();
    body.changes = {};
    for (const k of [
      "requestedDeliveryDate",
      "shippingAddressId",
      "publicNotes",
    ])
      if (values[k] !== (order[k] || "")) body.changes[k] = values[k] || null;
  }
  return body;
}
export function readOrderFilters(search) {
  const v = { ...ORDER_FILTERS };
  for (const k of Object.keys(v)) if (search.has(k)) v[k] = search.get(k);
  for (const k of ["page", "pageSize"]) v[k] = Number(v[k]);
  if (!Number.isInteger(v.page) || v.page < 1 || v.page > 1000000) v.page = 1;
  if (![10, 20, 50, 100].includes(v.pageSize)) v.pageSize = 20;
  if (!ORDER_STATUSES.includes(v.status)) v.status = "";
  if (!["", "direct", "quotation"].includes(v.source)) v.source = "";
  if (!["", "true", "false"].includes(v.onHold)) v.onHold = "";
  if (
    ![
      "createdAt",
      "updatedAt",
      "orderDate",
      "orderNumber",
      "total",
      "requestedDeliveryDate",
    ].includes(v.sortBy)
  )
    v.sortBy = "createdAt";
  if (!["asc", "desc"].includes(v.sortOrder)) v.sortOrder = "desc";
  return v;
}
export function orderFilterSearch(v) {
  const search = new URLSearchParams();
  for (const [k, val] of Object.entries(v))
    if (val !== "" && val !== ORDER_FILTERS[k]) search.set(k, String(val));
  return search.toString();
}
export const withMissing = (
  items,
  value,
  label = "Selected value (unavailable)",
) =>
  value && !items.some((i) => i.id === value)
    ? [...items, { id: value, label, disabled: true }]
    : items;
