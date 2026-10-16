import PDFDocument from "pdfkit";
import { env } from "../../config/env.js";
export function quotationPdf(detail) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: { Title: `${detail.quoteNumber} revision ${detail.revision}` },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ensure = (height) => {
    if (doc.y + height > 775) doc.addPage();
  };
  const section = (label, text) => {
    ensure(65);
    doc.font("Helvetica-Bold").fontSize(10).text(label);
    doc.font("Helvetica").text(text || "-");
    doc.moveDown(0.5);
  };
  doc.fontSize(18).text(env.sellerName);
  doc.fontSize(14).text("QUOTATION");
  doc.fontSize(11).text(`${detail.quoteNumber} / Revision ${detail.revision}`);
  doc.text(`Status: ${detail.status}`);
  const buyer =
    detail.status === "Draft"
      ? detail.draftBuyer?.customer
      : detail.customerSnapshot;
  const billing =
    detail.status === "Draft"
      ? detail.draftBuyer?.billingAddress
      : detail.billingAddressSnapshot;
  const shipping =
    detail.status === "Draft"
      ? detail.draftBuyer?.shippingAddress
      : detail.shippingAddressSnapshot;
  doc.moveDown();
  section(
    "Buyer",
    `${buyer?.name || detail.customerName}\n${buyer?.country || ""}\n${(buyer?.contacts || []).map((c) => [c.name, c.email, c.phone].filter(Boolean).join(" | ")).join("\n")}`,
  );
  const address = (a) =>
    a
      ? [a.line1, a.line2, a.city, a.postalCode, a.country]
          .filter(Boolean)
          .join(", ")
      : "-";
  section("Billing address", address(billing));
  section("Shipping address", address(shipping));
  section(
    "Dates",
    `Quotation: ${detail.quotationDate} | Valid through: ${detail.validUntil || "-"}\nRequested delivery: ${detail.requestedDeliveryDate || "-"}`,
  );
  section("Payment terms", detail.paymentTerms);
  doc.font("Helvetica-Bold").text(`Garments | Currency: ${detail.currency}`);
  doc.moveDown(0.5);
  for (const line of detail.lines) {
    const text = `${line.lineNo}. ${line.styleCode} - ${line.styleName}\nFabric: ${line.fabric} | GSM: ${line.gsm ?? "-"}\n${line.colour} / ${line.size} | ${line.qty} ${line.uom} x ${line.unitPrice} = ${line.lineTotal} ${detail.currency}`;
    const height = doc.font("Helvetica").heightOfString(text, { width: 515 });
    ensure(height + 16);
    doc.text(text);
    doc.moveDown(0.6);
  }
  ensure(80);
  doc
    .font("Helvetica-Bold")
    .text(`Total quantity: ${detail.totalQty} PCS`)
    .text(`Subtotal: ${detail.currency} ${detail.subtotal}`)
    .text(`Total: ${detail.currency} ${detail.total}`);
  // notes is staff-only. No public-notes field exists in this POC.
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    if (!["Issued", "Accepted", "Converted"].includes(detail.status)) {
      doc
        .save()
        .fillColor("#dddddd")
        .opacity(0.5)
        .fontSize(45)
        .rotate(-30, { origin: [290, 420] })
        .text(detail.status.toUpperCase(), 100, 390, {
          width: 430,
          align: "center",
        })
        .restore();
    }
    doc
      .font("Helvetica")
      .fillColor("black")
      .fontSize(8)
      .text(
        `${detail.quoteNumber} / R${detail.revision} / ${detail.status}    Page ${i + 1} of ${pages.count}`,
        40,
        800,
        { lineBreak: false },
      );
  }
  doc.end();
  return result;
}
