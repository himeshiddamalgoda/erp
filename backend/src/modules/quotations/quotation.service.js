import { teamGuard } from "../../shared/team-guard.js";
import { customerGuard } from "../../shared/customer-guard.js";
import { randomUUID, createHash } from "node:crypto";
import Decimal from "decimal.js";
import { businessDate } from "../../config/env.js";
import { AppError, conflict, invalid } from "../../shared/errors.js";
import { authorize, allowedActions } from "./quotation.policy.js";
import { summary, mapLine, orderSummary } from "./quotation.mapper.js";
const nowFields = () => ({ createdAt: new Date(), updatedAt: new Date() });
const reset = {
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
};
const commercialFields = [
  "customerId",
  "salesTeamId",
  "ownerId",
  "currency",
  "quotationDate",
  "validUntil",
  "requestedDeliveryDate",
  "billingAddressId",
  "shippingAddressId",
  "paymentTerms",
  "notes",
];
const pick = (source, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
export class QuotationService {
  constructor(repository) {
    this.r = repository;
  }
  version(q, version) {
    if (q.version !== version)
      conflict("STALE_VERSION", "Quotation changed; reload before retrying");
  }
  unlocked(f) {
    if (f.acceptedRevisionId || f.convertedOrderId)
      conflict(
        "FAMILY_ALREADY_ACCEPTED",
        "This quotation family has an accepted commercial agreement",
      );
  }
  dates(q) {
    for (const field of ["validUntil", "requestedDeliveryDate"])
      if (q[field] && q[field] < q.quotationDate)
        invalid(field, "Must be on or after quotationDate");
  }
  async save(q, values, t) {
    await this.r.save(
      q,
      { ...values, version: q.version + 1, updatedAt: new Date() },
      { transaction: t },
    );
  }
  async familySave(f, values, t) {
    await this.r.save(
      f,
      { ...values, version: f.version + 1, updatedAt: new Date() },
      { transaction: t },
    );
  }
  async masters(
    q,
    t,
    complete = false,
    includeStyles = false,
    lockMasters = true,
  ) {
    const options = {
      transaction: t,
      ...(t && lockMasters ? { lock: t.LOCK.SHARE } : {}),
    };
    const customer =
      t && lockMasters
        ? await customerGuard(this.r, q.customerId, t)
        : await this.r.findById("customers", q.customerId, options);
    if (t && lockMasters) await teamGuard(this.r, q.salesTeamId, q.ownerId, t);
    const team = await this.r.findById("sales_teams", q.salesTeamId, options);
    const owner = await this.r.findById("users", q.ownerId, options);
    const membership = await this.r.one("sales_team_members", {
      where: { teamId: q.salesTeamId, userId: q.ownerId },
      ...options,
    });
    if (!customer?.isActive) invalid("customerId", "Select an active buyer");
    if (!team?.isActive) invalid("salesTeamId", "Select an active sales team");
    if (!owner?.isActive || !membership?.isActive)
      invalid("ownerId", "Owner must be an active member of the selected team");
    const addresses = {};
    for (const [field, type] of [
      ["billingAddressId", "billing"],
      ["shippingAddressId", "shipping"],
    ]) {
      if (complete && !q[field]) invalid(field, "Required for submission");
      if (q[field]) {
        const address = await this.r.findById(
          "customer_addresses",
          q[field],
          options,
        );
        if (
          !address?.isActive ||
          address.customerId !== customer.id ||
          address.addressType !== type
        )
          invalid(
            field,
            `Select an active ${type} address belonging to this buyer`,
          );
        addresses[type] = pick(address, [
          "id",
          "addressType",
          "line1",
          "line2",
          "city",
          "postalCode",
          "country",
        ]);
      }
    }
    const contacts = await this.r.many("customer_contacts", {
      where: { customerId: customer.id, isActive: true },
      order: [["id", "ASC"]],
      ...options,
    });
    if (complete) {
      if (
        !customer.name?.trim() ||
        !customer.country ||
        !contacts.some((c) => c.name?.trim() && (c.email || c.phone))
      )
        invalid(
          "customerId",
          "Buyer must have complete details and an active contact with email or phone",
        );
      if (!q.validUntil) invalid("validUntil", "Required for submission");
      if (q.validUntil < businessDate())
        conflict("QUOTATION_EXPIRED", "Quotation validity has ended");
      if (!q.requestedDeliveryDate)
        invalid("requestedDeliveryDate", "Required for submission");
      if (!q.paymentTerms?.trim())
        invalid("paymentTerms", "Required for submission");
      this.dates(q);
    }
    if (includeStyles) {
      const lines = await this.r.lines(q.id, t);
      for (const line of [...lines].sort((a, b) =>
        `${a.styleId}/${a.variantId}`.localeCompare(
          `${b.styleId}/${b.variantId}`,
        ),
      )) {
        const style = await this.r.findById("styles", line.styleId, options);
        const variant = await this.r.findById(
          "style_variants",
          line.variantId,
          options,
        );
        if (
          !style?.isActive ||
          style.uom !== "PCS" ||
          !variant?.isActive ||
          variant.styleId !== style.id
        )
          invalid(
            "lines",
            "All referenced styles and variants must be active PCS garments",
          );
      }
    }
    return {
      customerSnapshot: {
        ...pick(customer, ["id", "code", "name", "country", "currency"]),
        contacts: contacts.map((c) =>
          pick(c, ["id", "name", "email", "phone", "isPrimary"]),
        ),
      },
      billingAddressSnapshot: addresses.billing || null,
      shippingAddressSnapshot: addresses.shipping || null,
    };
  }
  async resolveLines(inputs, t, positive = false) {
    const lines = [];
    const seen = new Set();
    let totalQty = 0;
    let subtotal = new Decimal(0);
    // Stable master lock order for all callers.
    const resolved = new Map();
    for (const input of [...inputs].sort((a, b) =>
      `${a.styleId}/${a.colour}/${a.size}`.localeCompare(
        `${b.styleId}/${b.colour}/${b.size}`,
      ),
    )) {
      const style = await this.r.findById("styles", input.styleId, {
        transaction: t,
        ...(t ? { lock: t.LOCK.SHARE } : {}),
      });
      const lookup = { transaction: t, ...(t ? { lock: t.LOCK.SHARE } : {}) };
      const variant = input.variantId
        ? await this.r.findById("style_variants", input.variantId, lookup)
        : await this.r.one("style_variants", {
            where: {
              styleId: input.styleId,
              colour: input.colour,
              size: input.size,
            },
            ...lookup,
          });
      if (
        !style?.isActive ||
        style.uom !== "PCS" ||
        !variant?.isActive ||
        variant.styleId !== style.id
      )
        invalid(
          `lines[${inputs.indexOf(input)}].styleId`,
          "Select an active PCS style and permitted colour/size variant",
        );
      resolved.set(input, { style, variant });
    }
    for (const [index, input] of inputs.entries()) {
      const { style, variant } = resolved.get(input);
      if (seen.has(variant.id))
        invalid(
          `lines[${index}]`,
          "Duplicate style/colour/size; combine quantities into one line",
        );
      seen.add(variant.id);
      const price = new Decimal(input.unitPrice);
      if (positive && price.lte(0))
        invalid(
          `lines[${index}].unitPrice`,
          "Must be greater than zero before submission",
        );
      const lineTotal = price.times(input.qty);
      subtotal = subtotal.plus(lineTotal);
      totalQty += input.qty;
      if (
        lineTotal.gt("9999999999999999.99") ||
        subtotal.gt("9999999999999999.99")
      )
        invalid("lines", "Totals exceed DECIMAL(18,2) precision");
      lines.push({
        id: randomUUID(),
        lineNo: index + 1,
        variantId: variant.id,
        styleId: style.id,
        styleCodeSnapshot: style.code,
        styleNameSnapshot: style.name,
        fabricSnapshot: style.fabricDescription,
        gsmSnapshot: style.gsm,
        colourSnapshot: variant.colour,
        sizeSnapshot: variant.size,
        uom: "PCS",
        quantity: input.qty,
        unitPrice: price.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        ...nowFields(),
      });
    }
    return {
      lines,
      totalQty,
      subtotal: subtotal.toFixed(2),
      total: subtotal.toFixed(2),
    };
  }
  async create(actor, input, requestId) {
    authorize(actor, input, "create");
    this.dates(input);
    return this.r.transaction(async (t) => {
      await this.masters(input, t);
      const { lines, ...totals } = await this.resolveLines(input.lines, t);
      const family = await this.r.insert(
        "quotation_families",
        {
          id: randomUUID(),
          quoteNumber: await this.r.number("QUOTATION", t),
          latestRevisionNo: 1,
          createdBy: actor.id,
          ...nowFields(),
        },
        { transaction: t },
      );
      const quote = await this.r.insert(
        "quotations",
        {
          ...pick(input, commercialFields),
          ...totals,
          id: randomUUID(),
          familyId: family.id,
          revisionNo: 1,
          status: "Draft",
          createdBy: actor.id,
          updatedBy: actor.id,
          ...nowFields(),
        },
        { transaction: t },
      );
      await this.r.replaceLines(quote.id, lines, t);
      await this.r.audit(quote, actor, "create", null, null, requestId, t);
      return this.detail(actor, quote.id, t);
    });
  }
  async detail(actor, id, t) {
    if (!t) return this.r.read((tx) => this.detail(actor, id, tx));
    const q = await this.r.findById("quotations", id, { transaction: t });
    if (!q || q.deletedAt)
      throw new AppError(404, "NOT_FOUND", "Quotation not found");
    authorize(actor, q);
    const family = await this.r.findById("quotation_families", q.familyId, {
      transaction: t,
    });
    const customer = await this.r.findById("customers", q.customerId, {
      transaction: t,
    });
    const lines = await this.r.lines(id, t);
    const revisions = await this.r.revisions(q.familyId, t);
    const order = await this.r.one("sales_orders", {
      where: { sourceQuotationId: id },
      transaction: t,
    });
    const audit = await this.r.many("audit_events", {
      where: { entityType: "quotation", entityId: id },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      transaction: t,
    });
    let actions = allowedActions(actor, q, family, revisions, businessDate());
    for (const action of ["submit", "approve", "issue", "convert"])
      if (actions.includes(action)) {
        try {
          await this.masters(
            q,
            t,
            action !== "convert",
            action !== "convert",
            false,
          );
          if (
            action === "submit" &&
            lines.some((l) => new Decimal(l.unitPrice).lte(0))
          )
            throw new AppError(
              422,
              "VALIDATION_ERROR",
              "Prices must be positive",
            );
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          actions = actions.filter((a) => a !== action);
        }
      }
    let current = null;
    let draftLines = null;
    if (q.status === "Draft") {
      draftLines = [];
      for (const line of lines) {
        const style = await this.r.findById("styles", line.styleId, {
          transaction: t,
        });
        const variant = await this.r.findById(
          "style_variants",
          line.variantId,
          {
            transaction: t,
          },
        );
        draftLines.push({
          ...mapLine(line),
          styleCode: style.code,
          styleName: style.name,
          fabric: style.fabricDescription,
          gsm: style.gsm,
          colour: variant.colour,
          size: variant.size,
        });
      }
      // Reads must remain possible after a referenced master record is deactivated.
      const addresses = await this.r.addresses(
        [q.billingAddressId, q.shippingAddressId],
        t,
      );
      const contacts = await this.r.many("customer_contacts", {
        where: { customerId: q.customerId, isActive: true },
        transaction: t,
      });
      current = {
        customer: {
          ...pick(customer, ["id", "code", "name", "country", "currency"]),
          contacts: contacts.map((c) =>
            pick(c, ["id", "name", "email", "phone", "isPrimary"]),
          ),
        },
        billingAddress: addresses.find((a) => a.id === q.billingAddressId)
          ? pick(
              addresses.find((a) => a.id === q.billingAddressId),
              [
                "id",
                "addressType",
                "line1",
                "line2",
                "city",
                "postalCode",
                "country",
              ],
            )
          : null,
        shippingAddress: addresses.find((a) => a.id === q.shippingAddressId)
          ? pick(
              addresses.find((a) => a.id === q.shippingAddressId),
              [
                "id",
                "addressType",
                "line1",
                "line2",
                "city",
                "postalCode",
                "country",
              ],
            )
          : null,
      };
    }
    return {
      ...summary(q, family, customer),
      quotationDate: q.quotationDate,
      billingAddressId: q.billingAddressId,
      shippingAddressId: q.shippingAddressId,
      paymentTerms: q.paymentTerms,
      notes: q.notes,
      priorRevisionId: q.priorRevisionId,
      customerSnapshot: q.customerSnapshot,
      billingAddressSnapshot: q.billingAddressSnapshot,
      shippingAddressSnapshot: q.shippingAddressSnapshot,
      draftBuyer: current,
      lines: draftLines || lines.map(mapLine),
      submittedBy: q.submittedBy,
      submittedAt: q.submittedAt,
      approvedBy: q.approvedBy,
      approvedAt: q.approvedAt,
      issuedAt: q.issuedAt,
      buyerDecision: q.buyerDecision,
      buyerResponseReference: q.buyerResponseReference,
      buyerResponseReason: q.buyerResponseReason,
      buyerResponseAt: q.buyerResponseAt,
      salesOrderId: order?.id || null,
      linkedOrder: order ? orderSummary(order) : null,
      familyLocked: Boolean(
        family.acceptedRevisionId || family.convertedOrderId,
      ),
      revisions: revisions
        .filter(
          (r) =>
            !r.deletedAt &&
            (actor.role === "Admin" ||
              actor.salesTeamIds.includes(r.salesTeamId)),
        )
        .map((r) => ({
          id: r.id,
          revision: r.revisionNo,
          status: r.status,
          version: r.version,
          priorRevisionId: r.priorRevisionId,
        })),
      audit: audit.map((a) =>
        pick(a, [
          "id",
          "actorId",
          "action",
          "fromStatus",
          "toStatus",
          "reason",
          "metadata",
          "requestId",
          "createdAt",
        ]),
      ),
      allowedActions: actions,
    };
  }
  async list(actor, query, t) {
    if (!t) return this.r.read((tx) => this.list(actor, query, tx));
    const { ids, total } = await this.r.list(actor, query, t);
    const data = [];
    for (const id of ids) {
      const q = await this.r.findById("quotations", id, { transaction: t });
      const family = await this.r.findById("quotation_families", q.familyId, {
        transaction: t,
      });
      const customer = await this.r.findById("customers", q.customerId, {
        transaction: t,
      });
      data.push(summary(q, family, customer));
    }
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
  async patch(actor, id, input, requestId) {
    return this.r.transaction(async (t) => {
      const { quote: q, family } = await this.r.locked(id, t);
      authorize(actor, q, "edit");
      this.unlocked(family);
      this.version(q, input.version);
      if (q.status !== "Draft") conflict();
      const merged = { ...q.toJSON(), ...pick(input, commercialFields) };
      authorize(actor, merged, "edit");
      this.dates(merged);
      await this.masters(merged, t);
      let totals = {};
      if (input.lines) {
        const resolved = await this.resolveLines(input.lines, t);
        const { lines, ...computed } = resolved;
        await this.r.replaceLines(id, lines, t);
        totals = computed;
      }
      await this.save(
        q,
        { ...pick(input, commercialFields), ...totals, updatedBy: actor.id },
        t,
      );
      await this.r.audit(q, actor, "update", "Draft", null, requestId, t);
      return this.detail(actor, id, t);
    });
  }
  async remove(actor, id, version, requestId) {
    await this.r.transaction(async (t) => {
      const { quote: q, family } = await this.r.locked(id, t);
      authorize(actor, q, "delete");
      this.unlocked(family);
      this.version(q, version);
      if (q.status !== "Draft") conflict();
      await this.save(
        q,
        { deletedAt: new Date(), deletedBy: actor.id, updatedBy: actor.id },
        t,
      );
      await this.r.audit(q, actor, "delete", q.status, null, requestId, t);
    });
  }
  async expireOne(id, actor = null) {
    return this.r.transaction(async (t) => {
      const { quote: q, family } = await this.r.locked(id, t);
      if (actor) authorize(actor, q);
      if (
        q.status !== "Issued" ||
        !q.validUntil ||
        q.validUntil >= businessDate()
      )
        return false;
      await this.save(q, { status: "Expired" }, t);
      if (family.activeIssuedRevisionId === q.id)
        await this.familySave(family, { activeIssuedRevisionId: null }, t);
      await this.r.audit(q, null, "expiry", "Issued", null, null, t);
      return true;
    });
  }
  async expireAll() {
    const rows = await this.r.expiredCandidates(businessDate());
    let count = 0;
    for (const q of rows) if (await this.expireOne(q.id)) count++;
    return count;
  }
  async action(actor, id, action, body, requestId) {
    if (action === "convert")
      throw new Error("Conversion requires the dedicated idempotent method");
    const initial = await this.r.findById("quotations", id);
    if (!initial || initial.deletedAt)
      throw new AppError(404, "NOT_FOUND", "Quotation not found");
    authorize(actor, initial, action);
    // Commit expiry independently so reporting a conflict never rolls it back.
    if (["buyer-response", "issue", "approve", "revisions"].includes(action)) {
      const expired = await this.expireOne(id, actor);
      if (expired && action === "buyer-response")
        conflict("QUOTATION_EXPIRED", "Quotation validity has ended");
    }
    const result = await this.r.transaction(async (t) => {
      const { quote: q, family } = await this.r.locked(id, t);
      authorize(actor, q, action);
      this.unlocked(family);
      this.version(q, body.version);
      const from = q.status;
      let values = {};
      let newId;
      const requireState = (states) => {
        if (!states.includes(from)) conflict();
      };
      if (action === "submit") {
        requireState(["Draft"]);
        const snapshots = await this.masters(q, t, true);
        const old = await this.r.lines(q.id, t);
        const { lines, ...totals } = await this.resolveLines(
          old.map((l) => ({
            variantId: l.variantId,
            styleId: l.styleId,
            colour: l.colourSnapshot,
            size: l.sizeSnapshot,
            qty: l.quantity,
            unitPrice: l.unitPrice,
          })),
          t,
          true,
        );
        // Recapture snapshots without changing saved line identities.
        for (const [index, line] of lines.entries()) {
          await this.r.updateWhere(
            "quotation_lines",
            { ...line, id: old[index].id, createdAt: old[index].createdAt },
            { where: { id: old[index].id, quotationId: q.id }, transaction: t },
          );
        }
        values = {
          ...snapshots,
          ...totals,
          status: "PendingApproval",
          submittedBy: actor.id,
          submittedAt: new Date(),
          approvedBy: null,
          approvedAt: null,
        };
      } else if (action === "approve") {
        requireState(["PendingApproval"]);
        if (q.submittedBy === actor.id)
          throw new AppError(
            403,
            "SELF_APPROVAL_FORBIDDEN",
            "Approver must differ from the submitter",
          );
        await this.masters(q, t, true, true);
        values = {
          status: "Approved",
          approvedBy: actor.id,
          approvedAt: new Date(),
        };
      } else if (["reject", "withdraw"].includes(action)) {
        requireState(["PendingApproval"]);
        values = { status: "Draft", ...reset };
      } else if (action === "issue") {
        requireState(["Approved"]);
        await this.masters(q, t, true, true);
        if (
          family.activeIssuedRevisionId &&
          family.activeIssuedRevisionId !== id
        ) {
          const prior = await this.r.findById(
            "quotations",
            family.activeIssuedRevisionId,
            { transaction: t, lock: t.LOCK.UPDATE },
          );
          if (prior.status === "Issued") {
            await this.save(
              prior,
              { status: "Superseded", updatedBy: actor.id },
              t,
            );
            await this.r.audit(
              prior,
              actor,
              "supersession",
              "Issued",
              null,
              requestId,
              t,
              { replacementRevisionId: id },
            );
          }
        }
        await this.familySave(family, { activeIssuedRevisionId: id }, t);
        values = { status: "Issued", issuedBy: actor.id, issuedAt: new Date() };
      } else if (action === "buyer-response") {
        if (body.decision === "Accepted") {
          await customerGuard(this.r, q.customerId, t);
          await teamGuard(this.r, q.salesTeamId, q.ownerId, t);
        }
        if (q.status === "Expired")
          conflict("QUOTATION_EXPIRED", "Quotation validity has ended");
        requireState(["Issued"]);
        if (family.activeIssuedRevisionId !== id)
          conflict(
            "INACTIVE_OFFER",
            "Only the active issued revision may receive a response",
          );
        if (!q.validUntil || q.validUntil < businessDate())
          return { expired: true };
        values = {
          status: body.decision,
          buyerDecision: body.decision,
          buyerResponseReference: body.reference,
          buyerResponseReason: body.reason || null,
          buyerResponseAt: new Date(),
          buyerResponseRecordedBy: actor.id,
        };
        await this.familySave(
          family,
          body.decision === "Accepted"
            ? { acceptedRevisionId: id }
            : { activeIssuedRevisionId: null },
          t,
        );
      } else if (action === "void") {
        requireState(["Approved", "Issued"]);
        values = { status: "Cancelled" };
        if (family.activeIssuedRevisionId === id)
          await this.familySave(family, { activeIssuedRevisionId: null }, t);
      } else if (action === "revisions") {
        requireState(["Approved", "Issued", "Declined", "Expired"]);
        const revisions = await this.r.revisions(family.id, t);
        if (
          revisions.find((r) => !r.deletedAt)?.id !== id ||
          revisions.some(
            (r) =>
              !r.deletedAt &&
              r.revisionNo > q.revisionNo &&
              ["Draft", "PendingApproval", "Approved"].includes(r.status),
          )
        )
          conflict(
            "WORKING_REVISION_EXISTS",
            "Create a revision from the latest nondeleted eligible revision",
          );
        await this.masters(q, t);
        const revision = family.latestRevisionNo + 1;
        newId = randomUUID();
        await this.familySave(family, { latestRevisionNo: revision }, t);
        const newQuote = await this.r.insert(
          "quotations",
          {
            ...pick(q, commercialFields),
            id: newId,
            familyId: family.id,
            revisionNo: revision,
            priorRevisionId: id,
            status: "Draft",
            totalQty: q.totalQty,
            subtotal: q.subtotal,
            total: q.total,
            createdBy: actor.id,
            updatedBy: actor.id,
            ...nowFields(),
          },
          { transaction: t },
        );
        const lines = (await this.r.lines(id, t)).map((l) => ({
          ...l.toJSON(),
          id: randomUUID(),
          ...nowFields(),
        }));
        await this.r.replaceLines(newId, lines, t);
        await this.r.audit(
          q,
          actor,
          "revision",
          from,
          body.reason,
          requestId,
          t,
          { newRevisionId: newId, revision },
        );
        await this.r.audit(
          newQuote,
          actor,
          "create_revision",
          null,
          body.reason,
          requestId,
          t,
          { sourceRevisionId: id },
        );
        return { data: await this.detail(actor, newId, t), status: 201 };
      }
      await this.save(q, { ...values, updatedBy: actor.id }, t);
      await this.r.audit(
        q,
        actor,
        action,
        from,
        body.reason || body.comment,
        requestId,
        t,
        action === "issue" ? { channel: body.channel } : null,
      );
      return { data: await this.detail(actor, id, t), status: 200 };
    });
    if (result.expired) {
      await this.expireOne(id, actor);
      conflict("QUOTATION_EXPIRED", "Quotation validity has ended");
    }
    return result;
  }
  async convert(actor, id, body, requestId, key) {
    const operation = "quotation.convert";
    const hash = createHash("sha256")
      .update(JSON.stringify({ id, version: body.version }))
      .digest("hex");
    return this.r.transaction(async (t) => {
      // Upsert serializes simultaneous retries; reservation rolls back with any failure.
      const reservation = await this.r.reserveConversion(
        actor.id,
        operation,
        key,
        hash,
        t,
      );
      const { quote: q, family } = await this.r.locked(id, t);
      authorize(actor, q, "convert");
      if (reservation.requestHash !== hash)
        conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency-Key was already used with a different payload",
        );
      if (reservation.state === "completed")
        return {
          status: reservation.responseStatus,
          body: reservation.responseBody,
        };
      let order = await this.r.one("sales_orders", {
        where: { sourceQuotationId: id },
        transaction: t,
      });
      if (order) {
        if (
          family.acceptedRevisionId !== id ||
          family.convertedOrderId !== order.id ||
          order.sourceQuotationId !== id
        )
          conflict("FAMILY_LINK_CONFLICT", "Invalid family order linkage");
        const response = { data: orderSummary(order) };
        await this.r.save(
          reservation,
          {
            state: "completed",
            responseStatus: 200,
            responseBody: response,
            resourceId: order.id,
          },
          { transaction: t },
        );
        return { status: 200, body: response };
      }
      if (family.acceptedRevisionId !== id) {
        if (family.acceptedRevisionId || family.convertedOrderId)
          conflict(
            "FAMILY_ALREADY_ACCEPTED",
            "Only the accepted family revision may be converted",
          );
        conflict();
      }
      if (family.convertedOrderId)
        conflict(
          "FAMILY_LINK_CONFLICT",
          "Converted order linkage is inconsistent",
        );
      this.version(q, body.version);
      if (q.status !== "Accepted") conflict();
      await this.masters(q, t);
      const snapshots = pick(q, [
        "customerSnapshot",
        "billingAddressSnapshot",
        "shippingAddressSnapshot",
      ]);
      if (Object.values(snapshots).some((v) => !v))
        conflict(
          "SNAPSHOT_MISSING",
          "Accepted commercial snapshots are required",
        );
      order = await this.r.insert(
        "sales_orders",
        {
          ...pick(q, [
            "customerId",
            "salesTeamId",
            "ownerId",
            "currency",
            "requestedDeliveryDate",
            "paymentTerms",
            "notes",
            "totalQty",
            "subtotal",
            "total",
          ]),
          ...snapshots,
          id: randomUUID(),
          orderNumber: await this.r.number("SALES_ORDER", t),
          sourceQuotationId: id,
          orderDate: q.quotationDate,
          billingAddressId: q.billingAddressId,
          shippingAddressId: q.shippingAddressId,
          internalNotes: q.notes,
          sourceQuoteNumber: family.quoteNumber,
          sourceRevisionNo: q.revisionNo,
          status: "Draft",
          createdBy: actor.id,
          updatedBy: actor.id,
          ...nowFields(),
        },
        { transaction: t },
      );
      const lines = await this.r.lines(id, t);
      await this.r.insertMany(
        "sales_order_lines",
        lines.map((l) => {
          const { quotationId: _qid, ...fields } = l.toJSON();
          return {
            ...fields,
            id: randomUUID(),
            salesOrderId: order.id,
            ...nowFields(),
          };
        }),
        { transaction: t },
      );
      await this.save(q, { status: "Converted", updatedBy: actor.id }, t);
      await this.familySave(family, { convertedOrderId: order.id }, t);
      await this.r.audit(q, actor, "convert", "Accepted", null, requestId, t, {
        salesOrderId: order.id,
      });
      await this.r.insert(
        "audit_events",
        {
          id: randomUUID(),
          entityType: "sales_order",
          entityId: order.id,
          actorId: actor.id,
          action: "create",
          fromStatus: null,
          toStatus: "Draft",
          metadata: { sourceQuotationId: id },
          requestId: requestId || null,
          createdAt: new Date(),
        },
        { transaction: t },
      );
      const response = { data: orderSummary(order) };
      await this.r.save(
        reservation,
        {
          state: "completed",
          responseStatus: 201,
          responseBody: response,
          resourceId: order.id,
        },
        { transaction: t },
      );
      return { status: 201, body: response };
    });
  }
}
