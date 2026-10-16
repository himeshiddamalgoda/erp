import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Building2,
  CalendarDays,
  FileText,
  Layers3,
  LockKeyhole,
} from "lucide-react";
import {
  addressLabel,
  formatDate,
  formatMoney,
  formatQuantity,
} from "@/utils/format";
import styles from "../quotations.module.css";
function Info({ label, children }) {
  return (
    <div>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{children}</div>
    </div>
  );
}
export function QuotationOverview({ quotation, options }) {
  const buyer =
    quotation.status === "Draft"
      ? quotation.draftBuyer?.customer
      : quotation.customerSnapshot;
  const billing =
    quotation.status === "Draft"
      ? quotation.draftBuyer?.billingAddress
      : quotation.billingAddressSnapshot;
  const shipping =
    quotation.status === "Draft"
      ? quotation.draftBuyer?.shippingAddress
      : quotation.shippingAddressSnapshot;
  const team = options?.teams.find((t) => t.id === quotation.salesTeamId);
  const owner = team?.members.find((m) => m.id === quotation.ownerId);
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>
              <Building2 size={16} />
              Buyer &amp; commercial details
            </h2>
            <p>
              {quotation.status === "Draft"
                ? "Current buyer information for this draft."
                : "Commercial snapshots preserved from submission."}
            </p>
          </div>
        </div>
        <div className={styles.overviewGrid}>
          <Info label="Buyer">
            {buyer?.name || quotation.customerName}
            <small>
              {buyer?.code}
              {buyer?.country ? ` · ${buyer.country}` : ""}
            </small>
          </Info>
          <Info label="Sales team / owner">
            {team?.name || "Assigned sales team"}
            <small>{owner?.displayName || "Assigned owner"}</small>
          </Info>
          <Info label="Buyer contact">
            {buyer?.contacts?.length
              ? buyer.contacts.map((c) => (
                  <div key={c.id}>
                    {c.name}
                    <small>{c.email || c.phone || "No contact details"}</small>
                  </div>
                ))
              : "Not set"}
          </Info>
          <Info label="Payment terms">
            {quotation.paymentTerms || "Not set"}
          </Info>
          <Info label="Billing address">{addressLabel(billing)}</Info>
          <Info label="Shipping address">{addressLabel(shipping)}</Info>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>
              <CalendarDays size={16} />
              Dates &amp; currency
            </h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <Info label="Quotation date">
            {formatDate(quotation.quotationDate)}
          </Info>
          <Info label="Valid until">{formatDate(quotation.validUntil)}</Info>
          <Info label="Requested delivery">
            {formatDate(quotation.requestedDeliveryDate)}
          </Info>
        </div>
      </section>
      <section>
        <div className={`${styles.section} ${styles.compactSectionHeader}`}>
          <div className={`${styles.sectionHeading} ${styles.flushHeading}`}>
            <div>
              <h2>
                <Layers3 size={16} />
                Garment breakdown
              </h2>
              <p>
                {quotation.lines.length} variations · {quotation.currency}{" "}
                pricing · Quantities in PCS
              </p>
            </div>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <Table
            className={styles.detailLines}
            aria-label="Quotation garment lines"
          >
            <TableHead>
              <TableRow>
                <TableCell>Style / fabric</TableCell>
                <TableCell>Colour</TableCell>
                <TableCell>Size</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Unit price</TableCell>
                <TableCell align="right">Line total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {quotation.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className={styles.garmentName}>
                      {line.styleCode} · {line.styleName}
                    </span>
                    <span className={styles.cellSub}>
                      {line.fabric}
                      {line.gsm ? ` · ${line.gsm} GSM` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{line.colour}</TableCell>
                  <TableCell>{line.size}</TableCell>
                  <TableCell align="right">
                    {formatQuantity(line.qty)}
                  </TableCell>
                  <TableCell align="right" className={styles.noWrap}>
                    {formatMoney(line.unitPrice, quotation.currency)}
                  </TableCell>
                  <TableCell align="right" className={styles.noWrap}>
                    {formatMoney(line.lineTotal, quotation.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className={styles.detailTotals}>
          <div className={styles.totalRow}>
            <span>Total quantity</span>
            <strong>{formatQuantity(quotation.totalQty)} PCS</strong>
          </div>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <strong>
              {formatMoney(quotation.subtotal, quotation.currency)}
            </strong>
          </div>
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <span>Total</span>
            <strong>{formatMoney(quotation.total, quotation.currency)}</strong>
          </div>
        </div>
      </section>
      {quotation.notes && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>
                <FileText size={16} />
                Internal notes
              </h2>
              <p>
                <LockKeyhole size={11} /> For your team only. Not included in
                the buyer PDF.
              </p>
            </div>
          </div>
          <p className={`${styles.infoValue} ${styles.notesText}`}>
            {quotation.notes}
          </p>
        </section>
      )}
      {quotation.buyerDecision && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Buyer response</h2>
              <p>
                Recorded by your team on {formatDate(quotation.buyerResponseAt)}
              </p>
            </div>
          </div>
          <div className={styles.overviewGrid}>
            <Info label="Decision">{quotation.buyerDecision}</Info>
            <Info label="Reference">{quotation.buyerResponseReference}</Info>
            {quotation.buyerResponseReason && (
              <Info label="Reason">{quotation.buyerResponseReason}</Info>
            )}
          </div>
        </section>
      )}
    </>
  );
}
