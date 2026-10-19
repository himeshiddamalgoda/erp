import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSequelize } from "../src/db/sequelize.js";
const db = createSequelize();
try {
  const tables = [
    "customers",
    "customer_contacts",
    "customer_addresses",
    "customer_code_sequences",
    "audit_events",
    "idempotency_keys",
  ];
  let sql =
    "-- MySQL 8.4 DDL exported after migration 005-customers.\n-- Reference only: use npm run migrate against existing installations.\n-- Reuses existing users, sales_teams, quotation and sales order tables.\n-- Generated slot columns are database-managed and excluded from ORM write attributes.\n\n";
  for (const table of tables) {
    const [rows] = await db.query(`SHOW CREATE TABLE \`${table}\``);
    sql += rows[0]["Create Table"] + ";\n\n";
  }
  writeFileSync(
    fileURLToPath(new URL("../docs/customers.schema.sql", import.meta.url)),
    sql,
  );
  console.log("Exported 6 table definitions (no data)");
} finally {
  await db.close();
}
