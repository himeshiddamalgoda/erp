import {
  customerExtensions,
  contactExtensions,
  addressExtensions,
  customerTables,
  customerIndexes,
} from "./customer-schema.js";
import { DataTypes as D } from "sequelize";
import {
  orderExtensions,
  orderTables,
  orderIndexes,
} from "./sales-order-schema.js";
const str = (n) => D.STRING(n);
const col = (type, extra = {}) => ({ type, allowNull: false, ...extra });
const optional = (type) => col(type, { allowNull: true });
const id = () => col(D.CHAR(36), { primaryKey: true });
const fk = (table, nullable = false) =>
  col(D.CHAR(36), {
    allowNull: nullable,
    references: { model: table, key: "id" },
    onDelete: "RESTRICT",
    onUpdate: "RESTRICT",
  });
const timestamps = () => ({
  createdAt: col(D.DATE(3)),
  updatedAt: col(D.DATE(3)),
});
const mutable = () => ({
  ...timestamps(),
  version: col(D.INTEGER.UNSIGNED, { defaultValue: 1 }),
});
const active = () => col(D.BOOLEAN, { defaultValue: true });
const money = () => col(D.DECIMAL(18, 2), { defaultValue: "0.00" });
const snapshots = () => ({
  customerSnapshot: optional(D.JSON),
  billingAddressSnapshot: optional(D.JSON),
  shippingAddressSnapshot: optional(D.JSON),
});
const commercial = () => ({
  customerId: fk("customers"),
  salesTeamId: fk("sales_teams"),
  ownerId: fk("users"),
  currency: col(D.CHAR(3)),
  requestedDeliveryDate: optional(D.DATEONLY),
  paymentTerms: optional(str(500)),
  notes: optional(D.TEXT),
  ...snapshots(),
  totalQty: col(D.BIGINT.UNSIGNED, { defaultValue: 0 }),
  subtotal: money(),
  total: money(),
  createdBy: fk("users"),
  updatedBy: fk("users"),
  deletedAt: optional(D.DATE(3)),
  ...mutable(),
});
const line = () => ({
  id: id(),
  lineNo: col(D.INTEGER.UNSIGNED),
  variantId: fk("style_variants"),
  styleId: fk("styles"),
  styleCodeSnapshot: col(str(40)),
  styleNameSnapshot: col(str(150)),
  fabricSnapshot: col(str(250)),
  gsmSnapshot: optional(D.SMALLINT.UNSIGNED),
  colourSnapshot: col(str(60)),
  sizeSnapshot: col(str(30)),
  uom: col(str(10), { defaultValue: "PCS" }),
  quantity: col(D.INTEGER.UNSIGNED),
  unitPrice: col(D.DECIMAL(14, 2)),
  lineTotal: col(D.DECIMAL(18, 2)),
  ...timestamps(),
});
export const schemas = {
  users: {
    id: id(),
    displayName: col(str(150)),
    role: col(str(32)),
    isActive: active(),
    ...timestamps(),
  },
  sales_teams: {
    id: id(),
    code: col(str(30), { unique: true }),
    name: col(str(150)),
    managerId: fk("users"),
    isActive: active(),
    ...mutable(),
  },
  sales_team_members: {
    teamId: { ...fk("sales_teams"), primaryKey: true },
    userId: { ...fk("users"), primaryKey: true },
    isActive: active(),
  },
  customers: {
    id: id(),
    code: col(str(30), { unique: true }),
    name: col(str(200)),
    country: col(D.CHAR(2)),
    currency: col(D.CHAR(3)),
    paymentTerms: optional(str(500)),
    salesTeamId: fk("sales_teams"),
    ownerId: fk("users"),
    isActive: active(),
    ...mutable(),
  },
  customer_contacts: {
    id: id(),
    customerId: fk("customers"),
    name: col(str(150)),
    email: optional(str(254)),
    phone: optional(str(40)),
    isPrimary: col(D.BOOLEAN, { defaultValue: false }),
    isActive: active(),
  },
  customer_addresses: {
    id: id(),
    customerId: fk("customers"),
    addressType: col(str(20)),
    line1: col(str(200)),
    line2: optional(str(200)),
    city: col(str(100)),
    postalCode: optional(str(30)),
    country: col(D.CHAR(2)),
    isDefault: col(D.BOOLEAN, { defaultValue: false }),
    isActive: active(),
  },
  styles: {
    id: id(),
    code: col(str(40), { unique: true }),
    name: col(str(150)),
    fabricDescription: col(str(250)),
    gsm: optional(D.SMALLINT.UNSIGNED),
    uom: col(str(10), { defaultValue: "PCS" }),
    isActive: active(),
    ...timestamps(),
  },
  style_variants: {
    id: id(),
    styleId: fk("styles"),
    colour: col(str(60)),
    size: col(str(30)),
    isActive: active(),
  },
  document_sequences: {
    documentType: col(str(20), { primaryKey: true }),
    sequenceYear: col(D.SMALLINT.UNSIGNED, { primaryKey: true }),
    nextValue: col(D.BIGINT.UNSIGNED),
  },
  quotation_families: {
    id: id(),
    quoteNumber: col(str(40), { unique: true }),
    latestRevisionNo: col(D.INTEGER.UNSIGNED, { defaultValue: 1 }),
    activeIssuedRevisionId: optional(D.CHAR(36)),
    acceptedRevisionId: optional(D.CHAR(36)),
    convertedOrderId: optional(D.CHAR(36)),
    createdBy: fk("users"),
    ...mutable(),
  },
  quotations: {
    id: id(),
    familyId: fk("quotation_families"),
    revisionNo: col(D.INTEGER.UNSIGNED),
    priorRevisionId: fk("quotations", true),
    status: col(str(32), { defaultValue: "Draft" }),
    ...commercial(),
    quotationDate: col(D.DATEONLY),
    validUntil: optional(D.DATEONLY),
    billingAddressId: fk("customer_addresses", true),
    shippingAddressId: fk("customer_addresses", true),
    submittedBy: fk("users", true),
    submittedAt: optional(D.DATE(3)),
    approvedBy: fk("users", true),
    approvedAt: optional(D.DATE(3)),
    issuedBy: fk("users", true),
    issuedAt: optional(D.DATE(3)),
    buyerDecision: optional(str(20)),
    buyerResponseReference: optional(str(500)),
    buyerResponseReason: optional(str(1000)),
    buyerResponseAt: optional(D.DATE(3)),
    buyerResponseRecordedBy: fk("users", true),
    deletedBy: fk("users", true),
  },
  quotation_lines: { ...line(), quotationId: fk("quotations") },
  sales_orders: {
    id: id(),
    orderNumber: col(str(40), { unique: true }),
    sourceQuotationId: { ...fk("quotations", true), unique: true },
    sourceQuoteNumber: optional(str(40)),
    sourceRevisionNo: optional(D.INTEGER.UNSIGNED),
    status: col(str(32), { defaultValue: "Draft" }),
    buyerPoNumber: optional(str(100)),
    ...commercial(),
    customerSnapshot: col(D.JSON),
    billingAddressSnapshot: col(D.JSON),
    shippingAddressSnapshot: col(D.JSON),
  },
  sales_order_lines: { ...line(), salesOrderId: fk("sales_orders") },
  audit_events: {
    id: id(),
    entityType: col(str(40)),
    entityId: col(D.CHAR(36)),
    actorId: fk("users", true),
    action: col(str(50)),
    fromStatus: optional(str(32)),
    toStatus: optional(str(32)),
    reason: optional(D.TEXT),
    metadata: optional(D.JSON),
    requestId: optional(str(100)),
    createdAt: col(D.DATE(3)),
  },
  idempotency_keys: {
    id: id(),
    actorId: fk("users"),
    operation: col(str(80)),
    idempotencyKey: col(str(128)),
    requestHash: col(D.CHAR(64)),
    responseStatus: optional(D.SMALLINT.UNSIGNED),
    responseBody: optional(D.JSON),
    resourceId: optional(D.CHAR(36)),
    state: col(str(20)),
    createdAt: col(D.DATE(3)),
    expiresAt: optional(D.DATE(3)),
  },
};
export const indexes = {
  style_variants: [{ fields: ["style_id", "colour", "size"], unique: true }],
  quotations: [
    { fields: ["family_id", "revision_no"], unique: true },
    { fields: ["sales_team_id", "status", "created_at", "id"] },
    { fields: ["customer_id", "created_at", "id"] },
    { fields: ["status", "valid_until"] },
    { fields: ["owner_id"] },
    { fields: ["prior_revision_id"] },
  ],
  quotation_lines: [
    { fields: ["quotation_id", "variant_id"], unique: true },
    { fields: ["quotation_id", "line_no"], unique: true },
  ],
  sales_order_lines: [
    { fields: ["sales_order_id", "variant_id"], unique: true },
    { fields: ["sales_order_id", "line_no"], unique: true },
  ],
  audit_events: [{ fields: ["entity_type", "entity_id", "created_at", "id"] }],
  idempotency_keys: [
    { fields: ["actor_id", "operation", "idempotency_key"], unique: true },
  ],
};
export const snake = (name) =>
  name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export function defineModels(sequelize) {
  const models = Object.fromEntries(
    Object.entries({
      ...schemas,
      customers: { ...schemas.customers, ...customerExtensions },
      customer_contacts: { ...schemas.customer_contacts, ...contactExtensions },
      customer_addresses: {
        ...schemas.customer_addresses,
        ...addressExtensions,
      },
      ...customerTables,
      sales_orders: { ...schemas.sales_orders, ...orderExtensions },
      ...orderTables,
    }).map(([table, attributes]) => [
      table,
      sequelize.define(table, attributes, {
        timestamps: false,
        indexes: [
          ...(indexes[table] || []),
          ...(orderIndexes[table] || []),
          ...(customerIndexes[table] || []),
        ],
      }),
    ]),
  );
  for (const hook of [
    "beforeUpdate",
    "beforeBulkUpdate",
    "beforeDestroy",
    "beforeBulkDestroy",
    "beforeUpsert",
  ]) {
    models.audit_events.addHook(hook, () => {
      throw new Error("Audit events are append only");
    });
  }
  for (const table of [
    "sales_order_revisions",
    "fulfilment_events",
    "fulfilment_event_lines",
  ]) {
    for (const hook of [
      "beforeUpdate",
      "beforeBulkUpdate",
      "beforeDestroy",
      "beforeBulkDestroy",
      "beforeUpsert",
    ])
      models[table].addHook(hook, () => {
        throw new Error(`${table} is append only`);
      });
  }
  return models;
}
