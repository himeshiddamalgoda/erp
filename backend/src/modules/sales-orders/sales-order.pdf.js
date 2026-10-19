import PDFDocument from "pdfkit";
export function salesOrderPdf({
  snapshot: s,
  currentStatus,
  isOnHold,
  superseded,
}) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: { Title: `${s.orderNumber} R${s.documentRevision}` },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ensure = (h) => {
    if (doc.y + h > 770) doc.addPage();
  };
  const section = (title, value) => {
    ensure(80);
    doc.font("Helvetica-Bold").fontSize(10).text(title);
    doc.font("Helvetica").text(value || "-");
    doc.moveDown(0.5);
  };
  const address = (a) =>
    a
      ? [a.line1, a.line2, a.city, a.postalCode, a.country]
          .filter(Boolean)
          .join(", ")
      : "-";
  doc.fontSize(18).text(s.seller.name);
  doc.fontSize(14).text("SALES ORDER CONFIRMATION");
  doc.fontSize(11).text(`${s.orderNumber} / Revision ${s.documentRevision}`);
  doc.text(
    `Current order status: ${currentStatus}${isOnHold ? " / ON HOLD" : ""}`,
  );
  if (superseded) doc.text("HISTORICAL DOCUMENT - SUPERSEDED");
  doc.moveDown();
  section("Buyer", s.customerSnapshot?.name);
  section(
    "Buyer contact",
    (s.customerSnapshot?.contacts || [])
      .map((c) => [c.name, c.email, c.phone].filter(Boolean).join(" | "))
      .join("\n"),
  );
  section(
    "Source quotation",
    s.sourceQuoteNumber
      ? `${s.sourceQuoteNumber} / Revision ${s.sourceRevisionNo}`
      : "Direct order",
  );
  section("Buyer PO", `${s.buyerPoNumber || "-"} / ${s.buyerPoDate || "-"}`);
  section(
    "Dates",
    `Order: ${s.orderDate}\nRequested delivery: ${s.requestedDeliveryDate || "-"}`,
  );
  section("Billing address", address(s.billingAddressSnapshot));
  section("Shipping address", address(s.shippingAddressSnapshot));
  section("Payment terms", s.paymentTerms);
  section("Public notes", s.publicNotes);
  for (const l of s.lines) {
    const text = `${l.lineNo}. ${l.styleCode} - ${l.styleName}\nFabric: ${l.fabric} | GSM: ${l.gsm ?? "-"}\n${l.colour} / ${l.size} | ${l.qty} ${l.uom} x ${l.unitPrice} = ${l.lineTotal} ${s.currency}`;
    const height = doc
      .font("Helvetica")
      .fontSize(10)
      .heightOfString(text, { width: 515 });
    ensure(height + 18);
    doc.text(text);
    doc.moveDown(0.6);
  }
  ensure(80);
  doc
    .font("Helvetica-Bold")
    .text(`Total quantity: ${s.totalQty} PCS`)
    .text(`Subtotal: ${s.currency} ${s.subtotal}`)
    .text(`Total: ${s.currency} ${s.total}`);
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    if (!s.documentRevision)
      doc
        .save()
        .fillColor("#dddddd")
        .opacity(0.5)
        .fontSize(50)
        .rotate(-30, { origin: [290, 420] })
        .text("DRAFT", 120, 390, { width: 350, align: "center" })
        .restore();
    doc
      .font("Helvetica")
      .fillColor("black")
      .fontSize(8)
      .text(
        `${s.orderNumber} / R${s.documentRevision} / Current: ${currentStatus}${isOnHold ? " ON HOLD" : ""}${superseded ? " / SUPERSEDED" : ""}    Page ${i + 1} of ${pages.count}`,
        40,
        800,
        { lineBreak: false },
      );
  }
  doc.end();
  return result;
}
