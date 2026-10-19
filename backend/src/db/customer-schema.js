import { DataTypes as D } from "sequelize";
const opt = (type) => ({ type, allowNull: true });
const actor = () => ({
  ...opt(D.CHAR(36)),
  references: { model: "users", key: "id" },
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
});
const stamp = () => ({
  type: D.DATE(3),
  allowNull: false,
  defaultValue: D.NOW,
});
export const customerExtensions = {
  displayName: opt(D.STRING(150)),
  email: opt(D.STRING(254)),
  phone: opt(D.STRING(40)),
  website: opt(D.STRING(500)),
  registrationNumber: opt(D.STRING(100)),
  internalNotes: opt(D.TEXT),
  paymentTerms: { type: D.STRING(500), allowNull: false },
  archivedAt: opt(D.DATE(3)),
  archivedBy: actor(),
  archiveReason: opt(D.STRING(1000)),
  createdBy: { ...actor(), allowNull: false },
  updatedBy: { ...actor(), allowNull: false },
};
export const contactExtensions = {
  jobTitle: opt(D.STRING(100)),
  createdAt: stamp(),
  updatedAt: stamp(),
};
export const addressExtensions = {
  label: opt(D.STRING(100)),
  region: opt(D.STRING(100)),
  createdAt: stamp(),
  updatedAt: stamp(),
};
export const customerTables = {
  customer_code_sequences: {
    sequenceKey: { type: D.STRING(30), allowNull: false, primaryKey: true },
    nextValue: { type: D.BIGINT.UNSIGNED, allowNull: false },
    updatedAt: { type: D.DATE(3), allowNull: false },
  },
};
export const customerIndexes = {
  customers: [
    {
      name: "customer_team_active_name_idx",
      fields: ["sales_team_id", "is_active", "name", "id"],
    },
    {
      name: "customer_owner_active_idx",
      fields: ["owner_id", "is_active", "id"],
    },
    {
      name: "customer_country_active_idx",
      fields: ["country", "is_active", "id"],
    },
    { name: "customer_created_idx", fields: ["created_at", "id"] },
  ],
  customer_contacts: [
    {
      name: "customer_contact_active_idx",
      fields: ["customer_id", "is_active"],
    },
  ],
  customer_addresses: [
    {
      name: "customer_address_active_idx",
      fields: ["customer_id", "address_type", "is_active"],
    },
  ],
};
