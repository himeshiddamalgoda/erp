import { schemas, indexes, snake } from "../schema.js";
export const name = "001-quotation-schema";
export async function up(db) {
  const qi = db.getQueryInterface();
  // Deliberately refuse existing unmanaged tables: do not replace master data.
  for (const [table, attrs] of Object.entries(schemas)) {
    await qi.createTable(
      table,
      Object.fromEntries(Object.entries(attrs).map(([k, v]) => [snake(k), v])),
      { engine: "InnoDB", charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    );
    for (const index of indexes[table] || [])
      await qi.addIndex(table, index.fields, index);
  }
  const statuses =
    "'Draft','PendingApproval','Approved','Issued','Accepted','Declined','Expired','Superseded','Cancelled','Converted'";
  await db.query(
    `ALTER TABLE quotations ADD CONSTRAINT quotation_status_check CHECK (status IN (${statuses}))`,
  );
  for (const table of ["quotation_lines", "sales_order_lines"]) {
    await db.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${table}_values_check CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0 AND uom = 'PCS')`,
    );
  }
  await db.query(
    "ALTER TABLE customer_addresses ADD CONSTRAINT address_type_check CHECK (address_type IN ('billing','shipping'))",
  );
}
export async function down(db) {
  const qi = db.getQueryInterface();
  for (const table of Object.keys(schemas).reverse()) await qi.dropTable(table);
}
