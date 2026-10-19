import { DataTypes as D } from "sequelize";
const nullable = (type) => ({ type, allowNull: true });
const actor = () => ({
  ...nullable(D.CHAR(36)),
  references: { model: "users", key: "id" },
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
});
// Legacy provenance remains NULL when unknown; services fully populate all new writes.
export const teamExtensions = {
  description: nullable(D.STRING(1000)),
  createdBy: actor(),
  updatedBy: actor(),
  archivedAt: nullable(D.DATE(3)),
  archivedBy: actor(),
  archiveReason: nullable(D.STRING(1000)),
};
export const membershipExtensions = {
  joinedAt: nullable(D.DATE(3)),
  lastActivatedAt: nullable(D.DATE(3)),
  removedAt: nullable(D.DATE(3)),
  addedBy: actor(),
  lastActivatedBy: actor(),
  removedBy: actor(),
  createdAt: nullable(D.DATE(3)),
  updatedAt: nullable(D.DATE(3)),
};
export const teamTables = {
  team_code_sequences: {
    sequenceKey: { type: D.STRING(30), primaryKey: true, allowNull: false },
    nextValue: { type: D.BIGINT.UNSIGNED, allowNull: false },
    updatedAt: { type: D.DATE(3), allowNull: false },
  },
};
export const teamIndexes = {
  sales_teams: [
    { name: "team_active_name_idx", fields: ["is_active", "name", "id"] },
    {
      name: "team_manager_active_idx",
      fields: ["manager_id", "is_active", "id"],
    },
    { name: "team_created_idx", fields: ["created_at", "id"] },
  ],
  sales_team_members: [
    {
      name: "team_member_user_active_idx",
      fields: ["user_id", "is_active", "team_id"],
    },
  ],
  customers: [
    {
      name: "customer_team_owner_active_idx",
      fields: ["sales_team_id", "owner_id", "is_active"],
    },
  ],
  quotations: [
    {
      name: "quote_team_owner_status_idx",
      fields: ["sales_team_id", "owner_id", "status", "deleted_at"],
    },
  ],
  sales_orders: [
    {
      name: "order_team_owner_status_idx",
      fields: ["sales_team_id", "owner_id", "status", "deleted_at"],
    },
  ],
};
