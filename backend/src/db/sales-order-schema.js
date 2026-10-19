import { DataTypes as D } from "sequelize";
const c = (type, extra = {}) => ({ type, allowNull: false, ...extra });
const opt = (type) => c(type, { allowNull: true });
const fk = (table) => ({
  ...opt(D.CHAR(36)),
  references: { model: table, key: "id" },
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
});
const id = () => c(D.CHAR(36), { primaryKey: true });
const stamps = () => ({ createdAt: c(D.DATE(3)), updatedAt: c(D.DATE(3)) });
export const orderExtensions = {
  orderDate: c(D.DATEONLY),
  buyerPoDate: opt(D.DATEONLY),
  billingAddressId: fk("customer_addresses"),
  shippingAddressId: fk("customer_addresses"),
  publicNotes: opt(D.TEXT),
  internalNotes: opt(D.TEXT),
  customerSnapshot: opt(D.JSON),
  billingAddressSnapshot: opt(D.JSON),
  shippingAddressSnapshot: opt(D.JSON),
  documentRevision: c(D.INTEGER.UNSIGNED, { defaultValue: 0 }),
  isOnHold: c(D.BOOLEAN, { defaultValue: false }),
  holdReason: opt(D.STRING(1000)),
  heldBy: fk("users"),
  heldAt: opt(D.DATE(3)),
  confirmedBy: fk("users"),
  confirmedAt: opt(D.DATE(3)),
  cancelledBy: fk("users"),
  cancelledAt: opt(D.DATE(3)),
  cancellationReason: opt(D.STRING(1000)),
  closedBy: fk("users"),
  closedAt: opt(D.DATE(3)),
  deletedBy: fk("users"),
};
export const orderTables = {
  sales_order_revisions: {
    id: id(),
    salesOrderId: { ...fk("sales_orders"), allowNull: false },
    revisionNo: c(D.INTEGER.UNSIGNED),
    reason: c(D.STRING(1000)),
    buyerReference: opt(D.STRING(500)),
    snapshotSchemaVersion: c(D.INTEGER.UNSIGNED, { defaultValue: 1 }),
    snapshot: c(D.JSON),
    createdBy: fk("users"),
    createdAt: c(D.DATE(3)),
  },
  sales_order_handoffs: {
    id: id(),
    salesOrderId: { ...fk("sales_orders"), allowNull: false },
    documentRevision: c(D.INTEGER.UNSIGNED),
    status: c(D.STRING(24), { defaultValue: "Queued" }),
    payload: c(D.JSON),
    externalReference: opt(D.STRING(150)),
    attemptCount: c(D.INTEGER.UNSIGNED, { defaultValue: 0 }),
    claimedAt: opt(D.DATE(3)),
    dispatchedAt: opt(D.DATE(3)),
    acknowledgedAt: opt(D.DATE(3)),
    lastError: opt(D.TEXT),
    version: c(D.INTEGER.UNSIGNED, { defaultValue: 1 }),
    ...stamps(),
  },
  fulfilment_events: {
    id: id(),
    salesOrderId: { ...fk("sales_orders"), allowNull: false },
    provider: c(D.STRING(60)),
    externalEventId: c(D.STRING(150)),
    eventType: c(D.STRING(30)),
    externalReference: opt(D.STRING(150)),
    payloadHash: c(D.CHAR(64)),
    source: c(D.STRING(20)),
    occurredAt: c(D.DATE(3)),
    receivedAt: c(D.DATE(3)),
  },
  fulfilment_event_lines: {
    id: id(),
    eventId: { ...fk("fulfilment_events"), allowNull: false },
    salesOrderLineId: { ...fk("sales_order_lines"), allowNull: false },
    quantity: c(D.INTEGER.UNSIGNED),
  },
};
export const orderIndexes = {
  sales_orders: [
    {
      name: "so_team_status_created_idx",
      fields: ["sales_team_id", "status", "created_at", "id"],
    },
    {
      name: "so_buyer_created_idx",
      fields: ["customer_id", "created_at", "id"],
    },
    {
      name: "so_status_delivery_idx",
      fields: ["status", "requested_delivery_date"],
    },
    { name: "so_hold_status_idx", fields: ["is_on_hold", "status"] },
    { name: "so_owner_idx", fields: ["owner_id"] },
  ],
  sales_order_revisions: [
    {
      name: "so_revision_unique",
      fields: ["sales_order_id", "revision_no"],
      unique: true,
    },
  ],
  sales_order_handoffs: [
    { name: "so_handoff_unique", fields: ["sales_order_id"], unique: true },
    { name: "so_handoff_queue_idx", fields: ["status", "created_at"] },
  ],
  fulfilment_events: [
    {
      name: "fulfilment_provider_event_unique",
      fields: ["provider", "external_event_id"],
      unique: true,
    },
    {
      name: "fulfilment_order_occurred_idx",
      fields: ["sales_order_id", "occurred_at", "id"],
    },
  ],
  fulfilment_event_lines: [
    {
      name: "fulfilment_event_line_unique",
      fields: ["event_id", "sales_order_line_id"],
      unique: true,
    },
  ],
};
