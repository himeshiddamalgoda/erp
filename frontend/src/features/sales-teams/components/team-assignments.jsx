import Link from "next/link";
import { Button } from "@mui/material";
import { canReassign, entityHref } from "@/constants/sales-teams";
import styles from "../sales-teams.module.css";
const open = {
  quotation: ["Draft", "PendingApproval", "Approved", "Issued", "Accepted"],
  salesOrder: [
    "Draft",
    "Confirmed",
    "InProgress",
    "PartiallyDelivered",
    "Delivered",
  ],
};
export function TeamAssignments({ data, type, actor, onReassign }) {
  return (
    <div className={styles.table}>
      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id}>
              <td>
                <Link href={entityHref(type, d.id)}>
                  {d.name || d.quoteNumber || d.orderNumber || d.code}
                </Link>
                {d.revision && <small>Revision {d.revision}</small>}
              </td>
              <td>{d.status}</td>
              <td>{d.owner?.displayName || d.ownerName || d.ownerId || "—"}</td>
              <td>
                {canReassign(actor, type) &&
                  (type === "customer" || open[type].includes(d.status)) && (
                    <Button
                      onClick={() =>
                        onReassign({
                          type,
                          id: d.id,
                          label: d.name || d.quoteNumber || d.orderNumber,
                        })
                      }
                    >
                      Reassign
                    </Button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && (
        <div className={styles.empty}>No assignments visible in this tab.</div>
      )}
    </div>
  );
}
