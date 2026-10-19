import { DataTypes as D } from "sequelize";
import {
  orderExtensions,
  orderTables,
  orderIndexes,
} from "../sales-order-schema.js";
import { snake } from "../schema.js";
import { businessDate, env } from "../../config/env.js";
export const name = "004-sales-orders";
const has = async (db, table, constraint) => {
  const [r] = await db.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
    { replacements: [table, constraint] },
  );
  return r.length > 0;
};
export async function up(db) {
  const qi = db.getQueryInterface();
  // Preflight before additive DDL. Never repair conflicts by deleting commercial data.
  const [bad] = await db.query(
    "SELECT id FROM sales_orders WHERE status NOT IN ('Draft','Confirmed','InProgress','PartiallyDelivered','Delivered','Closed','Cancelled') OR version=0 LIMIT 10",
  );
  const [duplicates] = await db.query(
    "SELECT customer_id, UPPER(TRIM(buyer_po_number)) COLLATE utf8mb4_0900_bin AS po, COUNT(*) AS n FROM sales_orders WHERE deleted_at IS NULL AND status <> 'Cancelled' AND TRIM(COALESCE(buyer_po_number,'')) <> '' GROUP BY customer_id,po HAVING n>1 LIMIT 10",
  );
  if (bad.length || duplicates.length)
    throw new Error(
      "Sales order migration preflight failed: incompatible status/version or duplicate normalized active buyer PO. Resolve legacy conflicts before rerunning. IDs: " +
        bad.map((r) => r.id).join(",") +
        "; conflicting buyer IDs: " +
        duplicates.map((r) => r.customer_id).join(","),
    );
  let columns = await qi.describeTable("sales_orders");
  for (const [key, definition] of Object.entries(orderExtensions)) {
    const field = snake(key);
    if (
      [
        "customerSnapshot",
        "billingAddressSnapshot",
        "shippingAddressSnapshot",
      ].includes(key)
    )
      await qi.changeColumn("sales_orders", field, definition);
    else if (!columns[field]) {
      const { references, onDelete, onUpdate, ...column } = definition;
      await qi.addColumn(
        "sales_orders",
        field,
        key === "orderDate" ? { type: D.DATEONLY, allowNull: true } : column,
      );
    }
  }
  const [legacy] = await db.query(
    "SELECT id,created_at,source_quotation_id FROM sales_orders WHERE order_date IS NULL",
  );
  for (const row of legacy) {
    const [quote] = row.source_quotation_id
      ? await db.query(
          "SELECT quotation_date,billing_address_id,shipping_address_id FROM quotations WHERE id=?",
          { replacements: [row.source_quotation_id] },
        )
      : [[]];
    await db.query(
      "UPDATE sales_orders SET order_date=?, billing_address_id=COALESCE(billing_address_id,?), shipping_address_id=COALESCE(shipping_address_id,?),internal_notes=COALESCE(internal_notes,notes) WHERE id=?",
      {
        replacements: [
          quote[0]?.quotation_date || businessDate(new Date(row.created_at)),
          quote[0]?.billing_address_id || null,
          quote[0]?.shipping_address_id || null,
          row.id,
        ],
      },
    );
  }
  await qi.changeColumn(
    "sales_orders",
    "order_date",
    orderExtensions.orderDate,
  );
  columns = await qi.describeTable("sales_orders");
  if (!columns.active_po_key)
    await db.query(
      "ALTER TABLE sales_orders ADD COLUMN active_po_key VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL AND status <> 'Cancelled' AND TRIM(COALESCE(buyer_po_number,'')) <> '' THEN UPPER(TRIM(buyer_po_number)) ELSE NULL END) STORED",
    );
  if (!(await has(db, "sales_orders", "so_active_buyer_po_unique")))
    await qi.addIndex("sales_orders", ["customer_id", "active_po_key"], {
      name: "so_active_buyer_po_unique",
      unique: true,
    });
  const tables = await qi.showAllTables();
  for (const [table, attrs] of Object.entries(orderTables))
    if (!tables.includes(table))
      await qi.createTable(
        table,
        Object.fromEntries(
          Object.entries(attrs).map(([k, v]) => [
            snake(k),
            Object.fromEntries(
              Object.entries(v).filter(
                ([key]) =>
                  !["references", "onDelete", "onUpdate"].includes(key),
              ),
            ),
          ]),
        ),
        { engine: "InnoDB", charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
      );
  for (const [table, attrs] of Object.entries({
    sales_orders: orderExtensions,
    ...orderTables,
  }))
    for (const [key, def] of Object.entries(attrs))
      if (def.references) {
        const constraint = `${table}_${snake(key)}_fk`;
        // Existing installations may already have an equivalent automatically named FK.
        const [refs] = await db.query(
          "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? AND REFERENCED_TABLE_NAME=?",
          { replacements: [table, snake(key), def.references.model] },
        );
        if (!refs.length)
          await qi.addConstraint(table, {
            fields: [snake(key)],
            type: "foreign key",
            name: constraint,
            references: { table: def.references.model, field: "id" },
            onDelete: "RESTRICT",
            onUpdate: "RESTRICT",
          });
      }
  for (const [table, defs] of Object.entries(orderIndexes)) {
    const existing = await qi.showIndex(table);
    for (const index of defs)
      if (!existing.some((i) => i.name === index.name))
        await qi.addIndex(table, index.fields, index);
  }
  const checks = [
    [
      "sales_orders",
      "so_status_check",
      "status IN ('Draft','Confirmed','InProgress','PartiallyDelivered','Delivered','Closed','Cancelled')",
    ],
    [
      "sales_orders",
      "so_document_hold_check",
      "version > 0 AND (is_on_hold = FALSE OR status = 'Confirmed')",
    ],
    [
      "sales_orders",
      "so_delivery_date_check",
      "requested_delivery_date IS NULL OR requested_delivery_date >= order_date",
    ],
    ["sales_order_revisions", "so_revision_positive", "revision_no > 0"],
    [
      "sales_order_handoffs",
      "so_handoff_status_check",
      "status IN ('Queued','Claimed','Dispatched','Acknowledged','Failed','Cancelled')",
    ],
    [
      "fulfilment_events",
      "so_event_type_check",
      "event_type IN ('ProductionStarted','ShipmentPosted','DeliveryConfirmed') AND source IN ('demo','integration')",
    ],
    ["fulfilment_event_lines", "so_event_quantity_check", "quantity > 0"],
  ];
  for (const [table, constraint, expression] of checks)
    if (!(await has(db, table, constraint)))
      await db.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${expression})`,
      );
  // Only backfill historical content that actually exists; never invent actors/timestamps.
  const [old] = await db.query(
    "SELECT * FROM sales_orders WHERE status <> 'Draft' AND status <> 'Cancelled' AND document_revision=0",
  );
  for (const o of old) {
    if (
      !o.customer_snapshot ||
      !o.billing_address_snapshot ||
      !o.shipping_address_snapshot
    )
      throw new Error(
        `Cannot backfill incomplete frozen order ${o.id}; restore its historical snapshots first`,
      );
    const [lines] = await db.query(
      "SELECT * FROM sales_order_lines WHERE sales_order_id=? ORDER BY line_no",
      { replacements: [o.id] },
    );
    const { legacySnapshot } =
      await import("../../modules/sales-orders/sales-order.mapper.js");
    const snapshot = legacySnapshot(o, lines, { name: env.sellerName });
    await db.transaction(async (transaction) => {
      await db.query(
        "INSERT INTO sales_order_revisions (id,sales_order_id,revision_no,reason,snapshot_schema_version,snapshot,created_by,created_at) VALUES(UUID(),?,1,'Legacy frozen content backfill; original confirmation metadata unavailable',1,?,NULL,UTC_TIMESTAMP(3))",
        { replacements: [o.id, JSON.stringify(snapshot)], transaction },
      );
      await db.query("UPDATE sales_orders SET document_revision=1 WHERE id=?", {
        replacements: [o.id],
        transaction,
      });
    });
  }
}
export async function down(db) {
  const [[{ n }]] = await db.query(
    "SELECT (SELECT COUNT(*) FROM sales_order_revisions)+(SELECT COUNT(*) FROM sales_order_handoffs)+(SELECT COUNT(*) FROM fulfilment_events)+(SELECT COUNT(*) FROM sales_orders) AS n",
  );
  if (Number(n))
    throw new Error(
      "Refusing destructive rollback: commercial orders/history exist. Use a reviewed forward migration.",
    );
  const qi = db.getQueryInterface();
  for (const table of Object.keys(orderTables).reverse())
    await qi.dropTable(table);
  for (const name of [
    "so_status_check",
    "so_document_hold_check",
    "so_delivery_date_check",
  ])
    await db.query(`ALTER TABLE sales_orders DROP CHECK ${name}`);
  for (const index of [
    ...orderIndexes.sales_orders,
    { name: "so_active_buyer_po_unique" },
  ])
    await qi.removeIndex("sales_orders", index.name);
  await qi.removeColumn("sales_orders", "active_po_key");
  for (const key of Object.keys(orderExtensions).reverse())
    if (!key.endsWith("Snapshot"))
      await qi.removeColumn("sales_orders", snake(key));
  for (const key of [
    "customer_snapshot",
    "billing_address_snapshot",
    "shipping_address_snapshot",
  ])
    await qi.changeColumn("sales_orders", key, {
      type: D.JSON,
      allowNull: false,
    });
}
