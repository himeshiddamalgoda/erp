import { randomUUID, createHash } from "node:crypto";
import { AppError, conflict, invalid } from "../../shared/errors.js";
import { authorize, allowedActions } from "./customer.policy.js";
import {
  scalarKeys,
  contactKeys,
  addressKeys,
  pick,
  normalizeContact,
  contact,
  address,
  summary,
  status,
} from "./customer.mapper.js";
import { parse, createSchema } from "./customer.schemas.js";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter((k) => v[k] !== undefined)
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const same = (a, b) => (a ?? null) === (b ?? null);
const plain = (row) => row.toJSON();
export class CustomerService {
  constructor(repository) {
    this.r = repository;
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
  version(c, v) {
    if (c.version !== v)
      conflict(
        "STALE_VERSION",
        "Customer changed; reload and review before retrying",
      );
    if (c.version >= 4294967295)
      conflict("VERSION_EXHAUSTED", "Customer version is exhausted");
  }
  async assignment(actor, c, t) {
    authorize(actor, c);
    const opt = { transaction: t, lock: t.LOCK.SHARE };
    const team = await this.r.findById("sales_teams", c.salesTeamId, opt);
    const owner = await this.r.findById("users", c.ownerId, opt);
    const member = await this.r.one("sales_team_members", {
      where: { teamId: c.salesTeamId, userId: c.ownerId },
      ...opt,
    });
    if (!team?.isActive || !owner?.isActive || !member?.isActive)
      throw new AppError(
        422,
        "INVALID_TEAM_OWNER",
        "Select an active team and an active owner who belongs to it",
        {
          salesTeamId: "An active team is required",
          ownerId: "Owner must be an active member of the selected team",
        },
      );
  }
  validate(c, contacts, addresses) {
    // Revalidate the entire merged aggregate, including legacy/inactive rows, on every save.
    const full = parse(
      createSchema.extend({
        contacts: createSchema.shape.contacts.max(500),
        addresses: createSchema.shape.addresses.max(500),
      }),
      {
        ...pick(c, scalarKeys),
        contacts: contacts.map((x) => ({
          ...pick(
            x,
            contactKeys.filter((k) => k !== "isPrimary"),
          ),
          primary: x.isPrimary,
        })),
        addresses: addresses.map((x) => pick(x, addressKeys)),
      },
    );
    const cs = full.contacts,
      as = full.addresses;
    if (cs.filter((x) => x.isActive).length > 50)
      invalid("contacts", "At most 50 active contacts are allowed");
    if (as.filter((x) => x.isActive).length > 50)
      invalid("addresses", "At most 50 active addresses are allowed");
    if (
      cs.filter((x) => x.isActive && x.primary).length !== 1 ||
      cs.some((x) => !x.isActive && x.primary)
    )
      invalid(
        "contacts",
        "Exactly one active primary contact is required; inactive contacts cannot be primary",
      );
    cs.forEach((x, i) => {
      if (x.isActive && !x.email && !x.phone)
        invalid(
          `contacts.${i}.email`,
          "Each active contact needs an email or phone",
        );
    });
    if (
      as.some((x) => !x.isActive && x.isDefault) ||
      ["billing", "shipping"].some(
        (type) =>
          as.filter((x) => x.addressType === type && x.isActive && x.isDefault)
            .length !== 1,
      )
    )
      invalid(
        "addresses",
        "Exactly one active default billing and shipping address is required; inactive addresses cannot be default",
      );
  }
  async represent(actor, c, t, includeInactive = false) {
    authorize(actor, c);
    const team = await this.r.findById("sales_teams", c.salesTeamId, {
      transaction: t,
    });
    const owner = await this.r.findById("users", c.ownerId, { transaction: t });
    const contacts = await this.r.children("customer_contacts", c.id, t),
      addresses = await this.r.children("customer_addresses", c.id, t);
    const commercialSummary = await this.r.commercialSummary(c.id, actor, t);
    return {
      ...summary(c, team, owner),
      ...pick(c, scalarKeys),
      ...pick(c, [
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
        "archivedAt",
        "archivedBy",
        "archiveReason",
      ]),
      contacts: contacts
        .filter((x) => includeInactive || x.isActive)
        .map(contact),
      addresses: addresses
        .filter((x) => includeInactive || x.isActive)
        .map(address),
      allowedActions: allowedActions(actor, c, commercialSummary.canArchive),
      commercialSummary,
    };
  }
  async detail(actor, id, includeInactive = false) {
    return this.r.read(async (t) => {
      await this.activeActor(actor, t);
      return this.represent(
        actor,
        await this.r.customer(id, t),
        t,
        includeInactive,
      );
    });
  }
  async list(actor, q) {
    return this.r.read(async (t) => {
      await this.activeActor(actor, t);
      const { rows, count } = await this.r.list(actor, q, t);
      const data = [];
      for (const c of rows)
        data.push(
          summary(
            c,
            await this.r.findById("sales_teams", c.salesTeamId, {
              transaction: t,
            }),
            await this.r.findById("users", c.ownerId, { transaction: t }),
          ),
        );
      return {
        data,
        meta: { page: q.page, pageSize: q.pageSize, total: count },
      };
    });
  }
  async create(actor, input, key, requestId) {
    authorize(actor, input, "write");
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key is required (1-128 printable characters)",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify(
          canonical({ method: "POST", path: "/api/v1/customers", body: input }),
        ),
      )
      .digest("hex");
    return this.r.transaction(async (t) => {
      await this.activeActor(actor, t);
      const replay = await this.r.reserveConversion(
        actor.id,
        "customers:create",
        key,
        hash,
        t,
      );
      if (replay.requestHash !== hash)
        conflict(
          "IDEMPOTENCY_KEY_REUSED",
          "Key already used with a different request",
        );
      if (replay.state === "completed") {
        authorize(
          actor,
          await this.r.customer(replay.resourceId, t, true),
          "write",
        );
        return { status: replay.responseStatus, body: replay.responseBody };
      }
      const contacts = input.contacts.map(normalizeContact),
        addresses = input.addresses;
      this.validate(input, contacts, addresses);
      await this.assignment(actor, input, t);
      const when = new Date(),
        id = randomUUID();
      const c = await this.r.insert(
        "customers",
        {
          ...pick(input, scalarKeys),
          id,
          code: await this.r.number(t),
          isActive: true,
          version: 1,
          createdBy: actor.id,
          updatedBy: actor.id,
          createdAt: when,
          updatedAt: when,
        },
        { transaction: t },
      );
      await this.r.insertMany(
        "customer_contacts",
        contacts.map((x) => ({
          ...x,
          id: randomUUID(),
          customerId: id,
          createdAt: when,
          updatedAt: when,
        })),
        { transaction: t },
      );
      await this.r.insertMany(
        "customer_addresses",
        addresses.map((x) => ({
          ...x,
          id: randomUUID(),
          customerId: id,
          createdAt: when,
          updatedAt: when,
        })),
        { transaction: t },
      );
      await this.r.audit(c, actor, "CustomerCreated", null, null, requestId, t);
      await c.reload({ transaction: t });
      const result = {
        status: 201,
        body: { data: await this.represent(actor, c, t) },
      };
      await this.r.save(
        replay,
        {
          state: "completed",
          resourceId: id,
          responseStatus: 201,
          responseBody: result.body,
        },
        { transaction: t },
      );
      return result;
    });
  }
  changes(existing, changes, kind) {
    const final = existing.map(plain),
      known = new Map(final.map((x) => [x.id, x])),
      seen = new Set(),
      changed = [];
    for (const item of changes || []) {
      const update = kind === "contacts" ? normalizeContact(item) : item;
      const keys = kind === "contacts" ? contactKeys : addressKeys;
      if (item.id) {
        if (seen.has(item.id) || !known.has(item.id))
          throw new AppError(
            422,
            "INVALID_CHILD_REFERENCE",
            "Each child ID must appear once and belong to this customer",
            { [kind]: "Invalid or duplicate child reference" },
          );
        seen.add(item.id);
        const old = known.get(item.id);
        if (
          kind === "addresses" &&
          item.addressType !== undefined &&
          item.addressType !== old.addressType
        )
          invalid(
            "addresses",
            "Address type is immutable; deactivate and create a replacement",
          );
        const fields = keys.filter(
          (k) => update[k] !== undefined && !same(old[k], update[k]),
        );
        if (fields.length) {
          const next = { ...old, ...pick(update, keys) };
          final[final.indexOf(old)] = next;
          changed.push({ id: item.id, old, next, fields });
        }
      } else {
        const next = { ...pick(update, keys), id: randomUUID() };
        final.push(next);
        changed.push({
          id: next.id,
          old: null,
          next,
          fields: Object.keys(pick(update, keys)),
        });
      }
    }
    if (final.length > 500)
      invalid(kind, "At most 500 stored records are allowed");
    return { final, changed };
  }
  async block(id, actor, t, code, addressIds) {
    const result = await this.r.documents(id, actor, t, { addressIds });
    if (result.blockerCount) {
      const error = new AppError(
        409,
        code,
        code === "ADDRESS_IN_USE"
          ? "A Draft document still uses this address; select a replacement in the document first"
          : "Resolve open quotations and Draft sales orders before archiving. Date-expired Issued offers must be resolved through the quotation workflow.",
      );
      error.details = {
        ...result,
        restrictedBlockers: result.blockerCount > result.visibleBlockerCount,
        countsScope:
          actor.role === "Admin" ? "all-company" : "actor-visible-teams",
        blockerCountScope: "all-dependent-documents",
      };
      throw error;
    }
  }
  async save(c, values, actor, t) {
    const [n] = await this.r.updateWhere(
      "customers",
      {
        ...values,
        version: c.version + 1,
        updatedBy: actor.id,
        updatedAt: new Date(),
      },
      { where: { id: c.id, version: c.version }, transaction: t },
    );
    if (n !== 1) conflict("STALE_VERSION");
    await c.reload({ transaction: t });
  }
  async patch(actor, id, body, requestId) {
    return this.r.transaction(async (t) => {
      await this.activeActor(actor, t);
      const c = await this.r.customer(id, t, true);
      authorize(actor, c, "write");
      this.version(c, body.version);
      const before = plain(c),
        merged = { ...before, ...pick(body, scalarKeys) };
      const contacts = this.changes(
        await this.r.children("customer_contacts", id, t, true),
        body.contacts,
        "contacts",
      );
      const addresses = this.changes(
        await this.r.children("customer_addresses", id, t, true),
        body.addresses,
        "addresses",
      );
      const fields = scalarKeys.filter((k) => !same(before[k], merged[k]));
      const assignmentChanged = fields.some((k) =>
        ["salesTeamId", "ownerId"].includes(k),
      );
      if (assignmentChanged) {
        authorize(actor, c, "assign");
        if (
          body.salesTeamId === undefined ||
          body.ownerId === undefined ||
          !body.reason
        )
          invalid(
            "reason",
            "Ownership changes require both salesTeamId and ownerId plus a reason",
          );
      }
      authorize(actor, merged);
      this.validate(merged, contacts.final, addresses.final);
      if (c.isActive || assignmentChanged)
        await this.assignment(actor, merged, t);
      const disabled = addresses.changed
        .filter((x) => x.old?.isActive && !x.next.isActive)
        .map((x) => x.id);
      if (disabled.length)
        await this.block(id, actor, t, "ADDRESS_IN_USE", disabled);
      if (
        !fields.length &&
        !contacts.changed.length &&
        !addresses.changed.length
      )
        return this.represent(actor, c, t, true);
      for (const [table, changeSet, flag, keys] of [
        ["customer_contacts", contacts, "isPrimary", contactKeys],
        ["customer_addresses", addresses, "isDefault", addressKeys],
      ]) {
        // Clear all affected occupied slots before assigning any replacement slot.
        for (const x of changeSet.changed)
          if (x.old?.[flag] && !x.next[flag])
            await this.r.updateWhere(
              table,
              { [flag]: false },
              { where: { id: x.id, customerId: id }, transaction: t },
            );
        for (const x of changeSet.changed) {
          const values = { ...pick(x.next, keys), updatedAt: new Date() };
          if (x.old)
            await this.r.updateWhere(table, values, {
              where: { id: x.id, customerId: id },
              transaction: t,
            });
          else
            await this.r.insert(
              table,
              { ...values, id: x.id, customerId: id, createdAt: new Date() },
              { transaction: t },
            );
        }
      }
      await this.save(c, pick(merged, fields), actor, t);
      const childMeta = (set) => ({
        added: set.changed.filter((x) => !x.old).map((x) => x.id),
        updated: set.changed
          .filter((x) => x.old)
          .map((x) => ({ id: x.id, fields: x.fields })),
        deactivated: set.changed
          .filter((x) => x.old?.isActive && !x.next.isActive)
          .map((x) => x.id),
      });
      await this.r.audit(
        c,
        actor,
        "CustomerUpdated",
        status(before),
        body.reason,
        requestId,
        t,
        {
          fields,
          children: {
            contacts: childMeta(contacts),
            addresses: childMeta(addresses),
          },
        },
      );
      if (assignmentChanged)
        await this.r.audit(
          c,
          actor,
          "OwnershipChanged",
          status(before),
          body.reason,
          requestId,
          t,
          {
            from: { salesTeamId: before.salesTeamId, ownerId: before.ownerId },
            to: { salesTeamId: c.salesTeamId, ownerId: c.ownerId },
          },
        );
      return this.represent(actor, c, t, true);
    });
  }
  async lifecycle(actor, id, action, body, requestId) {
    return this.r.transaction(async (t) => {
      await this.activeActor(actor, t);
      const c = await this.r.customer(id, t, true);
      authorize(actor, c, "write");
      this.version(c, body.version);
      const from = status(c);
      if (
        (action === "archive" && !c.isActive) ||
        (action === "reactivate" && c.isActive)
      )
        conflict();
      if (action === "archive")
        await this.block(id, actor, t, "CUSTOMER_HAS_OPEN_DOCUMENTS");
      else {
        const contacts = await this.r.children(
            "customer_contacts",
            id,
            t,
            true,
          ),
          addresses = await this.r.children("customer_addresses", id, t, true);
        this.validate(c, contacts, addresses);
        await this.assignment(actor, c, t);
      }
      const previousArchive =
        action === "reactivate" ? pick(c, ["archivedAt", "archivedBy"]) : null;
      await this.save(
        c,
        action === "archive"
          ? {
              isActive: false,
              archivedAt: new Date(),
              archivedBy: actor.id,
              archiveReason: body.reason,
            }
          : {
              isActive: true,
              archivedAt: null,
              archivedBy: null,
              archiveReason: null,
            },
        actor,
        t,
      );
      await this.r.audit(
        c,
        actor,
        action === "archive" ? "CustomerArchived" : "CustomerReactivated",
        from,
        body.reason,
        requestId,
        t,
        previousArchive,
      );
      return this.represent(actor, c, t);
    });
  }
}
