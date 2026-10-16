export const name = "003-commercial-guards";
const checks = [
  [
    "users",
    "user_role_check",
    "role IN ('Sales','SalesManager','Admin','Viewer')",
  ],
  ...["quotations", "sales_orders"].map((table) => [
    table,
    `${table}_commercial_check`,
    "currency IN ('USD','LKR','GBP','EUR') AND subtotal >= 0 AND total = subtotal AND version > 0",
  ]),
  [
    "quotations",
    "quotation_dates_check",
    "(valid_until IS NULL OR valid_until >= quotation_date) AND (requested_delivery_date IS NULL OR requested_delivery_date >= quotation_date)",
  ],
  [
    "idempotency_keys",
    "idempotency_state_check",
    "state IN ('pending','completed')",
  ],
];
export async function up(db) {
  // MySQL DDL commits independently; tolerate already-added checks on a resumed run.
  for (const [table, name, expression] of checks) {
    const [rows] = await db.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
      { replacements: [table, name] },
    );
    if (!rows.length)
      await db.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expression})`,
      );
  }
}
export async function down(db) {
  for (const [table, name] of checks.toReversed())
    await db.query(`ALTER TABLE ${table} DROP CHECK ${name}`);
}
