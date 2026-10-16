export function summary(q, family, customer) {
  return {
    id: q.id,
    familyId: q.familyId,
    quoteNumber: family.quoteNumber,
    revision: q.revisionNo,
    status: q.status,
    customerId: q.customerId,
    customerName:
      (q.status === "Draft"
        ? customer?.name
        : q.customerSnapshot?.name || customer?.name) || "",
    salesTeamId: q.salesTeamId,
    ownerId: q.ownerId,
    currency: q.currency,
    totalQty: Number(q.totalQty),
    subtotal: q.subtotal,
    total: q.total,
    validUntil: q.validUntil,
    requestedDeliveryDate: q.requestedDeliveryDate,
    version: q.version,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}
export function mapLine(l) {
  return {
    id: l.id,
    lineNo: l.lineNo,
    variantId: l.variantId,
    styleId: l.styleId,
    styleCode: l.styleCodeSnapshot,
    styleName: l.styleNameSnapshot,
    fabric: l.fabricSnapshot,
    gsm: l.gsmSnapshot,
    colour: l.colourSnapshot,
    size: l.sizeSnapshot,
    uom: l.uom,
    qty: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  };
}
export function orderSummary(order) {
  return {
    id: order.id,
    salesOrderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    sourceQuotationId: order.sourceQuotationId,
    sourceQuoteNumber: order.sourceQuoteNumber,
    sourceRevision: order.sourceRevisionNo,
    currency: order.currency,
    totalQty: Number(order.totalQty),
    subtotal: order.subtotal,
    total: order.total,
    version: order.version,
    deletedAt: order.deletedAt || null,
    archived: Boolean(order.deletedAt),
  };
}
