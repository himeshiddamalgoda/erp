import { mapLine } from "../quotations/quotation.mapper.js";
import { env } from "../../config/env.js";
export { mapLine };
export const pick = (o, keys) =>
  Object.fromEntries(
    keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]),
  );
export const headerFields = [
  "id",
  "orderNumber",
  "sourceQuotationId",
  "sourceQuoteNumber",
  "sourceRevisionNo",
  "customerId",
  "salesTeamId",
  "ownerId",
  "status",
  "orderDate",
  "currency",
  "buyerPoNumber",
  "buyerPoDate",
  "requestedDeliveryDate",
  "billingAddressId",
  "shippingAddressId",
  "paymentTerms",
  "publicNotes",
  "internalNotes",
  "customerSnapshot",
  "billingAddressSnapshot",
  "shippingAddressSnapshot",
  "subtotal",
  "total",
  "documentRevision",
  "isOnHold",
  "holdReason",
  "heldBy",
  "heldAt",
  "confirmedBy",
  "confirmedAt",
  "cancelledBy",
  "cancelledAt",
  "cancellationReason",
  "closedBy",
  "closedAt",
  "createdBy",
  "updatedBy",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedBy",
  "version",
];
export function summary(o) {
  return {
    ...pick(o, [
      "id",
      "orderNumber",
      "sourceQuotationId",
      "sourceQuoteNumber",
      "sourceRevisionNo",
      "customerId",
      "salesTeamId",
      "ownerId",
      "status",
      "orderDate",
      "currency",
      "buyerPoNumber",
      "buyerPoDate",
      "requestedDeliveryDate",
      "subtotal",
      "total",
      "documentRevision",
      "isOnHold",
      "version",
      "createdAt",
      "updatedAt",
    ]),
    customerName: o.customerSnapshot?.name || "",
    totalQty: Number(o.totalQty),
  };
}
export function handoffSummary(h) {
  return h
    ? pick(h, [
        "id",
        "documentRevision",
        "status",
        "externalReference",
        "attemptCount",
        "claimedAt",
        "dispatchedAt",
        "acknowledgedAt",
        "version",
        "createdAt",
        "updatedAt",
      ])
    : null;
}
export function snapshot(o, lines, revision = o.documentRevision) {
  return {
    ...pick(o, [
      "id",
      "orderNumber",
      "sourceQuotationId",
      "sourceQuoteNumber",
      "sourceRevisionNo",
      "customerId",
      "orderDate",
      "currency",
      "buyerPoNumber",
      "buyerPoDate",
      "requestedDeliveryDate",
      "paymentTerms",
      "publicNotes",
      "customerSnapshot",
      "billingAddressSnapshot",
      "shippingAddressSnapshot",
      "subtotal",
      "total",
    ]),
    documentRevision: revision,
    totalQty: Number(o.totalQty),
    seller: { name: env.sellerName },
    lines: lines.map((l) =>
      l.styleCodeSnapshot !== undefined ? mapLine(l) : l,
    ),
  };
}
export function revisionDetail(r) {
  return {
    revision: r.revisionNo,
    reason: r.reason,
    buyerReference: r.buyerReference,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    snapshotSchemaVersion: r.snapshotSchemaVersion,
    snapshot: r.snapshot,
  };
}
export function legacySnapshot(o, lines, seller) {
  const camel = (o) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        v,
      ]),
    );
  return { ...snapshot(camel(o), lines.map(camel), 1), seller };
}
