import { FormControlLabel, Switch, Chip } from "@mui/material";
import { formatDate } from "@/utils/format";
import { CustomerBlockers } from "./customer-shared";
import styles from "../customers.module.css";
function Facts({ items }) {
  return (
    <dl className={styles.facts}>
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function CustomerProfile({
  customer: c,
  includeInactive,
  onIncludeInactive,
}) {
  const s = c.commercialSummary;
  return (
    <>
      <div className={styles.stats}>
        {[
          ["Open quotations", s.openQuotationCount],
          ["Draft orders", s.draftOrderCount],
          ["Active orders", s.activeOrderCount],
        ].map(([name, count]) => (
          <div key={name} className={styles.stat}>
            <span>{name}</span>
            <strong>{count}</strong>
            <span>
              {s.countsScope === "all-company"
                ? "Across the company"
                : "Within your document access"}
            </span>
          </div>
        ))}
      </div>
      <CustomerBlockers details={s} />
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Company details</h2>
          <Facts
            items={[
              ["Legal name", c.name],
              ["Display name", c.displayName],
              ["Country", c.country],
              ["Default currency", c.currency],
              ["Payment terms", c.paymentTerms],
              ["Registration number", c.registrationNumber],
              ["Business email", c.email],
              ["Business phone", c.phone],
              ["Website", c.website],
              ["Sales team", c.salesTeam.name],
              ["Owner", c.owner.displayName],
              ["Last updated", formatDate(c.updatedAt)],
            ]}
          />
        </section>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Internal notes</h2>
          <Facts items={[["Staff notes", c.internalNotes]]} />
          <p className={styles.muted}>
            Internal notes stay inside your workspace and are excluded from
            buyer PDFs.
          </p>
          {c.status === "Archived" && (
            <>
              <h2>Archive record</h2>
              <Facts
                items={[
                  ["Archived on", formatDate(c.archivedAt)],
                  ["Reason", c.archiveReason],
                ]}
              />
            </>
          )}
        </section>
      </div>
      <FormControlLabel
        control={
          <Switch
            checked={includeInactive}
            onChange={(_, v) => onIncludeInactive(v)}
          />
        }
        label="Show inactive contacts and addresses"
      />
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Contacts</h2>
          <div className={styles.stack}>
            {c.contacts.map((contact) => (
              <article
                className={`${styles.child} ${!contact.isActive ? styles.inactive : ""}`}
                key={contact.id}
              >
                <div className={styles.childHead}>
                  <strong>{contact.name}</strong>
                  <div className={styles.row}>
                    {contact.primary && (
                      <Chip label="Primary" size="small" color="primary" />
                    )}
                    {!contact.isActive && (
                      <Chip label="Inactive" size="small" />
                    )}
                  </div>
                </div>
                <p className={styles.muted}>{contact.jobTitle}</p>
                <p>
                  {[contact.email, contact.phone].filter(Boolean).join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Addresses</h2>
          <div className={styles.stack}>
            {c.addresses.map((a) => (
              <article
                className={`${styles.child} ${!a.isActive ? styles.inactive : ""}`}
                key={a.id}
              >
                <div className={styles.childHead}>
                  <strong>
                    {a.label ||
                      `${a.addressType === "billing" ? "Billing" : "Shipping"} address`}
                  </strong>
                  <div className={styles.row}>
                    <Chip label={a.addressType} size="small" />
                    {a.isDefault && (
                      <Chip label="Default" size="small" color="primary" />
                    )}
                    {!a.isActive && <Chip label="Inactive" size="small" />}
                  </div>
                </div>
                <p>
                  {[a.line1, a.line2, a.city, a.region, a.postalCode, a.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
      <p className={styles.muted}>
        Master changes supply future document defaults. Existing documents keep
        their selected warehouse and frozen commercial snapshots.
      </p>
    </>
  );
}
