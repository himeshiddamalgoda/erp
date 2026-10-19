import { Op, QueryTypes } from "sequelize";
import { randomUUID } from "node:crypto";
import { QuotationRepository } from "../quotations/quotation.repository.js";
import { AppError, conflict } from "../../shared/errors.js";
export const openQuotes = [
  "Draft",
  "PendingApproval",
  "Approved",
  "Issued",
  "Accepted",
];
export class CustomerRepository extends QuotationRepository {
  async customer(id, t, locked = false) {
    const c = await this.findById("customers", id, {
      transaction: t,
      ...(locked ? { lock: t.LOCK.UPDATE } : {}),
    });
    if (!c) throw new AppError(404, "NOT_FOUND", "Customer not found");
    return c;
  }
  children(table, id, t, locked = false) {
    return this.m[table].findAll({
      where: { customerId: id },
      order: [["id", "ASC"]],
      transaction: t,
      ...(locked ? { lock: t.LOCK.UPDATE } : {}),
    });
  }
  async number(t) {
    await this.db.query(
      "INSERT INTO customer_code_sequences (sequence_key,next_value,updated_at) VALUES ('CUSTOMER',1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE next_value=next_value",
      { transaction: t },
    );
    const row = await this.m.customer_code_sequences.findByPk("CUSTOMER", {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const next = BigInt(row.nextValue);
    if (next >= 18446744073709551615n)
      conflict("SEQUENCE_EXHAUSTED", "Customer code sequence is exhausted");
    await row.update(
      { nextValue: (next + 1n).toString(), updatedAt: new Date() },
      { transaction: t },
    );
    return "CUS-" + next.toString().padStart(6, "0");
  }
  async audit(c, actor, action, from, reason, requestId, t, metadata = null) {
    return this.insert(
      "audit_events",
      {
        id: randomUUID(),
        entityType: "customer",
        entityId: c.id,
        actorId: actor.id,
        action,
        fromStatus: from,
        toStatus: c.isActive ? "Active" : "Archived",
        reason: reason || null,
        metadata,
        requestId: requestId || null,
        createdAt: new Date(),
      },
      { transaction: t },
    );
  }
  async list(actor, q, t) {
    const where = {};
    if (actor.role !== "Admin")
      where.salesTeamId = { [Op.in]: actor.salesTeamIds };
    if (q.status !== "All") where.isActive = q.status === "Active";
    for (const k of ["salesTeamId", "ownerId", "country", "currency"])
      if (q[k]) {
        if (
          k === "salesTeamId" &&
          actor.role !== "Admin" &&
          !actor.salesTeamIds.includes(q[k])
        )
          return { rows: [], count: 0 };
        where[k] = q[k];
      }
    if (q.q) {
      const pattern = "%" + q.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
      where[Op.or] = ["code", "name", "displayName"].map((k) => ({
        [k]: { [Op.like]: pattern },
      }));
    }
    return this.m.customers.findAndCountAll({
      where,
      order: [
        [q.sortBy, q.sortOrder],
        ["id", q.sortOrder],
      ],
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
      transaction: t,
    });
  }
  async documents(id, actor, t, { addressIds } = {}) {
    const replacements = {
      id,
      teams: actor.salesTeamIds.length ? actor.salesTeamIds : [""],
      ...(addressIds ? { addresses: addressIds } : {}),
    };
    const quoteWhere = addressIds
      ? "q.status='Draft' AND (q.billing_address_id IN (:addresses) OR q.shipping_address_id IN (:addresses))"
      : "q.customer_id=:id AND q.status IN ('Draft','PendingApproval','Approved','Issued','Accepted')";
    const orderWhere = addressIds
      ? "o.status='Draft' AND (o.billing_address_id IN (:addresses) OR o.shipping_address_id IN (:addresses))"
      : "o.customer_id=:id AND o.status='Draft'";
    const visibility = (alias) =>
      actor.role === "Admin" ? "1=1" : `${alias}.sales_team_id IN (:teams)`;
    const union = `SELECT 'quotation' entityType,q.id,f.quote_number number,q.status,q.sales_team_id teamId,(${visibility("q")}) permitted,(q.status='Issued' AND q.valid_until < :today) validityEnded FROM quotations q JOIN quotation_families f ON f.id=q.family_id WHERE q.deleted_at IS NULL AND ${quoteWhere} UNION ALL SELECT 'sales_order',o.id,o.order_number,o.status,o.sales_team_id,(${visibility("o")}),FALSE FROM sales_orders o WHERE o.deleted_at IS NULL AND ${orderWhere}`;
    const { businessDate } = await import("../../config/env.js");
    replacements.today = businessDate();
    const [{ total, visibleCount, quoteCount, orderCount }] =
      await this.db.query(
        `SELECT COUNT(*) total,COALESCE(SUM(permitted),0) visibleCount,COALESCE(SUM(permitted AND entityType='quotation'),0) quoteCount,COALESCE(SUM(permitted AND entityType='sales_order'),0) orderCount FROM (${union}) blockers`,
        { replacements, transaction: t, type: QueryTypes.SELECT },
      );
    const examples = await this.db.query(
      `SELECT entityType,id,number,status,validityEnded FROM (${union}) blockers WHERE permitted=1 ORDER BY entityType,id LIMIT 20`,
      { replacements, transaction: t, type: QueryTypes.SELECT },
    );
    return {
      blockerCount: Number(total),
      visibleBlockerCount: Number(visibleCount),
      openQuotationCount: Number(quoteCount),
      draftOrderCount: Number(orderCount),
      archiveBlockers: examples.map((r) => ({
        ...r,
        validityEnded: Boolean(r.validityEnded),
        href: `/orders/${r.entityType === "quotation" ? "quotations" : "sales-orders"}/${r.id}`,
      })),
    };
  }
  async commercialSummary(id, actor, t) {
    const blockers = await this.documents(id, actor, t);
    const scope =
      actor.role === "Admin"
        ? {}
        : { salesTeamId: { [Op.in]: actor.salesTeamIds } };
    const activeOrderCount = await this.m.sales_orders.count({
      where: {
        ...scope,
        customerId: id,
        deletedAt: null,
        status: {
          [Op.in]: [
            "Confirmed",
            "InProgress",
            "PartiallyDelivered",
            "Delivered",
          ],
        },
      },
      transaction: t,
    });
    return {
      ...blockers,
      activeOrderCount,
      canArchive: blockers.blockerCount === 0,
      restrictedBlockers: blockers.blockerCount > blockers.visibleBlockerCount,
      countsScope:
        actor.role === "Admin" ? "all-company" : "actor-visible-teams",
      blockerCountScope: "all-dependent-documents",
    };
  }
}
