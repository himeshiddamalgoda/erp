export const name = "002-family-links";
const links = {
  active_issued_revision_id: "quotations",
  accepted_revision_id: "quotations",
  converted_order_id: "sales_orders",
};
export async function up(db) {
  for (const [field, table] of Object.entries(links))
    await db
      .getQueryInterface()
      .addConstraint("quotation_families", {
        fields: [field],
        type: "foreign key",
        name: `family_${field}_fk`,
        references: { table, field: "id" },
        onDelete: "RESTRICT",
        onUpdate: "RESTRICT",
      });
}
export async function down(db) {
  for (const field of Object.keys(links))
    await db
      .getQueryInterface()
      .removeConstraint("quotation_families", `family_${field}_fk`);
}
