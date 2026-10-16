import Link from "next/link";
import { Button } from "@mui/material";
import {
  ArrowUpRight,
  Check,
  Clock3,
  FileText,
  History,
  Link2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROUTES } from "@/constants/routes";
import { formatDate, formatMoney, formatQuantity } from "@/utils/format";
import styles from "../quotations.module.css";
const actionNames = {
  create: "Draft created",
  update: "Draft updated",
  submit: "Submitted for approval",
  approve: "Quotation approved",
  reject: "Submission rejected",
  withdraw: "Submission withdrawn",
  issue: "Offer issued",
  "buyer-response": "Buyer response recorded",
  revision: "Replacement revision requested",
  create_revision: "Draft revision created",
  supersession: "Offer superseded",
  void: "Offer cancelled",
  expiry: "Offer expired",
  convert: "Converted to Draft order",
  delete: "Draft deleted",
};
export function QuotationRevisions({ quotation }) {
  return (
    <div>
      {quotation.revisions.map((revision) => (
        <div className={styles.revisionCard} key={revision.id}>
          <div>
            <h3>
              Revision {revision.revision}
              <StatusBadge status={revision.status} />
              {revision.id === quotation.id && (
                <span className={styles.revisionPill}>CURRENT VIEW</span>
              )}
            </h3>
            <p>
              Version {revision.version}
              {revision.priorRevisionId
                ? " · Replacement revision"
                : " · Original quotation"}
            </p>
          </div>
          {revision.id !== quotation.id && (
            <Button
              component={Link}
              href={ROUTES.quotation(revision.id)}
              size="small"
              endIcon={<ArrowUpRight size={14} />}
            >
              View
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
export function QuotationActivity({ quotation }) {
  return (
    <div className={styles.activity}>
      {quotation.audit.length ? (
        quotation.audit
          .slice()
          .reverse()
          .map((event) => (
            <div key={event.id} className={styles.event}>
              <span className={styles.eventIcon}>
                <History size={13} />
              </span>
              <div>
                <h3>{actionNames[event.action] || event.action}</h3>
                <p>
                  {event.fromStatus &&
                  event.toStatus &&
                  event.fromStatus !== event.toStatus
                    ? `${event.fromStatus} → ${event.toStatus}`
                    : event.actorId
                      ? "Team activity"
                      : "System activity"}
                </p>
                {event.reason && (
                  <div className={styles.reasonBlock}>{event.reason}</div>
                )}
                <time dateTime={event.createdAt}>
                  {formatDate(event.createdAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
          ))
      ) : (
        <p className={styles.fieldHelp}>No activity recorded.</p>
      )}
    </div>
  );
}
export function QuotationSidebar({ quotation }) {
  const stages = [
    { label: "Draft created", date: quotation.createdAt, done: true },
    {
      label: "Submitted for review",
      date: quotation.submittedAt,
      done: Boolean(quotation.submittedAt),
    },
    {
      label: "Approved",
      date: quotation.approvedAt,
      done: Boolean(quotation.approvedAt),
    },
    {
      label: "Issued to buyer",
      date: quotation.issuedAt,
      done: Boolean(quotation.issuedAt),
    },
    {
      label:
        quotation.buyerDecision === "Declined"
          ? "Buyer declined"
          : "Buyer accepted",
      date: quotation.buyerResponseAt,
      done: Boolean(quotation.buyerResponseAt),
    },
    {
      label: "Draft order created",
      date: quotation.status === "Converted" ? quotation.updatedAt : null,
      done: Boolean(quotation.salesOrderId),
    },
  ];
  const terminal =
    ["Declined", "Expired", "Cancelled", "Superseded"].includes(
      quotation.status,
    ) ||
    (quotation.status === "Draft" && quotation.familyLocked);
  const current = terminal ? -1 : stages.findIndex((stage) => !stage.done);
  return (
    <aside className={styles.detailAside}>
      <div className={styles.sidePanel}>
        <h2 className={styles.sideHeading}>
          <Clock3 size={14} />
          QUOTATION JOURNEY
        </h2>
        {stages.map((stage, index) => (
          <div className={styles.step} key={stage.label}>
            <span
              className={`${styles.stepDot} ${stage.done ? styles.stepDone : index === current ? styles.stepCurrent : ""}`}
            >
              {stage.done ? <Check size={10} /> : index + 1}
            </span>
            <div>
              <div className={styles.stepTitle}>{stage.label}</div>
              <div className={styles.stepDate}>
                {stage.date
                  ? formatDate(stage.date)
                  : quotation.status === "Declined" ||
                      quotation.status === "Cancelled" ||
                      quotation.status === "Expired" ||
                      quotation.status === "Superseded"
                    ? "—"
                    : "Not yet"}
              </div>
            </div>
          </div>
        ))}
        <div className={styles.sideDivider} />
        <div className={styles.sideFact}>
          <span>Current revision</span>
          <strong>R{quotation.revision}</strong>
        </div>
        <div className={styles.sideFact}>
          <span>Record version</span>
          <strong>{quotation.version}</strong>
        </div>
        <div className={styles.sideFact}>
          <span>Currency</span>
          <strong>{quotation.currency}</strong>
        </div>
      </div>
      <div className={styles.sidePanel}>
        <h2 className={styles.sideHeading}>
          <FileText size={14} />
          OFFER SUMMARY
        </h2>
        <div className={styles.sideFact}>
          <span>Garment variations</span>
          <strong>{quotation.lines.length}</strong>
        </div>
        <div className={styles.sideFact}>
          <span>Total quantity</span>
          <strong>{formatQuantity(quotation.totalQty)} PCS</strong>
        </div>
        <div className={styles.sideFact}>
          <span>Quotation total</span>
          <strong>{formatMoney(quotation.total, quotation.currency)}</strong>
        </div>
        <div className={styles.sideDivider} />
        <p className={styles.fieldHelp}>
          Every revision keeps a clear commercial history. Only one accepted
          offer can be converted for this family.
        </p>
        {quotation.linkedOrder && (
          <div className={styles.linkedOrder}>
            <span className={styles.infoLabel}>
              <Link2 size={12} /> LINKED SALES ORDER
            </span>
            <h3>{quotation.linkedOrder.orderNumber}</h3>
            <StatusBadge
              status={
                quotation.linkedOrder.archived
                  ? "Cancelled"
                  : quotation.linkedOrder.status
              }
            />
            <p>
              {quotation.linkedOrder.archived
                ? "This linked order has been archived. Conversion will not create another order."
                : "Created as a Draft from the accepted quotation."}
            </p>
            <div className={styles.infoValue}>
              {formatMoney(
                quotation.linkedOrder.total,
                quotation.linkedOrder.currency,
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
