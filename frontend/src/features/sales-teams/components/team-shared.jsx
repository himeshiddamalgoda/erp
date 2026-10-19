import Link from "next/link";
import { Alert, TablePagination } from "@mui/material";
import { entityHref } from "@/constants/sales-teams";
import styles from "../sales-teams.module.css";
export function TeamStatus({ status }) {
  return (
    <span
      className={`${styles.badge} ${status === "Active" ? styles.active : ""}`}
    >
      {status}
    </span>
  );
}
export function TeamBlockers({ details }) {
  if (!details || (!details.blockerCount && !details.restrictedBlockers))
    return null;
  return (
    <Alert severity="warning">
      <strong>
        {details.blockerCount
          ? `${details.blockerCount} visible assignments must be resolved.`
          : "Assignments must be resolved before continuing."}
      </strong>
      {details.restrictedBlockers && (
        <p>Additional assignments must be resolved by their authorized team.</p>
      )}
      <ul className={styles.blockers}>
        {(details.blockers || []).map((b) => (
          <li key={`${b.entityType}:${b.id}`}>
            <Link
              href={entityHref(b.entityType, b.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {b.number || b.id}
            </Link>{" "}
            · {b.status}
            {b.entityType === "quotation" &&
              b.status === "Issued" &&
              b.validityEnded &&
              " · Validity ended; resolve through the quotation workflow."}
          </li>
        ))}
      </ul>
      {details.blockerCount > (details.blockers || []).length && (
        <small>
          Showing up to 20 authorized examples. Use the assignment tabs to
          review more.
        </small>
      )}
    </Alert>
  );
}
export function TeamPagination({ meta, filters, onChange, disabled }) {
  return (
    <TablePagination
      component="div"
      count={meta?.total || 0}
      page={Math.min(
        filters.page - 1,
        Math.max(0, Math.ceil((meta?.total || 0) / filters.pageSize) - 1),
      )}
      rowsPerPage={filters.pageSize}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onPageChange={(_, i) => onChange({ page: i + 1 })}
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
