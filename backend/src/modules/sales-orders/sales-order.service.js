import { teamGuard } from "../../shared/team-guard.js";
import { customerGuard } from "../../shared/customer-guard.js";
import { randomUUID, createHash } from "node:crypto";
import { AppError, conflict, invalid } from "../../shared/errors.js";
import { businessDate, env } from "../../config/env.js";
import { QuotationService } from "../quotations/quotation.service.js";
import { authorize, allowedActions } from "./sales-order.policy.js";
import {
  pick,
  summary,
  mapLine,
  headerFields,
  handoffSummary,
  snapshot,
  revisionDetail,
} from "./sales-order.mapper.js";
export const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
export const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const stamps = () => ({ createdAt: new Date(), updatedAt: new Date() });
const convertedEditable = [
  "buyerPoNumber",
  "buyerPoDate",
  "requestedDeliveryDate",
  "shippingAddressId",
  "publicNotes",
  "internalNotes",
];
const copyFields = [
  "customerId",
  "salesTeamId",
  "ownerId",
  "currency",
  "orderDate",
  "buyerPoNumber",
  "buyerPoDate",
  "requestedDeliveryDate",
  "billingAddressId",
  "shippingAddressId",
  "paymentTerms",
  "publicNotes",
  "internalNotes",
];
export class SalesOrderService {
  constructor(repository) {
    this.r = repository;
    this.commercial = new QuotationService(repository);
  }
  async transaction(work) {
    try {
      return await this.r.transaction(work);
    } catch (e) {
      if (
        e.name === "SequelizeUniqueConstraintError" &&
        (e.original?.sqlMessage?.includes("so_active_buyer_po_unique") ||
          e.errors?.some(
            (x) =>
              x.path === "so_active_buyer_po_unique" ||
              x.path === "active_po_key",
          ))
      )
        conflict(
          "DUPLICATE_BUYER_PO",
          "An active order already uses this buyer PO",
        );
      throw e;
    }
  }
  version(o, v) {
    if (o.version !== v)
      conflict(
        "STALE_VERSION",
        "Sales order changed; reload and review before retrying",
      );
  }
  async save(o, values, t) {
    const [n] = await this.r.updateWhere(
      "sales_orders",
      { ...values, version: o.version + 1, updatedAt: new Date() },
      { where: { id: o.id, version: o.version }, transaction: t },
    );
    if (n !== 1) conflict("STALE_VERSION");
    await o.reload({ transaction: t });
  }
  dates(o, complete = false) {
    if (o.requestedDeliveryDate && o.requestedDeliveryDate < o.orderDate)
      invalid("requestedDeliveryDate", "Must be on or after orderDate");
    if (o.buyerPoDate && o.buyerPoDate > businessDate())
      invalid("buyerPoDate", "Cannot be in the future");
    if (
      complete &&
      (!o.requestedDeliveryDate || o.requestedDeliveryDate < businessDate())
    )
      invalid("requestedDeliveryDate", "Required and must be today or later");
  }
  async activeActor(actor, t) {
    const u = await this.r.findById("users", actor.id, { transaction: t });
    if (!u?.isActive)
      throw new AppError(
        401,
        "INVALID_PRINCIPAL",
        "An active principal is required",
      );
  }
  async address(id, buyer, type, t, complete = false) {
    await customerGuard(this.r, buyer, t, { requireActive: false });
    if (!id) {
      if (complete) invalid(type + "AddressId", "Required before confirmation");
      return null;
    }
    const a = await this.r.findById("customer_addresses", id, {
      transaction: t,
      lock: t.LOCK.SHARE,
    });
    if (
      !a?.isActive ||
      !env.countries.includes(a.country) ||
      a.customerId !== buyer ||
      a.addressType !== type
    )
      invalid(
        type + "AddressId",
        `Select an active ${type} address belonging to this buyer`,
      );
    if (
      complete &&
      (!a.line1.trim() || !a.city.trim() || !/^[A-Z]{2}$/.test(a.country))
    )
      invalid(type + "AddressId", "Complete the address in master data");
    return pick(a, [
      "id",
      "addressType",
      "line1",
      "line2",
      "city",
      "postalCode",
      "country",
    ]);
  }
  async masters(o, t, complete = false) {
    const opt = { transaction: t, lock: t.LOCK.SHARE };
    const buyer = await customerGuard(this.r, o.customerId, t);
    await teamGuard(this.r, o.salesTeamId, o.ownerId, t);
    const team = await this.r.findById("sales_teams", o.salesTeamId, opt);
    const owner = await this.r.findById("users", o.ownerId, opt);
    const member = await this.r.one("sales_team_members", {
      where: { teamId: o.salesTeamId, userId: o.ownerId },
      ...opt,
    });
    if (
      buyer &&
      (!env.countries.includes(buyer.country) ||
        !["USD", "LKR", "GBP", "EUR"].includes(buyer.currency))
    )
      invalid(
        "customerId",
        "Buyer country/currency is not in the configured allowlist",
      );
    if (!buyer?.isActive) invalid("customerId", "Select an active buyer");
    if (!team?.isActive) invalid("salesTeamId", "Select an active team");
    if (!owner?.isActive || !member?.isActive)
      invalid("ownerId", "Owner must be an active member of the selected team");
    const contacts = await this.r.many("customer_contacts", {
      where: { customerId: buyer.id, isActive: true },
      order: [["id", "ASC"]],
      ...opt,
    });
    if (
      complete &&
      (!buyer.name.trim() ||
        !/^[A-Z]{2}$/.test(buyer.country) ||
        !contacts.some(
          (c) => c.isPrimary && c.name.trim() && (c.email || c.phone),
        ))
    )
      invalid(
        "customerId",
        "Buyer needs complete details and an active primary contact",
      );
    return {
      customerSnapshot: {
        ...pick(buyer, ["id", "code", "name", "country", "currency"]),
        contacts: contacts.map((c) =>
          pick(c, ["id", "name", "email", "phone", "isPrimary"]),
        ),
      },
      billingAddressSnapshot: await this.address(
        o.billingAddressId,
        o.customerId,
        "billing",
        t,
        complete,
      ),
      shippingAddressSnapshot: await this.address(
        o.shippingAddressId,
        o.customerId,
        "shipping",
        t,
        complete,
      ),
    };
  }
  async idempotent(actor, action, path, body, key, requestId, work) {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key is required (1-128 printable characters)",
      );
    return this.transaction(async (t) => {
      await this.activeActor(actor, t);
      const operation = `sales-orders:${action}`;
      const row = await this.r.reserveConversion(
        actor.id,
        operation,
        key,
        hash({ method: "POST", path, body }),
        t,
      );
      if (row.requestHash !== hash({ method: "POST", path, body }))
        conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "Key already used with a different request",
        );
      if (row.state === "completed") {
        const current = await this.r.lockedOrder(row.resourceId, t, true);
        authorize(actor, current, action === "create" ? "create" : action);
        return { status: row.responseStatus, body: row.responseBody };
      }
      const result = await work(t);
      await this.r.save(
        row,
        {
          state: "completed",
          responseStatus: result.status,
          responseBody: result.body,
          resourceId: result.body.data.order?.id || result.body.data.id,
        },
        { transaction: t },
      );
      return result;
    });
  }
  async create(actor, input, key, requestId) {
    authorize(actor, input, "create");
    return this.idempotent(
      actor,
      "create",
      "/sales-orders",
      input,
      key,
      requestId,
      async (t) => {
        const fields = {
          ...input,
          orderDate: input.orderDate || businessDate(),
        };
        this.dates(fields);
        const masters = await this.masters(fields, t);
        const { lines, ...totals } = await this.commercial.resolveLines(
          fields.lines,
          t,
        );
        const o = await this.r.insert(
          "sales_orders",
          {
            ...pick(fields, copyFields),
            ...masters,
            ...totals,
            id: randomUUID(),
            orderNumber: await this.r.number("SALES_ORDER", t),
            status: "Draft",
            createdBy: actor.id,
            updatedBy: actor.id,
            ...stamps(),
          },
          { transaction: t },
        );
        await this.r.replaceLines(o.id, lines, t);
        await this.r.audit(o, actor, "create", null, null, requestId, t, {
          source: "direct",
        });
        return {
          status: 201,
          body: { data: await this.detail(actor, o.id, t) },
        };
      },
    );
  }
  async detail(actor, id, t) {
    if (!t) return this.r.read((t) => this.detail(actor, id, t));
    await this.activeActor(actor, t);
    const o = await this.r.findById("sales_orders", id, { transaction: t });
    if (!o || o.deletedAt)
      throw new AppError(404, "NOT_FOUND", "Sales order not found");
    authorize(actor, o);
    const lines = await this.r.lines(id, t);
    const h = await this.r.handoff(id, t);
    const progress = await this.r.delivered(id, lines, t);
    const activity = await this.r.hasActivity(id, t);
    const deliveredQty = progress.reduce((s, l) => s + l.deliveredQty, 0);
    return {
      ...pick(o, headerFields),
      customerName: o.customerSnapshot?.name || "",
      totalQty: Number(o.totalQty),
      lines: lines.map(mapLine),
      source: o.sourceQuotationId ? "quotation" : "direct",
      handoff: handoffSummary(h),
      fulfilment: {
        orderedQty: Number(o.totalQty),
        deliveredQty,
        remainingQty: Number(o.totalQty) - deliveredQty,
        lines: progress,
      },
      allowedActions: allowedActions(
        actor,
        o,
        h,
        activity,
        progress.length > 0 && progress.every((l) => l.remainingQty === 0),
      ),
    };
  }
  async list(actor, query) {
    return this.r.read(async (t) => {
      await this.activeActor(actor, t);
      const { rows, count } = await this.r.list(actor, query, t);
      const data = [];
      for (const o of rows) {
        const detail = await this.detail(actor, o.id, t);
        data.push({ ...summary(o), allowedActions: detail.allowedActions });
      }
      return {
        data,
        meta: { page: query.page, pageSize: query.pageSize, total: count },
      };
    });
  }
  async patch(actor, id, body, requestId) {
    return this.transaction(async (t) => {
      await this.activeActor(actor, t);
      const o = await this.r.lockedOrder(id, t);
      authorize(actor, o, "edit");
      this.version(o, body.version);
      if (o.status !== "Draft") conflict();
      if (
        o.sourceQuotationId &&
        Object.keys(body).some(
          (k) => k !== "version" && !convertedEditable.includes(k),
        )
      )
        conflict(
          "FROZEN_QUOTATION_FIELDS",
          "Quoted commercial fields cannot be changed, even to the same value",
        );
      const fields = { ...pick(o, copyFields), ...pick(body, copyFields) };
      this.dates(fields);
      authorize(actor, fields, "edit");
      if (body.customerId && body.customerId !== o.customerId) {
        for (const key of ["billingAddressId", "shippingAddressId"])
          if (!(key in body))
            invalid(
              key,
              "Replace or explicitly clear addresses when changing buyer",
            );
      }
      let changes = pick(body, copyFields);
      if (o.sourceQuotationId) {
        await customerGuard(this.r, o.customerId, t);
        await teamGuard(this.r, o.salesTeamId, o.ownerId, t);
        if ("shippingAddressId" in body)
          changes.shippingAddressSnapshot = await this.address(
            body.shippingAddressId,
            o.customerId,
            "shipping",
            t,
          );
      } else {
        Object.assign(changes, await this.masters(fields, t));
        const current =
          body.lines ||
          (await this.r.lines(id, t)).map((l) => ({
            styleId: l.styleId,
            variantId: l.variantId,
            colour: l.colourSnapshot,
            size: l.sizeSnapshot,
            qty: l.quantity,
            unitPrice: l.unitPrice,
          }));
        const { lines, ...totals } = await this.commercial.resolveLines(
          current,
          t,
        );
        Object.assign(changes, totals);
        await this.r.replaceLines(id, lines, t);
      }
      const oldShipping = o.shippingAddressId;
      await this.save(o, { ...changes, updatedBy: actor.id }, t);
      await this.r.audit(
        o,
        actor,
        "update",
        "Draft",
        null,
        requestId,
        t,
        "shippingAddressId" in body
          ? {
              shippingChange: { from: oldShipping, to: o.shippingAddressId },
              fields: Object.keys(body).filter((k) => k !== "version"),
            }
          : { fields: Object.keys(body).filter((k) => k !== "version") },
      );
      return this.detail(actor, id, t);
    });
  }
  async remove(actor, id, version, requestId) {
    return this.transaction(async (t) => {
      await this.activeActor(actor, t);
      const o = await this.r.lockedOrder(id, t);
      authorize(actor, o, "delete");
      this.version(o, version);
      if (o.status !== "Draft") conflict();
      await this.save(
        o,
        { deletedAt: new Date(), deletedBy: actor.id, updatedBy: actor.id },
        t,
      );
      await this.r.audit(o, actor, "delete", "Draft", null, requestId, t);
    });
  }
  async verifyConverted(o, lines, t) {
    const q = await this.r.findById("quotations", o.sourceQuotationId, {
      transaction: t,
    });
    const f =
      q &&
      (await this.r.findById("quotation_families", q.familyId, {
        transaction: t,
      }));
    if (
      !q ||
      q.status !== "Converted" ||
      f.acceptedRevisionId !== q.id ||
      f.convertedOrderId !== o.id
    )
      conflict("FROZEN_QUOTATION_FIELDS", "Invalid source quotation linkage");
    for (const key of [
      "customerId",
      "salesTeamId",
      "ownerId",
      "currency",
      "billingAddressId",
      "paymentTerms",
      "subtotal",
      "total",
      "customerSnapshot",
      "billingAddressSnapshot",
    ])
      if (canonical(o[key]) !== canonical(q[key]))
        conflict(
          "FROZEN_QUOTATION_FIELDS",
          "Converted commercial content differs from accepted quotation",
        );
    const quoted = await this.r.many("quotation_lines", {
      where: { quotationId: q.id },
      order: [["lineNo", "ASC"]],
      transaction: t,
    });
    const fields = [
      "lineNo",
      "variantId",
      "styleId",
      "styleCodeSnapshot",
      "styleNameSnapshot",
      "fabricSnapshot",
      "gsmSnapshot",
      "colourSnapshot",
      "sizeSnapshot",
      "uom",
      "quantity",
      "unitPrice",
      "lineTotal",
    ];
    if (
      canonical(
        lines
          .slice()
          .sort((a, b) => a.lineNo - b.lineNo)
          .map((l) => pick(l, fields)),
      ) !== canonical(quoted.map((l) => pick(l, fields))) ||
      Number(o.totalQty) !== Number(q.totalQty) ||
      o.sourceQuoteNumber !== f.quoteNumber ||
      o.sourceRevisionNo !== q.revisionNo
    )
      conflict(
        "FROZEN_QUOTATION_FIELDS",
        "Converted garment content differs from accepted quotation",
      );
  }
  async confirm(actor, id, body, key, requestId) {
    return this.idempotent(
      actor,
      "confirm",
      `/sales-orders/${id}/confirm`,
      body,
      key,
      requestId,
      async (t) => {
        const o = await this.r.lockedOrder(id, t);
        authorize(actor, o, "confirm");
        this.version(o, body.version);
        if (o.status !== "Draft") conflict();
        this.dates(o, true);
        if (!o.buyerPoNumber?.trim())
          invalid("buyerPoNumber", "Required before confirmation");
        if (!o.paymentTerms?.trim())
          invalid("paymentTerms", "Required before confirmation");
        await this.r.handoff(id, t, true);
        const lines = await this.r.lines(id, t, true);
        if (!lines.length) invalid("lines", "At least one garment is required");
        const masters = await this.masters(o, t, true);
        const resolved = await this.commercial.resolveLines(
          lines
            .slice()
            .sort((a, b) => a.lineNo - b.lineNo)
            .map((l) => ({
              styleId: l.styleId,
              variantId: l.variantId,
              colour: l.colourSnapshot,
              size: l.sizeSnapshot,
              qty: l.quantity,
              unitPrice: l.unitPrice,
            })),
          t,
          true,
        );
        if (o.sourceQuotationId) await this.verifyConverted(o, lines, t);
        else {
          // Refresh snapshots without replacing the stable line IDs used by future integrations.
          for (const l of resolved.lines) {
            const existing = lines.find((old) => old.lineNo === l.lineNo);
            await this.r.save(
              existing,
              pick(l, [
                "styleCodeSnapshot",
                "styleNameSnapshot",
                "fabricSnapshot",
                "gsmSnapshot",
                "colourSnapshot",
                "sizeSnapshot",
                "uom",
                "lineTotal",
              ]),
              { transaction: t },
            );
          }
        }
        const { lines: _resolvedLines, ...totals } = resolved;
        await this.save(
          o,
          {
            ...(o.sourceQuotationId ? {} : { ...masters, ...totals }),
            status: "Confirmed",
            documentRevision: 1,
            confirmedBy: actor.id,
            confirmedAt: new Date(),
            updatedBy: actor.id,
          },
          t,
        );
        const frozen = snapshot(o, await this.r.lines(id, t));
        await this.r.insert(
          "sales_order_revisions",
          {
            id: randomUUID(),
            salesOrderId: id,
            revisionNo: 1,
            reason: body.comment || "Manager confirmation",
            snapshotSchemaVersion: 1,
            snapshot: frozen,
            createdBy: actor.id,
            createdAt: new Date(),
          },
          { transaction: t },
        );
        await this.r.insert(
          "sales_order_handoffs",
          {
            id: randomUUID(),
            salesOrderId: id,
            documentRevision: 1,
            status: "Queued",
            payload: frozen,
            ...stamps(),
          },
          { transaction: t },
        );
        await this.r.audit(
          o,
          actor,
          "confirm",
          "Draft",
          body.comment,
          requestId,
          t,
          { documentRevision: 1 },
        );
        return { status: 200, body: { data: await this.detail(actor, id, t) } };
      },
    );
  }
  async local(o, t, code) {
    const h = await this.r.handoff(o.id, t, true);
    if (
      o.status !== "Confirmed" ||
      !h ||
      h.status !== "Queued" ||
      h.claimedAt ||
      (await this.r.hasActivity(o.id, t))
    )
      conflict(
        code,
        "The handoff has left the safe local queue or fulfilment activity exists",
      );
    return h;
  }
  async action(actor, id, action, body, requestId) {
    return this.transaction(async (t) => {
      await this.activeActor(actor, t);
      const o = await this.r.lockedOrder(id, t);
      authorize(actor, o, action);
      this.version(o, body.version);
      const from = o.status;
      let changes = { updatedBy: actor.id };
      if (action === "cancel") {
        if (o.status === "Confirmed") {
          const h = await this.local(o, t, "CANCELLATION_BLOCKED");
          await this.r.save(
            h,
            {
              status: "Cancelled",
              version: h.version + 1,
              updatedAt: new Date(),
            },
            { transaction: t },
          );
        } else if (o.status !== "Draft" || (await this.r.hasActivity(id, t)))
          conflict("CANCELLATION_BLOCKED");
        changes = {
          ...changes,
          status: "Cancelled",
          cancelledBy: actor.id,
          cancelledAt: new Date(),
          cancellationReason: body.reason,
          isOnHold: false,
          holdReason: null,
          heldBy: null,
          heldAt: null,
        };
      } else if (["hold", "resume"].includes(action)) {
        await this.local(o, t, "HOLD_BLOCKED");
        if ((action === "hold") === Boolean(o.isOnHold))
          conflict(
            "HOLD_BLOCKED",
            "Order is already in the requested hold state",
          );
        changes = {
          ...changes,
          isOnHold: action === "hold",
          holdReason: action === "hold" ? body.reason : null,
          heldBy: action === "hold" ? actor.id : null,
          heldAt: action === "hold" ? new Date() : null,
        };
      } else if (action === "close") {
        const h = await this.r.handoff(id, t, true);
        const lines = await this.r.lines(id, t, true);
        const progress = await this.r.delivered(id, lines, t);
        if (
          o.status !== "Delivered" ||
          !progress.length ||
          !progress.every((l) => l.remainingQty === 0)
        )
          conflict(
            "DELIVERY_INCOMPLETE",
            "Every line must be fully delivered before closure",
          );
        if (["Claimed", "Failed"].includes(h?.status))
          conflict(
            "DELIVERY_INCOMPLETE",
            "Reconcile the ambiguous handoff before closure",
          );
        changes = {
          ...changes,
          status: "Closed",
          closedBy: actor.id,
          closedAt: new Date(),
        };
      } else conflict();
      await this.save(o, changes, t);
      await this.r.audit(
        o,
        actor,
        action,
        from,
        body.reason || body.comment,
        requestId,
        t,
      );
      return this.detail(actor, id, t);
    });
  }
  async revise(actor, id, body, key, requestId) {
    return this.idempotent(
      actor,
      "revisions",
      `/sales-orders/${id}/revisions`,
      body,
      key,
      requestId,
      async (t) => {
        const o = await this.r.lockedOrder(id, t);
        authorize(actor, o, "revisions");
        this.version(o, body.version);
        const h = await this.local(o, t, "AMENDMENT_BLOCKED");
        const changes = { ...body.changes };
        if (changes.requestedDeliveryDate) {
          this.dates({ ...o.toJSON(), ...changes }, true);
        }
        if (changes.shippingAddressId)
          changes.shippingAddressSnapshot = await this.address(
            changes.shippingAddressId,
            o.customerId,
            "shipping",
            t,
            true,
          );
        await this.save(
          o,
          {
            ...changes,
            documentRevision: o.documentRevision + 1,
            updatedBy: actor.id,
          },
          t,
        );
        const frozen = snapshot(o, await this.r.lines(id, t));
        const r = await this.r.insert(
          "sales_order_revisions",
          {
            id: randomUUID(),
            salesOrderId: id,
            revisionNo: o.documentRevision,
            reason: body.reason,
            buyerReference: body.buyerReference,
            snapshotSchemaVersion: 1,
            snapshot: frozen,
            createdBy: actor.id,
            createdAt: new Date(),
          },
          { transaction: t },
        );
        await this.r.save(
          h,
          {
            documentRevision: o.documentRevision,
            payload: frozen,
            version: h.version + 1,
            updatedAt: new Date(),
          },
          { transaction: t },
        );
        await this.r.audit(
          o,
          actor,
          "revision",
          "Confirmed",
          body.reason,
          requestId,
          t,
          {
            documentRevision: o.documentRevision,
            buyerReference: body.buyerReference,
            changedFields: Object.keys(body.changes),
          },
        );
        return {
          status: 201,
          body: {
            data: {
              order: await this.detail(actor, id, t),
              revision: revisionDetail(r),
            },
          },
        };
      },
    );
  }
  async revisions(actor, id, q) {
    return this.r.read(async (t) => {
      await this.detail(actor, id, t);
      const where = {
        salesOrderId: id,
        ...(q.revision ? { revisionNo: q.revision } : {}),
      };
      const { rows, count } =
        await this.r.m.sales_order_revisions.findAndCountAll({
          where,
          order: [["revisionNo", "DESC"]],
          limit: q.pageSize,
          offset: (q.page - 1) * q.pageSize,
          transaction: t,
        });
      return {
        data: rows.map(revisionDetail),
        meta: { page: q.page, pageSize: q.pageSize, total: count },
      };
    });
  }
  async activity(actor, id, q) {
    return this.r.read(async (t) => {
      await this.detail(actor, id, t);
      const { rows, count } = await this.r.m.audit_events.findAndCountAll({
        where: {
          entityType: "sales_order",
          entityId: id,
          ...(q.action ? { action: q.action } : {}),
        },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
        transaction: t,
      });
      const data = [];
      for (const e of rows) {
        const u =
          e.actorId &&
          (await this.r.findById("users", e.actorId, { transaction: t }));
        data.push({
          id: e.id,
          action: e.action,
          actor: u ? pick(u, ["id", "displayName"]) : null,
          occurredAt: e.createdAt,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          reason: e.reason,
          metadata: e.metadata,
        });
      }
      return {
        data,
        meta: { page: q.page, pageSize: q.pageSize, total: count },
      };
    });
  }
  async fulfilment(actor, id) {
    return this.r.read(async (t) => {
      const o = await this.detail(actor, id, t);
      const events = await this.r.many("fulfilment_events", {
        where: { salesOrderId: id },
        order: [
          ["occurredAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: 20,
        transaction: t,
      });
      return {
        orderId: id,
        status: o.status,
        source: (await this.r.one("fulfilment_events", {
          where: { salesOrderId: id, source: "integration" },
          transaction: t,
        }))
          ? "integration"
          : "demo",
        ...o.fulfilment,
        handoff: o.handoff,
        latestEvents: events.map((e) =>
          pick(e, [
            "id",
            "provider",
            "externalEventId",
            "eventType",
            "externalReference",
            "occurredAt",
            "receivedAt",
            "source",
          ]),
        ),
      };
    });
  }
  async pdfData(actor, id, revision) {
    return this.r.read(async (t) => {
      const o = await this.detail(actor, id, t);
      let frozen;
      if (revision || o.documentRevision) {
        const r = await this.r.one("sales_order_revisions", {
          where: {
            salesOrderId: id,
            revisionNo: revision || o.documentRevision,
          },
          transaction: t,
        });
        if (!r)
          throw new AppError(404, "NOT_FOUND", "Document revision not found");
        frozen = r.snapshot;
      } else frozen = snapshot(o, o.lines, 0);
      return {
        snapshot: frozen,
        currentStatus: o.status,
        isOnHold: o.isOnHold,
        superseded: frozen.documentRevision < o.documentRevision,
      };
    });
  }
}
