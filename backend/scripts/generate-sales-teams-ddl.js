import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSequelize } from "../src/db/sequelize.js";
const db = createSequelize();
try {
  let ddl =
    "-- MySQL8.4 after 006-sales-teams. Reference only: run migrations on existing data.\n-- Legacy provenance columns deliberately nullable; all new service writes fully populate them.\n-- Reuses existing users/customers/quotations/sales_orders/audit/idempotency.\n\n";
  for (const table of [
    "sales_teams",
    "sales_team_members",
    "team_code_sequences",
  ]) {
    const [rows] = await db.query(`SHOW CREATE TABLE \`${table}\``);
    ddl += rows[0]["Create Table"] + ";\n\n";
  }
  for (const table of ["customers", "quotations", "sales_orders"]) {
    const [rows] = await db.query(`SHOW INDEX FROM \`${table}\``);
    const indexes = new Map();
    for (const row of rows.filter((r) =>
      [
        "customer_team_owner_active_idx",
        "quote_team_owner_status_idx",
        "order_team_owner_status_idx",
      ].includes(r.Key_name),
    )) {
      if (!indexes.has(row.Key_name)) indexes.set(row.Key_name, []);
      indexes.get(row.Key_name).push(row.Column_name);
    }
    for (const [name, fields] of indexes)
      ddl += `-- Added assignment-query index\nCREATE INDEX \`${name}\` ON \`${table}\` (${fields.map((f) => "`" + f + "`").join(", ")});\n`;
  }
  writeFileSync(
    fileURLToPath(new URL("../docs/sales-teams.schema.sql", import.meta.url)),
    ddl,
  );
  console.log(
    "Exported team table definitions and assignment indexes (no data)",
  );
} finally {
  await db.close();
}
