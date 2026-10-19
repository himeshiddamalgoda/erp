import Link from "next/link";
import { Alert, Button, TablePagination } from "@mui/material";
import { ROUTES } from "@/constants/routes";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/utils/format";
import styles from "../customers.module.css";
export function CustomerStatus({ status }) {
  return (
    <span
      className={`${styles.badge} ${status === "Active" ? styles.active : ""}`}
    >
      {status}
    </span>
  );
}
export function CustomerBlockers({ details, newTab = false }) {
  if (!details?.blockerCount) return null;
  return (
    <Alert severity="warning">
      <strong>
        {details.blockerCount} open document
        {details.blockerCount === 1 ? "" : "s"} must be resolved.
      </strong>
      {details.restrictedBlockers && (
        <p>
          Some documents are outside your access. Ask their owning team to
          resolve them.
        </p>
      )}
      <ul className={styles.blockers}>
        {details.archiveBlockers.map((b) => (
          <li key={`${b.entityType}:${b.id}`}>
            <Link
              target={newTab ? "_blank" : undefined}
              rel={newTab ? "noopener noreferrer" : undefined}
              href={
                b.entityType === "quotation"
                  ? ROUTES.quotation(b.id)
                  : ROUTES.salesOrder(b.id)
              }
            >
              {b.number}
            </Link>{" "}
            · <StatusBadge status={b.status} />
            {b.validityEnded &&
              " · Validity ended; resolve through the quotation workflow."}
          </li>
        ))}
      </ul>
      {details.blockerCount > details.archiveBlockers.length && (
        <small>Showing up to 20 authorized examples.</small>
      )}
    </Alert>
  );
}
export function CustomerPagination({
  meta,
  filters,
  onChange,
  disabled = false,
}) {
  const page = Math.min(
    filters.page - 1,
    Math.max(0, Math.ceil((meta?.total || 0) / filters.pageSize) - 1),
  );
  return (
    <TablePagination
      component="div"
      count={meta?.total || 0}
      page={page}
      rowsPerPage={filters.pageSize}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onPageChange={(_, index) => onChange({ page: index + 1 })}
      onRowsPerPageChange={(e) =>
        onChange({ page: 1, pageSize: Number(e.target.value) })
      }
      slotProps={{
        actions: {
          nextButton: {
            disabled:
              disabled || filters.page * filters.pageSize >= (meta?.total || 0),
          },
          previousButton: { disabled: disabled || filters.page <= 1 },
        },
      }}
    />
  );
}
export function CustomerDocuments({ data, kind, onReset }) {
  return (
    <div className={styles.table}>
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Status</th>
            <th>Currency</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id}>
              <td>
                <Link
                  href={
                    kind === "quotations"
                      ? ROUTES.quotation(d.id)
                      : ROUTES.salesOrder(d.id)
                  }
                >
                  {d.quoteNumber || d.orderNumber}
                </Link>
                {d.revision && <small>Revision {d.revision}</small>}
              </td>
              <td>
                <StatusBadge status={d.status} />
              </td>
              <td>{d.currency}</td>
              <td>{formatMoney(d.total, d.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && (
        <div className={styles.empty}>
          No {kind === "quotations" ? "quotations" : "sales orders"} visible for
          this customer.{onReset && <Button onClick={onReset}>Refresh</Button>}
        </div>
      )}
    </div>
  );
}
