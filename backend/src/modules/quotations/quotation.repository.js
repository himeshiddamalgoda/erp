import { randomUUID } from "node:crypto";
import { Op, QueryTypes } from "sequelize";
import { businessDate } from "../../config/env.js";
import { AppError, conflict } from "../../shared/errors.js";
export class QuotationRepository {
  constructor(db, models) {
    this.db = db;
    this.m = models;
  }
  findById(table, id, options) {
    return this.m[table].findByPk(id, options);
  }
  one(table, options) {
    return this.m[table].findOne(options);
  }
  many(table, options) {
    return this.m[table].findAll(options);
  }
  insert(table, values, options) {
    return this.m[table].create(values, options);
  }
  insertMany(table, values, options) {
    return this.m[table].bulkCreate(values, options);
  }
  updateWhere(table, values, options) {
    return this.m[table].update(values, options);
  }
  save(record, values, options) {
    return record.update(values, options);
  }
  read(work) {
    return this.db.transaction({ isolationLevel: "REPEATABLE READ" }, work);
  }
  addresses(ids, t) {
    return this.m.customer_addresses.findAll({
      where: { id: { [Op.in]: ids.filter(Boolean) } },
      transaction: t,
    });
  }
  async reserveConversion(actorId, operation, key, hash, t) {
    await this.db.query(
      "INSERT INTO idempotency_keys (id, actor_id, operation, idempotency_key, request_hash, state, created_at) VALUES (?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id=id",
      {
        replacements: [randomUUID(), actorId, operation, key, hash],
        transaction: t,
      },
    );
    return this.m.idempotency_keys.findOne({
      where: { actorId, operation, idempotencyKey: key },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
  }
  async transaction(work) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction(
          { isolationLevel: "READ COMMITTED" },
          work,
        );
      } catch (error) {
        if (
          attempt >= 2 ||
          !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
            error.original?.code,
          )
        )
          throw error;
      }
    }
  }
  async locked(id, t) {
    const initial = await this.m.quotations.findByPk(id, { transaction: t });
    if (!initial || initial.deletedAt)
      throw new AppError(404, "NOT_FOUND", "Quotation not found");
    const family = await this.m.quotation_families.findByPk(initial.familyId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const quote = await this.m.quotations.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (quote.deletedAt)
      throw new AppError(404, "NOT_FOUND", "Quotation not found");
    for (const link of ["acceptedRevisionId", "activeIssuedRevisionId"])
      if (family[link]) {
        const referenced = await this.m.quotations.findByPk(family[link], {
          transaction: t,
        });
        if (!referenced || referenced.familyId !== family.id)
          conflict("FAMILY_LINK_CONFLICT", "Invalid family revision linkage");
      }
    return { quote, family };
  }
  async number(type, t) {
    const year = Number(businessDate().slice(0, 4));
    await this.db.query(
      "INSERT INTO document_sequences (document_type, sequence_year, next_value) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE next_value = next_value",
      { replacements: [type, year], transaction: t },
    );
    const row = await this.m.document_sequences.findOne({
      where: { documentType: type, sequenceYear: year },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const value = BigInt(row.nextValue);
    await row.update(
      { nextValue: (value + 1n).toString() },
      { transaction: t },
    );
    return `${type === "QUOTATION" ? "QT" : "SO"}-${year}-${value.toString().padStart(4, "0")}`;
  }
  async audit(
    quote,
    actor,
    action,
    fromStatus,
    reason,
    requestId,
    t,
    metadata = null,
  ) {
    await this.m.audit_events.create(
      {
        id: randomUUID(),
        entityType: "quotation",
        entityId: quote.id,
        actorId: actor?.id || null,
        action,
        fromStatus,
        toStatus: quote.status,
        reason: reason || null,
        metadata,
        requestId: requestId || null,
        createdAt: new Date(),
      },
      { transaction: t },
    );
  }
  async list(actor, query, t) {
    const conditions = ["q.deleted_at IS NULL"];
    const replacements = {};
    if (actor.role !== "Admin") {
      conditions.push("q.sales_team_id IN (:teams)");
      replacements.teams = actor.salesTeamIds.length
        ? actor.salesTeamIds
        : [""];
    }
    if (query.includeRevisions !== "true")
      conditions.push(
        "NOT EXISTS (SELECT 1 FROM quotations newer WHERE newer.family_id=q.family_id AND newer.deleted_at IS NULL AND newer.revision_no > q.revision_no)",
      );
    for (const [key, column] of Object.entries({
      status: "status",
      customerId: "customer_id",
      salesTeamId: "sales_team_id",
      ownerId: "owner_id",
    }))
      if (query[key]) {
        conditions.push(`q.${column} = :${key}`);
        replacements[key] = query[key];
      }
    if (query.q) {
      conditions.push("(f.quote_number LIKE :q OR c.name LIKE :q)");
      replacements.q = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    }
    for (const [key, op] of [
      ["fromDate", ">="],
      ["toDate", "<="],
    ])
      if (query[key]) {
        conditions.push(`q.quotation_date ${op} :${key}`);
        replacements[key] = query[key];
      }
    const from = `FROM quotations q JOIN quotation_families f ON f.id=q.family_id JOIN customers c ON c.id=q.customer_id WHERE ${conditions.join(" AND ")}`;
    const [{ total }] = await this.db.query(`SELECT COUNT(*) total ${from}`, {
      replacements,
      type: QueryTypes.SELECT,
      transaction: t,
    });
    const sort = {
      createdAt: "q.created_at",
      updatedAt: "q.updated_at",
      quotationDate: "q.quotation_date",
      quoteNumber: "f.quote_number",
      total: "q.total",
    }[query.sortBy];
    const rows = await this.db.query(
      `SELECT q.id ${from} ORDER BY ${sort} ${query.sortOrder === "asc" ? "ASC" : "DESC"}, q.id ${query.sortOrder === "asc" ? "ASC" : "DESC"} LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          ...replacements,
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    return { ids: rows.map((r) => r.id), total: Number(total) };
  }
  lines(id, t) {
    return this.m.quotation_lines.findAll({
      where: { quotationId: id },
      order: [["lineNo", "ASC"]],
      transaction: t,
    });
  }
  revisions(familyId, t) {
    return this.m.quotations.findAll({
      where: { familyId },
      order: [["revisionNo", "DESC"]],
      transaction: t,
    });
  }
  async replaceLines(quoteId, lines, t) {
    await this.m.quotation_lines.destroy({
      where: { quotationId: quoteId },
      transaction: t,
    });
    await this.m.quotation_lines.bulkCreate(
      lines.map((line) => ({ ...line, quotationId: quoteId })),
      { transaction: t },
    );
  }
  expiredCandidates(today) {
    return this.m.quotations.findAll({
      attributes: ["id"],
      where: {
        status: "Issued",
        validUntil: { [Op.lt]: today },
        deletedAt: null,
      },
    });
  }
}
