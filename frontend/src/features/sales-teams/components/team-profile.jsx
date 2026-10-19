import { Alert, Button } from "@mui/material";
import { formatDate } from "@/utils/format";
import { TeamBlockers } from "./team-shared";
import styles from "../sales-teams.module.css";
export function TeamProfile({ team, includeInactive, onIncludeInactive }) {
  const summary = team.assignmentSummary;
  return (
    <>
      <div className={styles.stats}>
        {[
          ["Active customers", summary.activeCustomerCount],
          ["Open quotation revisions", summary.openQuotationCount],
          ["Open sales orders", summary.openSalesOrderCount],
        ].map(([label, n]) => (
          <div key={label} className={styles.stat}>
            <span>{label}</span>
            <strong>{n}</strong>
            <span>
              {summary.countsScope === "all-company"
                ? "Company assignments"
                : "Assignments visible to your workspace"}
            </span>
          </div>
        ))}
      </div>
      {team.integrityWarnings.map((w, i) => (
        <Alert
          key={`${w.code}:${i}`}
          severity={w.code.startsWith("LEGACY") ? "info" : "warning"}
          className={styles.notice}
        >
          {w.message}
        </Alert>
      ))}
      <TeamBlockers details={summary} />
      <section className={`${styles.panel} ${styles.section}`}>
        <h2>Team profile</h2>
        <dl className={styles.facts}>
          {[
            ["Description", team.description || "—"],
            ["Manager", team.manager?.displayName || "Requires repair"],
            [
              "Assignment eligibility",
              team.eligibleForAssignment
                ? "Eligible for new assignments"
                : team.status === "Archived"
                  ? "Archived; new assignments disabled"
                  : "Repair required before new assignments",
            ],
            ["Version", team.version],
            [
              "Created",
              team.createdAt ? formatDate(team.createdAt) : "Unknown (legacy)",
            ],
            [
              "Updated",
              team.updatedAt ? formatDate(team.updatedAt) : "Unknown (legacy)",
            ],
            ...(team.status === "Archived"
              ? [
                  [
                    "Archived",
                    team.archivedAt
                      ? formatDate(team.archivedAt)
                      : "Unknown (legacy)",
                  ],
                  ["Archive reason", team.archiveReason || "Unknown (legacy)"],
                ]
              : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.panel}>
        <div className={`${styles.section} ${styles.row} ${styles.between}`}>
          <div>
            <h2>Members</h2>
            <p className={styles.muted}>
              {team.activeMemberCount} active · {team.eligibleMemberCount}{" "}
              eligible
            </p>
          </div>
          <Button onClick={() => onIncludeInactive(!includeInactive)}>
            {includeInactive
              ? "Hide removed members"
              : "Show membership history"}
          </Button>
        </div>
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Team role</th>
                <th>Membership</th>
                <th>Account</th>
                <th>Joined</th>
                <th>Last activated</th>
                <th>Removed</th>
              </tr>
            </thead>
            <tbody>
              {team.members
                .filter((m) => includeInactive || m.membershipActive)
                .map((m) => (
                  <tr key={m.userId}>
                    <td>{m.displayName}</td>
                    <td>{m.teamRole}</td>
                    <td>{m.membershipActive ? "Active" : "Removed"}</td>
                    <td>{m.userActive ? "Active" : "Inactive"}</td>
                    <td>
                      {m.joinedAt ? formatDate(m.joinedAt) : "Unknown (legacy)"}
                    </td>
                    <td>
                      {m.lastActivatedAt
                        ? formatDate(m.lastActivatedAt)
                        : "Unknown (legacy)"}
                    </td>
                    <td>
                      {m.removedAt
                        ? formatDate(m.removedAt)
                        : m.membershipActive
                          ? "—"
                          : "Unknown (legacy)"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
