import { Op } from "sequelize";
import { QuotationRepository } from "../quotations/quotation.repository.js";
import { AppError } from "../../shared/errors.js";
export class SalesOrderRepository extends QuotationRepository {
  async lockedOrder(id, t, includeDeleted = false) {
    const o = await this.findById("sales_orders", id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!o || (!includeDeleted && o.deletedAt))
      throw new AppError(404, "NOT_FOUND", "Sales order not found");
    return o;
  }
  lines(id, t, locked = false) {
    return this.m.sales_order_lines.findAll({
      where: { salesOrderId: id },
      order: [[locked ? "id" : "lineNo", "ASC"]],
      transaction: t,
      ...(locked ? { lock: t.LOCK.UPDATE } : {}),
    });
  }
  handoff(id, t, locked = false) {
    return this.one("sales_order_handoffs", {
      where: { salesOrderId: id },
      transaction: t,
      ...(locked ? { lock: t.LOCK.UPDATE } : {}),
    });
  }
  async hasActivity(id, t) {
    return Boolean(
      await this.one("fulfilment_events", {
        where: { salesOrderId: id },
        transaction: t,
      }),
    );
  }
  async audit(
    o,
    actor,
    action,
    fromStatus,
    reason,
    requestId,
    t,
    metadata = null,
  ) {
    return this.insert(
      "audit_events",
      {
        id: crypto.randomUUID(),
        entityType: "sales_order",
        entityId: o.id,
        actorId: actor?.id || null,
        action,
        fromStatus,
        toStatus: o.status,
        reason: reason || null,
        requestId: requestId || null,
        metadata,
        createdAt: new Date(),
      },
      { transaction: t },
    );
  }
  async replaceLines(id, lines, t) {
    await this.m.sales_order_lines.destroy({
      where: { salesOrderId: id },
      transaction: t,
    });
    return this.insertMany(
      "sales_order_lines",
      lines.map((l) => ({ ...l, salesOrderId: id })),
      { transaction: t },
    );
  }
  async delivered(id, lines, t) {
    const events = await this.m.fulfilment_events.findAll({
      where: { salesOrderId: id, eventType: "DeliveryConfirmed" },
      attributes: ["id"],
      transaction: t,
    });
    const rows = await this.m.fulfilment_event_lines.findAll({
      where: { eventId: { [Op.in]: events.map((e) => e.id) } },
      transaction: t,
    });
    const totals = new Map();
    for (const l of rows)
      totals.set(
        l.salesOrderLineId,
        (totals.get(l.salesOrderLineId) || 0) + l.quantity,
      );
    return lines.map((l) => ({
      orderLineId: l.id,
      styleCode: l.styleCodeSnapshot,
      colour: l.colourSnapshot,
      size: l.sizeSnapshot,
      orderedQty: l.quantity,
      deliveredQty: totals.get(l.id) || 0,
      remainingQty: l.quantity - (totals.get(l.id) || 0),
    }));
  }
  async list(actor, q, t) {
    const where = { deletedAt: null };
    if (actor.role !== "Admin")
      where.salesTeamId = { [Op.in]: actor.salesTeamIds };
    for (const k of ["status", "customerId", "salesTeamId", "ownerId"])
      if (q[k]) {
        if (
          k === "salesTeamId" &&
          actor.role !== "Admin" &&
          !actor.salesTeamIds.includes(q[k])
        )
          return { rows: [], count: 0 };
        where[k] = q[k];
      }
    if (q.source)
      where.sourceQuotationId =
        q.source === "direct" ? null : { [Op.ne]: null };
    if (q.onHold) where.isOnHold = q.onHold === "true";
    if (q.deliveryFrom || q.deliveryTo)
      where.requestedDeliveryDate = {
        ...(q.deliveryFrom ? { [Op.gte]: q.deliveryFrom } : {}),
        ...(q.deliveryTo ? { [Op.lte]: q.deliveryTo } : {}),
      };
    if (q.q) {
      const pattern = "%" + q.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
      where[Op.or] = [
        { orderNumber: { [Op.like]: pattern } },
        { buyerPoNumber: { [Op.like]: pattern } },
        this.db.where(
          this.db.literal(
            "JSON_UNQUOTE(JSON_EXTRACT(`customer_snapshot`, '$.name'))",
          ),
          { [Op.like]: pattern },
        ),
      ];
    }
    return this.m.sales_orders.findAndCountAll({
      where,
      transaction: t,
      order: [
        [q.sortBy, q.sortOrder],
        ["id", q.sortOrder],
      ],
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
  }
}
