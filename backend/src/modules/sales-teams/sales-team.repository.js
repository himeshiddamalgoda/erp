import { QueryTypes } from "sequelize";
import { randomUUID } from "node:crypto";
import { QuotationRepository } from "../quotations/quotation.repository.js";
import { AppError, conflict } from "../../shared/errors.js";
import { canManage } from "./sales-team.policy.js";
import { businessDate } from "../../config/env.js";
export const openQuotationStatuses = [
  "Draft",
  "PendingApproval",
  "Approved",
  "Issued",
  "Accepted",
];
export const openOrderStatuses = [
  "Draft",
  "Confirmed",
  "InProgress",
  "PartiallyDelivered",
  "Delivered",
];
export class SalesTeamRepository extends QuotationRepository {
  async team(id, t, lock = false) {
    const row = await this.findById("sales_teams", id, {
      transaction: t,
      ...(lock ? { lock: t.LOCK.UPDATE } : {}),
    });
    if (!row) throw new AppError(404, "NOT_FOUND", "Sales team not found");
    return row;
  }
  members(id, t) {
    return this.db.query(
      "SELECT m.*,m.team_id teamId,m.user_id userId,m.is_active isActive,m.joined_at joinedAt,m.last_activated_at lastActivatedAt,m.removed_at removedAt,m.removed_by removedBy,u.display_name displayName,u.is_active userActive,u.role FROM sales_team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=? ORDER BY m.user_id",
      { replacements: [id], transaction: t, type: QueryTypes.SELECT },
    );
  }
  async number(t) {
    await this.db.query(
      "INSERT INTO team_code_sequences (sequence_key,next_value,updated_at) VALUES ('SALES_TEAM',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE next_value=next_value",
      { transaction: t },
    );
    const row = await this.m.team_code_sequences.findByPk("SALES_TEAM", {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const next = BigInt(row.nextValue);
    if (next >= 18446744073709551615n)
      conflict("SEQUENCE_EXHAUSTED", "Team code sequence exhausted");
    await row.update(
      { nextValue: (next + 1n).toString(), updatedAt: new Date() },
      { transaction: t },
    );
    return "TEAM-" + next.toString().padStart(6, "0");
  }
  async audit(
    team,
    actor,
    action,
    from,
    reason,
    requestId,
    t,
    metadata = null,
  ) {
    return this.insert(
      "audit_events",
      {
        id: randomUUID(),
        entityType: "sales_team",
        entityId: team.id,
        actorId: actor.id,
        action,
        fromStatus: from,
        toStatus: team.isActive ? "Active" : "Archived",
        reason: reason || null,
        metadata,
        requestId: requestId || null,
        createdAt: new Date(),
      },
      { transaction: t },
    );
  }
  async list(actor, q, t) {
    const conditions = [],
      replacements = {};
    if (!canManage(actor)) {
      conditions.push("t.id IN (:teams)");
      replacements.teams = actor.salesTeamIds.length
        ? actor.salesTeamIds
        : [""];
    }
    if (q.status !== "All") {
      conditions.push("t.is_active=:active");
      replacements.active = q.status === "Active";
    }
    if (q.managerId) {
      conditions.push("t.manager_id=:manager");
      replacements.manager = q.managerId;
    }
    if (q.memberId) {
      conditions.push(
        "EXISTS (SELECT 1 FROM sales_team_members selected WHERE selected.team_id=t.id AND selected.user_id=:member AND selected.is_active=1)",
      );
      replacements.member = q.memberId;
    }
    if (q.q) {
      conditions.push("(t.code LIKE :q OR t.name LIKE :q)");
      replacements.q = "%" + q.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    }
    const from =
      "FROM sales_teams t JOIN users u ON u.id=t.manager_id " +
      (conditions.length ? "WHERE " + conditions.join(" AND ") : "");
    const [{ total }] = await this.db.query("SELECT COUNT(*) total " + from, {
      replacements,
      transaction: t,
      type: QueryTypes.SELECT,
    });
    const sort = { name: "t.name", code: "t.code", createdAt: "t.created_at" }[
        q.sortBy
      ],
      direction = q.sortOrder === "asc" ? "ASC" : "DESC";
    const rows = await this.db.query(
      `SELECT t.id,t.code,t.name,t.version,t.is_active isActive,u.id managerId,u.display_name managerName,COALESCE(counts.active,0) active,COALESCE(counts.eligible,0) eligible FROM sales_teams t JOIN users u ON u.id=t.manager_id LEFT JOIN (SELECT m.team_id,SUM(m.is_active=1) active,SUM(m.is_active=1 AND member_user.is_active=1) eligible FROM sales_team_members m JOIN users member_user ON member_user.id=m.user_id GROUP BY m.team_id) counts ON counts.team_id=t.id ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY ${sort} ${direction},t.id ${direction} LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          ...replacements,
          limit: q.pageSize,
          offset: (q.page - 1) * q.pageSize,
        },
        transaction: t,
        type: QueryTypes.SELECT,
      },
    );
    return { rows, total: Number(total) };
  }
  async assignments(id, actor, t, ownerIds) {
    const replacements = {
      id,
      teams: actor.salesTeamIds.length ? actor.salesTeamIds : [""],
      today: businessDate(),
      ...(ownerIds ? { owners: ownerIds } : {}),
    };
    const permitted = (alias) =>
      actor.role === "Admin" ? "1=1" : `${alias}.sales_team_id IN (:teams)`;
    const owner = (alias) =>
      ownerIds ? ` AND ${alias}.owner_id IN (:owners)` : "";
    const union = `SELECT 'customer' entityType,c.id,c.code number,'Active' status,c.owner_id ownerId,(${permitted("c")}) permitted,FALSE validityEnded FROM customers c WHERE c.sales_team_id=:id AND c.is_active=1 ${owner("c")} UNION ALL SELECT 'quotation',q.id,f.quote_number,q.status,q.owner_id,(${permitted("q")}),(q.status='Issued' AND q.valid_until < :today) FROM quotations q JOIN quotation_families f ON f.id=q.family_id WHERE q.sales_team_id=:id AND q.deleted_at IS NULL AND q.status IN ('Draft','PendingApproval','Approved','Issued','Accepted') ${owner("q")} UNION ALL SELECT 'salesOrder',o.id,o.order_number,o.status,o.owner_id,(${permitted("o")}),FALSE FROM sales_orders o WHERE o.sales_team_id=:id AND o.deleted_at IS NULL AND o.status IN ('Draft','Confirmed','InProgress','PartiallyDelivered','Delivered') ${owner("o")}`;
    const rows = await this.db.query(
      `SELECT ownerId,COUNT(*) total,SUM(permitted) visible,SUM(permitted AND entityType='customer') customers,SUM(permitted AND entityType='quotation') quotes,SUM(permitted AND entityType='salesOrder') orders FROM (${union}) a GROUP BY ownerId`,
      { replacements, transaction: t, type: QueryTypes.SELECT },
    );
    const examples = await this.db.query(
      `SELECT entityType,id,number,status,ownerId,validityEnded FROM (${union}) a WHERE permitted=1 ORDER BY entityType,id LIMIT 20`,
      { replacements, transaction: t, type: QueryTypes.SELECT },
    );
    const sum = (key) =>
      rows.reduce((total, row) => total + Number(row[key]), 0);
    const total = sum("total"),
      visible = sum("visible");
    return {
      total,
      summary: {
        activeCustomerCount: sum("customers"),
        openQuotationCount: sum("quotes"),
        openSalesOrderCount: sum("orders"),
        canArchive: total === 0,
        blockerCount: visible,
        restrictedBlockers: total > visible,
        countsScope:
          actor.role === "Admin" ? "all-company" : "actor-visible-teams",
        blockerCountScope:
          actor.role === "Admin" ? "all-company" : "actor-visible-teams",
        blockers: examples.map((row) => ({
          ...row,
          validityEnded: Number(row.validityEnded) === 1,
          href: `/orders/${{ customer: "customers", quotation: "quotations", salesOrder: "sales-orders" }[row.entityType]}/${row.id}`,
        })),
      },
      members: rows.map((row) => ({
        memberId: row.ownerId,
        blockerCount: Number(row.visible),
        restrictedBlockers: Number(row.total) > Number(row.visible),
      })),
    };
  }
}
