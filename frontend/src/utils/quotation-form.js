export const emptyLine = () => ({
  styleId: "",
  colour: "",
  size: "",
  qty: 1,
  unitPrice: "0.00",
});
export function toFormValues(quotation, date = "") {
  return {
    customerId: quotation?.customerId || "",
    salesTeamId: quotation?.salesTeamId || "",
    ownerId: quotation?.ownerId || "",
    currency: quotation?.currency || "USD",
    quotationDate: quotation?.quotationDate || date,
    validUntil: quotation?.validUntil || "",
    requestedDeliveryDate: quotation?.requestedDeliveryDate || "",
    billingAddressId: quotation?.billingAddressId || "",
    shippingAddressId: quotation?.shippingAddressId || "",
    paymentTerms: quotation?.paymentTerms || "",
    notes: quotation?.notes || "",
    lines: quotation?.lines?.map((line) => ({
      styleId: line.styleId,
      colour: line.colour,
      size: line.size,
      qty: line.qty,
      unitPrice: line.unitPrice,
    })) || [emptyLine()],
    ...(quotation?.version ? { version: quotation.version } : {}),
  };
}
export function toQuotationPayload(values) {
  const { version: _version, ...body } = values;
  for (const field of [
    "validUntil",
    "requestedDeliveryDate",
    "billingAddressId",
    "shippingAddressId",
    "paymentTerms",
    "notes",
  ])
    body[field] = body[field] || null;
  return body;
}
export function actionBody(action, values, version) {
  const body = { version };
  if (["reject", "withdraw", "revisions", "void"].includes(action))
    body.reason = values.reason.trim();
  if (action === "approve" && values.comment.trim())
    body.comment = values.comment.trim();
  if (action === "issue") body.channel = "manual";
  if (action === "buyer-response") {
    body.decision = values.decision;
    body.reference = values.reference.trim();
    if (values.decision === "Declined") body.reason = values.reason.trim();
  }
  return body;
}
