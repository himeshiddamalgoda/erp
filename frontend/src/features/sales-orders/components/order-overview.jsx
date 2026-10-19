import Link from "next/link";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { Building2, Layers3, FileText, LockKeyhole } from "lucide-react";
import {
  formatMoney,
  formatDate,
  formatQuantity,
  addressLabel,
} from "@/utils/format";
import { ROUTES } from "@/constants/routes";
import styles from "../sales-orders.module.css";
export function OrderFact({ label, children }) {
  return (
    <div>
      <div className={styles.factLabel}>{label}</div>
      <div className={styles.fact}>{children || "Not set"}</div>
    </div>
  );
}
export function OrderLines({ order }) {
  return (
    <>
      <div className={styles.tableWrap}>
        <Table className={styles.table} aria-label="Order garment lines">
          <TableHead>
            <TableRow>
              {[
                "Style / fabric",
                "Colour",
                "Size",
                "Quantity",
                "Unit price",
                "Line total",
              ].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {order.lines.map((l) => (
              <TableRow key={l.id || `${l.styleId}:${l.colour}:${l.size}`}>
                <TableCell>
                  {l.styleCode} · {l.styleName}
                  <span className={styles.sub}>
                    {l.fabric} · {l.gsm || "—"} GSM
                  </span>
                </TableCell>
                <TableCell>{l.colour}</TableCell>
                <TableCell>{l.size}</TableCell>
                <TableCell>{formatQuantity(l.qty)} PCS</TableCell>
                <TableCell className={styles.noWrap}>
                  {formatMoney(l.unitPrice, order.currency)}
                </TableCell>
                <TableCell className={styles.noWrap}>
                  {formatMoney(l.lineTotal, order.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className={styles.totals}>
        <div className={styles.total}>
          <span>Total quantity</span>
          <strong>{formatQuantity(order.totalQty)} PCS</strong>
        </div>
        <div className={styles.total}>
          <span>Subtotal</span>
          <strong>{formatMoney(order.subtotal, order.currency)}</strong>
        </div>
        <div className={`${styles.total} ${styles.grand}`}>
          <span>Order total</span>
          <strong>{formatMoney(order.total, order.currency)}</strong>
        </div>
      </div>
    </>
  );
}
export function OrderCommercialTerms({ order, options }) {
  const buyer = order.customerSnapshot,
    team = options?.teams.find((t) => t.id === order.salesTeamId),
    owner = team?.members.find((m) => m.id === order.ownerId);
  return (
    <div className={styles.two}>
      <OrderFact label="Buyer">
        {buyer?.name || order.customerName}
        <small>
          {buyer?.code} · {buyer?.country}
        </small>
      </OrderFact>
      <OrderFact label="Team / owner">
        {team?.name || "Assigned sales team"}
        <small>{owner?.displayName || "Assigned owner"}</small>
      </OrderFact>
      <OrderFact label="Buyer contact">
        {buyer?.contacts?.map((c) => (
          <div key={c.id}>
            {c.name}
            <small>{c.email || c.phone}</small>
          </div>
        ))}
      </OrderFact>
      <OrderFact label="Currency / payment terms">
        {order.currency}
        <small>{order.paymentTerms || "Terms not set"}</small>
      </OrderFact>
      <OrderFact label="Billing address">
        {addressLabel(order.billingAddressSnapshot)}
      </OrderFact>
      <OrderFact label="Source">
        {order.sourceQuotationId ? (
          <Link
            className={styles.sideLink}
            href={ROUTES.quotation(order.sourceQuotationId)}
          >
            {order.sourceQuoteNumber} · R{order.sourceRevisionNo}
          </Link>
        ) : (
          "Direct order"
        )}
      </OrderFact>
    </div>
  );
}
export function OrderOverview({ order, options }) {
  return (
    <>
      <section className={styles.section}>
        <h2>
          <Building2 size={16} />
          Buyer &amp; agreed terms
        </h2>
        <p>
          {order.sourceQuotationId
            ? "Commercial terms preserved from the accepted quotation."
            : "Buyer and garment details captured for this order."}
        </p>
        <OrderCommercialTerms order={order} options={options} />
      </section>
      <section className={styles.section}>
        <h2>PO &amp; delivery</h2>
        <div className={`${styles.grid} ${styles.space}`}>
          <OrderFact label="Buyer PO">{order.buyerPoNumber}</OrderFact>
          <OrderFact label="PO date">{formatDate(order.buyerPoDate)}</OrderFact>
          <OrderFact label="Order date">
            {formatDate(order.orderDate)}
          </OrderFact>
          <OrderFact label="Requested delivery">
            {formatDate(order.requestedDeliveryDate)}
          </OrderFact>
          <OrderFact label="Shipping address">
            {addressLabel(order.shippingAddressSnapshot)}
          </OrderFact>
        </div>
      </section>
      <section className={styles.section}>
        <h2>
          <Layers3 size={16} />
          Garment breakdown
        </h2>
        <p>{order.lines.length} variants · Quantities in PCS</p>
      </section>
      <OrderLines order={order} />
      {order.publicNotes && (
        <section className={styles.section}>
          <h2>
            <FileText size={16} />
            Buyer-visible notes
          </h2>
          <div className={styles.notes}>{order.publicNotes}</div>
        </section>
      )}
      {order.internalNotes && (
        <section className={styles.section}>
          <h2>
            <LockKeyhole size={16} />
            Internal notes
          </h2>
          <p>For your team. Excluded from buyer documents.</p>
          <div className={styles.notes}>{order.internalNotes}</div>
        </section>
      )}
    </>
  );
}
