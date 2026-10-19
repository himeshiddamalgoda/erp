"use client";
import { useState } from "react";
import {
  Button,
  TextField,
  MenuItem,
  Alert,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  LinearProgress,
} from "@mui/material";
import {
  Download,
  History,
  Truck,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  ORDER_ACTIVITY_ACTIONS,
  ORDER_ACTIVITY_LABELS,
} from "@/constants/sales-orders";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatQuantity, addressLabel } from "@/utils/format";
import { OrderLines, OrderFact } from "./order-overview";
import { OrderPagination } from "./order-pagination";
import styles from "../sales-orders.module.css";
export function OrderRevisions({
  data,
  meta,
  params,
  onChange,
  onPdf,
  downloading,
}) {
  return (
    <>
      {!data?.length ? (
        <div className={styles.empty}>
          <History size={30} />
          <h2>No document revisions yet</h2>
          <p>
            Manager confirmation creates revision 1. Draft PDF downloads show
            the current Draft.
          </p>
        </div>
      ) : (
        data.map((r) => (
          <Revision
            key={r.revision}
            revision={r}
            onPdf={onPdf}
            downloading={downloading}
          />
        ))
      )}
      <OrderPagination meta={meta} {...params} onChange={onChange} />
    </>
  );
}
function Revision({ revision: r, onPdf, downloading }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.revision}>
      <div className={styles.revisionTop}>
        <div>
          <h3>Document revision {r.revision}</h3>
          <span className={styles.sub}>
            {formatDate(r.createdAt)} ·{" "}
            {r.createdBy ? "Manager recorded" : "Legacy record"}
          </span>
        </div>
        <div className={styles.buttons}>
          <Button
            onClick={() => setOpen((v) => !v)}
            endIcon={open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            aria-expanded={open}
          >
            {open ? "Hide snapshot" : "View snapshot"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download size={14} />}
            disabled={downloading}
            onClick={() => onPdf(r.revision)}
          >
            Download R{r.revision}
          </Button>
        </div>
      </div>
      <p>{r.reason}</p>
      {r.buyerReference && <p>Buyer reference: {r.buyerReference}</p>}
      {open && (
        <div className={styles.snapshot}>
          <div className={styles.two}>
            <OrderFact label="Seller / buyer">
              {r.snapshot.seller.name}
              <small>{r.snapshot.customerSnapshot?.name}</small>
            </OrderFact>
            <OrderFact label="Buyer PO">{r.snapshot.buyerPoNumber}</OrderFact>
            <OrderFact label="Delivery">
              {formatDate(r.snapshot.requestedDeliveryDate)}
            </OrderFact>
            <OrderFact label="Shipping">
              {addressLabel(r.snapshot.shippingAddressSnapshot)}
            </OrderFact>
            <OrderFact label="Payment terms">
              {r.snapshot.paymentTerms}
            </OrderFact>
            <OrderFact label="Buyer-visible notes">
              {r.snapshot.publicNotes}
            </OrderFact>
          </div>
          <div className={styles.space}>
            <OrderLines order={r.snapshot} />
          </div>
        </div>
      )}
    </section>
  );
}
export function OrderActivity({ data, meta, params, onChange }) {
  return (
    <>
      <div className={styles.filters}>
        <TextField
          select
          label="Activity type"
          value={params.action || ""}
          className={styles.filter}
          onChange={(e) => onChange({ action: e.target.value, page: 1 })}
        >
          <MenuItem value="">All activity</MenuItem>
          {ORDER_ACTIVITY_ACTIONS.map((a) => (
            <MenuItem key={a} value={a}>
              {ORDER_ACTIVITY_LABELS[a] || a}
            </MenuItem>
          ))}
        </TextField>
      </div>
      {!data?.length ? (
        <div className={styles.empty}>
          <History size={30} />
          <h2>No matching activity</h2>
          <p>
            Changes to this order and accepted fulfilment events appear here.
          </p>
        </div>
      ) : (
        data.map((e) => (
          <div className={styles.event} key={e.id}>
            <span className={styles.eventIcon}>
              <History size={13} />
            </span>
            <div>
              <h3>{ORDER_ACTIVITY_LABELS[e.action] || e.action}</h3>
              <p>
                {e.actor?.displayName || "System / integration"}
                {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
                  ? ` · ${e.fromStatus} → ${e.toStatus}`
                  : ""}
              </p>
              {e.reason && <p className={styles.notes}>{e.reason}</p>}
              {e.metadata?.buyerReference && (
                <p>Buyer reference: {e.metadata.buyerReference}</p>
              )}
              {e.metadata?.shippingChange && <p>Shipping address updated</p>}
              <time dateTime={e.occurredAt}>
                {formatDate(e.occurredAt, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </div>
        ))
      )}
      <OrderPagination meta={meta} {...params} onChange={onChange} />
    </>
  );
}
export function OrderDelivery({ data }) {
  return (
    <>
      <div className={styles.section}>
        <h2>
          <Truck size={17} />
          Delivery progress
        </h2>
        <p>
          Completion is checked for each size and colour. Shipment events do not
          count as delivered pieces.
        </p>
        <Alert
          severity={data.source === "demo" ? "info" : "success"}
          icon={<Info size={17} />}
        >
          {data.source === "demo"
            ? "Demo feed. Delivery events are supplied through development fixtures."
            : "Integration feed. Progress comes from accepted delivery events."}
        </Alert>
      </div>
      <div className={styles.summaryStrip}>
        {[
          ["Ordered", data.orderedQty],
          ["Delivered", data.deliveredQty],
          ["Remaining", data.remainingQty],
        ].map(([l, v]) => (
          <div key={l}>
            <span className={styles.factLabel}>{l}</span>
            <strong>
              {formatQuantity(v)} <span className={styles.sub}>PCS</span>
            </strong>
          </div>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <Table className={styles.table} aria-label="Delivery by garment line">
          <TableHead>
            <TableRow>
              {[
                "Style / variant",
                "Ordered",
                "Delivered",
                "Remaining",
                "Progress",
              ].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.lines.map((l) => (
              <TableRow key={l.orderLineId}>
                <TableCell>
                  {l.styleCode}
                  <span className={styles.sub}>
                    {l.colour} / {l.size}
                  </span>
                </TableCell>
                <TableCell>{formatQuantity(l.orderedQty)}</TableCell>
                <TableCell>{formatQuantity(l.deliveredQty)}</TableCell>
                <TableCell>{formatQuantity(l.remainingQty)}</TableCell>
                <TableCell className={styles.progressCell}>
                  <LinearProgress
                    variant="determinate"
                    value={
                      l.orderedQty ? (l.deliveredQty / l.orderedQty) * 100 : 0
                    }
                    aria-label={`${l.styleCode} ${l.colour} ${l.size} delivery progress`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className={styles.section}>
        <h2>Latest fulfilment events</h2>
        {data.latestEvents.length ? (
          data.latestEvents.map((e) => (
            <div key={e.id} className={styles.event}>
              <div className={styles.eventIcon}>
                <Truck size={13} />
              </div>
              <div>
                <h3>{ORDER_ACTIVITY_LABELS[e.eventType] || e.eventType}</h3>
                <p>
                  {e.provider} · {e.externalReference || e.externalEventId}
                </p>
                <time>
                  {formatDate(e.occurredAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
          ))
        ) : (
          <p>No fulfilment events. Every garment line remains undelivered.</p>
        )}
        <p className={styles.space}>
          Latest 20 events shown. Open Activity for the paginated timeline.
        </p>
      </div>
    </>
  );
}
export function OrderHandoff({ order }) {
  const h = order.handoff;
  return (
    <div className={styles.card}>
      <h2>
        <Truck size={15} />
        PRODUCTION HANDOFF
      </h2>
      {h ? (
        <>
          <StatusBadge status={h.status} />
          {order.isOnHold && <span className={styles.hold}>On hold</span>}
          <p className={`${styles.hint} ${styles.space}`}>
            {h.status === "Queued"
              ? order.isOnHold
                ? "Local dispatch is paused. A manager can resume when the buyer confirms."
                : "Ready for dispatch. Production progress appears in Delivery when activity is recorded."
              : ["Claimed", "Failed"].includes(h.status)
                ? "External outcome needs reconciliation. Local amendments and cancellation are blocked."
                : "The handoff has left the local queue."}
          </p>
          <div className={styles.sideFact}>
            <span>Document revision</span>
            <strong>R{h.documentRevision}</strong>
          </div>
          <div className={styles.sideFact}>
            <span>Dispatch attempts</span>
            <strong>{h.attemptCount}</strong>
          </div>
          {h.externalReference && (
            <div className={styles.fact}>{h.externalReference}</div>
          )}
        </>
      ) : (
        <p className={styles.hint}>
          No production handoff has been created for this order. Manager
          confirmation queues a handoff.
        </p>
      )}
    </div>
  );
}
