import { DataTypes as D, QueryTypes } from "sequelize";
import { randomUUID } from "node:crypto";
import {
  customerExtensions,
  contactExtensions,
  addressExtensions,
  customerTables,
  customerIndexes,
} from "../customer-schema.js";
import { snake } from "../schema.js";
import { env } from "../../config/env.js";
export const name = "005-customers";
const exists = async (db, table, key) => {
  const rows = await db.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
    { replacements: [table, key], type: QueryTypes.SELECT },
  );
  return rows.length > 0;
};
export async function up(db) {
  const qi = db.getQueryInterface();
  const customers = await db.query("SELECT * FROM customers", {
    type: QueryTypes.SELECT,
  });
  const contacts = await db.query("SELECT * FROM customer_contacts", {
    type: QueryTypes.SELECT,
  });
  const addresses = await db.query("SELECT * FROM customer_addresses", {
    type: QueryTypes.SELECT,
  });
  const issues = [];
  for (const c of customers) {
    const cs = contacts.filter((x) => x.customer_id === c.id),
      as = addresses.filter((x) => x.customer_id === c.id);
    if (
      !c.name?.trim() ||
      c.name.trim().length < 2 ||
      !c.payment_terms?.trim() ||
      !env.countries.includes(c.country) ||
      !["USD", "LKR", "GBP", "EUR"].includes(c.currency) ||
      !c.version
    )
      issues.push(`${c.id}: missing/invalid required customer fields`);
    if (
      cs.filter((x) => x.is_active && x.is_primary).length !== 1 ||
      cs.some((x) => !x.is_active && x.is_primary) ||
      cs.some(
        (x) =>
          x.is_active &&
          (!x.name?.trim() || !(x.email?.trim() || x.phone?.trim())),
      ) ||
      cs.length > 500 ||
      cs.filter((x) => x.is_active).length > 50
    )
      issues.push(`${c.id}: incomplete contacts or conflicting primary flags`);
    if (
      ["billing", "shipping"].some(
        (type) =>
          as.filter(
            (x) => x.address_type === type && x.is_active && x.is_default,
          ).length !== 1,
      ) ||
      as.some(
        (x) =>
          (!x.is_active && x.is_default) ||
          !["billing", "shipping"].includes(x.address_type) ||
          !x.line1?.trim() ||
          !x.city?.trim() ||
          !env.countries.includes(x.country),
      ) ||
      as.length > 500 ||
      as.filter((x) => x.is_active).length > 50
    )
      issues.push(`${c.id}: incomplete addresses or conflicting defaults`);
  }
  if (issues.length)
    throw new Error(
      "Customers migration preflight failed. Repair source master data explicitly; no rows were changed. " +
        issues.slice(0, 20).join("; "),
    );
  const legacy = customers.filter(
    (c) =>
      !c.created_by ||
      !c.updated_by ||
      (!c.is_active &&
        (!c.archived_at || !c.archived_by || !c.archive_reason?.trim())),
  );
  const operator = process.env.CUSTOMER_MIGRATION_ACTOR_ID;
  if (legacy.length) {
    const actors = operator
      ? await db.query(
          "SELECT id FROM users WHERE id=? AND role='Admin' AND is_active=1",
          { replacements: [operator], type: QueryTypes.SELECT },
        )
      : [];
    if (!actors.length)
      throw new Error(
        "Legacy customer provenance is unknown. Set CUSTOMER_MIGRATION_ACTOR_ID to an existing active Admin UUID to attribute schema adoption, not historical creation. No data was changed. A CustomerMigrated audit records the limitation.",
      );
    if (
      legacy.some((c) => !c.is_active && !c.archive_reason?.trim()) &&
      !process.env.CUSTOMER_LEGACY_ARCHIVE_REASON?.trim()
    )
      throw new Error(
        "Archived legacy customers lack a reason. Supply reviewed CUSTOMER_LEGACY_ARCHIVE_REASON before migration. No data was changed.",
      );
  }
  for (const [table, attrs] of Object.entries({
    customers: customerExtensions,
    customer_contacts: contactExtensions,
    customer_addresses: addressExtensions,
  })) {
    const present = await qi.describeTable(table);
    for (const [key, definition] of Object.entries(attrs)) {
      const field = snake(key);
      if (present[field]) continue;
      const { references, onDelete, onUpdate, defaultValue, ...column } =
        definition;
      await qi.addColumn(table, field, { ...column, allowNull: true });
    }
  }
  // Explicit adoption attribution only; never infer creator from owner or rewrite snapshots.
  await db.transaction(async (t) => {
    for (const c of legacy) {
      const when = new Date();
      await db.query(
        "UPDATE customers SET created_by=COALESCE(created_by,?),updated_by=COALESCE(updated_by,?),archived_at=IF(is_active,NULL,COALESCE(archived_at,?)),archived_by=IF(is_active,NULL,COALESCE(archived_by,?)),archive_reason=IF(is_active,NULL,IF(CHAR_LENGTH(TRIM(COALESCE(archive_reason,'')))=0,?,archive_reason)) WHERE id=?",
        {
          replacements: [
            operator,
            operator,
            when,
            operator,
            process.env.CUSTOMER_LEGACY_ARCHIVE_REASON?.trim() || null,
            c.id,
          ],
          transaction: t,
        },
      );
      await db.query(
        "INSERT INTO audit_events (id,entity_type,entity_id,actor_id,action,from_status,to_status,reason,metadata,created_at) VALUES (?,'customer',?,?,'CustomerMigrated',?,?,?,CAST(? AS JSON),?)",
        {
          replacements: [
            randomUUID(),
            c.id,
            operator,
            c.is_active ? "Active" : "Archived",
            c.is_active ? "Active" : "Archived",
            "Explicit schema-adoption attribution; original provenance unavailable",
            JSON.stringify({
              historicalCreatorUnknown: !c.created_by,
              historicalChildTimestampsUnknown: [
                ...contacts,
                ...addresses,
              ].some(
                (x) =>
                  x.customer_id === c.id && (!x.created_at || !x.updated_at),
              ),
            }),
            when,
          ],
          transaction: t,
        },
      );
    }
    for (const table of ["customer_contacts", "customer_addresses"])
      await db.query(
        `UPDATE ${table} SET created_at=COALESCE(created_at,UTC_TIMESTAMP(3)),updated_at=COALESCE(updated_at,UTC_TIMESTAMP(3))`,
        { transaction: t },
      );
  });
  for (const [table, attrs] of Object.entries({
    customers: customerExtensions,
    customer_contacts: contactExtensions,
    customer_addresses: addressExtensions,
  }))
    for (const [key, definition] of Object.entries(attrs)) {
      const { references, onDelete, onUpdate, ...column } = definition;
      await qi.changeColumn(table, snake(key), column);
    }
  for (const field of ["created_by", "updated_by", "archived_by"])
    if (!(await exists(db, "customers", `customer_${field}_fk`)))
      await qi.addConstraint("customers", {
        fields: [field],
        type: "foreign key",
        name: `customer_${field}_fk`,
        references: { table: "users", field: "id" },
        onDelete: "RESTRICT",
        onUpdate: "RESTRICT",
      });
  for (const [table, slot, expression, key, fields] of [
    [
      "customer_contacts",
      "active_primary_slot",
      "CASE WHEN is_active=1 AND is_primary=1 THEN 1 ELSE NULL END",
      "uq_customer_active_primary",
      ["customer_id", "active_primary_slot"],
    ],
    [
      "customer_addresses",
      "active_default_slot",
      "CASE WHEN is_active=1 AND is_default=1 THEN 1 ELSE NULL END",
      "uq_customer_default_address",
      ["customer_id", "address_type", "active_default_slot"],
    ],
  ]) {
    if (!(await qi.describeTable(table))[slot])
      await db.query(
        `ALTER TABLE ${table} ADD COLUMN ${slot} TINYINT GENERATED ALWAYS AS (${expression}) STORED`,
      );
    if (!(await exists(db, table, key)))
      await qi.addIndex(table, fields, { unique: true, name: key });
  }
  const checks = [
    [
      "customers",
      "customer_archive_consistency",
      "(is_active=1 AND archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL) OR (is_active=0 AND archived_at IS NOT NULL AND archived_by IS NOT NULL AND CHAR_LENGTH(TRIM(archive_reason))>0)",
    ],
    [
      "customers",
      "customer_required_defaults",
      "version>0 AND currency IN ('USD','LKR','GBP','EUR') AND CHAR_LENGTH(TRIM(payment_terms))>0",
    ],
    [
      "customer_contacts",
      "customer_contact_flags",
      "is_active IN (0,1) AND is_primary IN (0,1) AND (is_active=1 OR is_primary=0)",
    ],
    [
      "customer_addresses",
      "customer_address_flags",
      "is_active IN (0,1) AND is_default IN (0,1) AND (is_active=1 OR is_default=0) AND address_type IN ('billing','shipping')",
    ],
  ];
  for (const [table, key, expression] of checks)
    if (!(await exists(db, table, key)))
      await db.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${key} CHECK (${expression})`,
      );
  for (const [table, indexes] of Object.entries(customerIndexes)) {
    const present = await qi.showIndex(table);
    for (const index of indexes)
      if (!present.some((i) => i.name === index.name))
        await qi.addIndex(table, index.fields, index);
  }
  if (!(await qi.showAllTables()).includes("customer_code_sequences"))
    await qi.createTable(
      "customer_code_sequences",
      Object.fromEntries(
        Object.entries(customerTables.customer_code_sequences).map(([k, v]) => [
          snake(k),
          v,
        ]),
      ),
      { engine: "InnoDB", charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    );
  // One-time legacy reconciliation under the global migration advisory lock; runtime uses the sequence row lock.
  let next = 1n;
  for (const c of customers) {
    const match = /^CUS-([0-9]+)$/i.exec(c.code.trim());
    if (match && BigInt(match[1]) >= next) next = BigInt(match[1]) + 1n;
  }
  if (next >= 18446744073709551615n)
    throw new Error(
      "Customer code sequence exhausted; manual reconciliation required",
    );
  await db.query(
    "INSERT INTO customer_code_sequences (sequence_key,next_value,updated_at) VALUES ('CUSTOMER',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE next_value=GREATEST(next_value,VALUES(next_value))",
    { replacements: [next.toString()] },
  );
}
export async function down(db) {
  const [{ n }] = await db.query("SELECT COUNT(*) n FROM customers", {
    type: QueryTypes.SELECT,
  });
  if (Number(n))
    throw new Error(
      "Refusing destructive rollback: Customers records/history exist; customer records/history exist. Restore a reviewed backup or use a forward migration.",
    );
  const qi = db.getQueryInterface();
  for (const [table, key] of [
    ["customer_contacts", "uq_customer_active_primary"],
    ["customer_addresses", "uq_customer_default_address"],
  ])
    await qi.removeIndex(table, key);
  for (const [table, key] of [
    ["customers", "customer_archive_consistency"],
    ["customers", "customer_required_defaults"],
    ["customer_contacts", "customer_contact_flags"],
    ["customer_addresses", "customer_address_flags"],
  ])
    await qi.removeConstraint(table, key);
  for (const field of ["created_by", "updated_by", "archived_by"])
    await qi.removeConstraint("customers", `customer_${field}_fk`);
  for (const [table, indexes] of Object.entries(customerIndexes))
    for (const index of indexes) await qi.removeIndex(table, index.name);
  await qi.removeColumn("customer_contacts", "active_primary_slot");
  await qi.removeColumn("customer_addresses", "active_default_slot");
  for (const [table, attrs] of Object.entries({
    customers: customerExtensions,
    customer_contacts: contactExtensions,
    customer_addresses: addressExtensions,
  }))
    for (const key of Object.keys(attrs))
      if (key !== "paymentTerms") await qi.removeColumn(table, snake(key));
  await qi.changeColumn("customers", "payment_terms", {
    type: D.STRING(500),
    allowNull: true,
  });
  await qi.dropTable("customer_code_sequences");
}
