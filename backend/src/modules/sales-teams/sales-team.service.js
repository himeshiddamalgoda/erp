import { randomUUID, createHash } from "node:crypto";
import { Op } from "sequelize";
import { AppError, conflict, invalid } from "../../shared/errors.js";
import { managerRoles, eligibleStaff } from "../../shared/team-guard.js";
import { authorize, canManage } from "./sales-team.policy.js";
import { pick, status, summary, member } from "./sales-team.mapper.js";
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((k) => value[k] !== undefined)
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
export class SalesTeamService {
  constructor(repository) {
    this.r = repository;
  }
  version(team, version) {
    if (team.version !== version)
      conflict(
        "STALE_VERSION",
        "Team changed; reload and review before retrying",
      );
  }
  async validate(managerId, memberIds, t) {
    if (!memberIds.includes(managerId))
      throw new AppError(
        422,
        "MANAGER_MUST_BE_MEMBER",
        "Manager must be in the final active membership set",
        { memberIds: "Manager must be included" },
      );
    const users = await this.r.m.users.findAll({
      where: { id: { [Op.in]: memberIds } },
      order: [["id", "ASC"]],
      transaction: t,
      lock: t.LOCK.SHARE,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const manager = byId.get(managerId);
    if (!manager?.isActive || !managerRoles.includes(manager.role))
      throw new AppError(
        422,
        "INVALID_MANAGER",
        "Select an active SalesManager or Admin",
        { managerId: "An active manager with approval capability is required" },
      );
    const bad = memberIds.filter(
      (id) =>
        !byId.get(id)?.isActive || !eligibleStaff.includes(byId.get(id)?.role),
    );
    if (bad.length)
      throw new AppError(
        422,
        "INVALID_MEMBER",
        "Select eligible active existing staff",
        {
          memberIds:
            "Invalid or inactive selected member IDs: " + bad.join(", "),
        },
      );
    return users;
  }
  warnings(team, members) {
    const warnings = [];
    const manager = members.find(
      (m) => m.userId === team.managerId && m.isActive,
    );
    if (!manager?.userActive || !managerRoles.includes(manager?.role))
      warnings.push({
        code: "INVALID_MANAGER",
        message: "Repair the active manager and membership",
        userId: team.managerId,
      });
    for (const m of members.filter(
      (m) => m.isActive && (!m.userActive || !eligibleStaff.includes(m.role)),
    ))
      warnings.push({
        code: "INVALID_MEMBER",
        message: "Remove or repair this inactive/ineligible member",
        userId: m.userId,
      });
    if (!team.createdBy)
      warnings.push({
        code: "LEGACY_PROVENANCE_UNKNOWN",
        message:
          "Original team creator is unknown; legacy metadata remains null",
      });
    if (members.some((m) => !m.joinedAt || !m.lastActivatedAt))
      warnings.push({
        code: "LEGACY_MEMBERSHIP_PROVENANCE_UNKNOWN",
        message:
          "Historical first/latest activation metadata is unknown for legacy memberships",
      });
    if (!team.isActive && !team.archivedAt)
      warnings.push({
        code: "LEGACY_ARCHIVE_PROVENANCE_UNKNOWN",
        message: "Original archive metadata is unknown",
      });
    return warnings;
  }
  async represent(actor, team, t, inactive = false) {
    authorize(actor, team.id);
    const members = await this.r.members(team.id, t),
      manager = await this.r.findById("users", team.managerId, {
        transaction: t,
      }),
      counts = {
        active: members.filter((m) => m.isActive).length,
        eligible: members.filter((m) => m.isActive && m.userActive).length,
      },
      checks = await this.r.assignments(team.id, actor, t),
      warnings = this.warnings(team, members),
      eligible = !warnings.some((w) =>
        ["INVALID_MANAGER", "INVALID_MEMBER"].includes(w.code),
      );
    return {
      ...summary(team, manager, counts),
      ...pick(team, [
        "description",
        "managerId",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
        "archivedAt",
        "archivedBy",
        "archiveReason",
      ]),
      members: members
        .filter((m) => inactive || m.isActive)
        .map((m) => member(m, team.managerId, inactive)),
      assignmentSummary: checks.summary,
      integrityWarnings: warnings,
      eligibleForAssignment: team.isActive && eligible,
      allowedActions: canManage(actor)
        ? [
            "edit",
            ...(team.isActive
              ? checks.total === 0
                ? ["archive"]
                : []
              : eligible
                ? ["reactivate"]
                : []),
          ]
        : [],
    };
  }
  async detail(actor, id, inactive = false) {
    return this.r.read(async (t) =>
      this.represent(actor, await this.r.team(id, t), t, inactive),
    );
  }
  async list(actor, q) {
    return this.r.read(async (t) => {
      const result = await this.r.list(actor, q, t);
      return {
        data: result.rows.map((row) =>
          summary(
            row,
            { id: row.managerId, displayName: row.managerName },
            { active: row.active, eligible: row.eligible },
          ),
        ),
        meta: { page: q.page, pageSize: q.pageSize, total: result.total },
      };
    });
  }
  async create(actor, input, key, requestId) {
    authorize(actor, null, "create");
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key is required (1–128 printable characters)",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify(
          canonical({
            method: "POST",
            path: "/api/v1/sales-teams",
            body: { ...input, memberIds: [...input.memberIds].sort() },
          }),
        ),
      )
      .digest("hex");
    return this.r.transaction(async (t) => {
      const replay = await this.r.reserveConversion(
        actor.id,
        "sales-teams:create",
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
        authorize(actor, replay.resourceId, "create");
        return { status: replay.responseStatus, body: replay.responseBody };
      }
      await this.validate(input.managerId, input.memberIds, t);
      const now = new Date(),
        team = await this.r.insert(
          "sales_teams",
          {
            id: randomUUID(),
            code: await this.r.number(t),
            name: input.name,
            description: input.description ?? null,
            managerId: input.managerId,
            isActive: true,
            createdBy: actor.id,
            updatedBy: actor.id,
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
          { transaction: t },
        );
      await this.r.insertMany(
        "sales_team_members",
        input.memberIds.map((userId) => ({
          teamId: team.id,
          userId,
          isActive: true,
          joinedAt: now,
          lastActivatedAt: now,
          addedBy: actor.id,
          lastActivatedBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })),
        { transaction: t },
      );
      await this.r.audit(team, actor, "TeamCreated", null, null, requestId, t, {
        managerId: input.managerId,
        memberIds: [...input.memberIds].sort(),
      });
      await team.reload({ transaction: t });
      const result = {
        status: 201,
        body: { data: await this.represent(actor, team, t) },
      };
      await this.r.save(
        replay,
        {
          state: "completed",
          resourceId: team.id,
          responseStatus: 201,
          responseBody: result.body,
        },
        { transaction: t },
      );
      return result;
    });
  }
  async save(team, values, actor, t) {
    if (team.version >= 4294967295)
      conflict("VERSION_EXHAUSTED", "Team version exhausted");
    const [n] = await this.r.updateWhere(
      "sales_teams",
      {
        ...values,
        version: team.version + 1,
        updatedBy: actor.id,
        updatedAt: new Date(),
      },
      { where: { id: team.id, version: team.version }, transaction: t },
    );
    if (n !== 1) conflict("STALE_VERSION");
    await team.reload({ transaction: t });
  }
  blocked(checks, code, message) {
    if (!checks.total) return;
    const error = new AppError(409, code, message);
    error.details = {
      ...checks.summary,
      ...(code === "MEMBER_HAS_ACTIVE_ASSIGNMENTS"
        ? { members: checks.members }
        : {}),
    };
    throw error;
  }
  async patch(actor, id, input, requestId) {
    return this.r.transaction(async (t) => {
      const team = await this.r.team(id, t, true);
      authorize(actor, id, "edit");
      this.version(team, input.version);
      const members = await this.r.members(id, t),
        current = members
          .filter((m) => m.isActive)
          .map((m) => m.userId)
          .sort(),
        final = [...(input.memberIds || current)].sort(),
        managerId = input.managerId || team.managerId;
      const added = final.filter((id) => !members.some((m) => m.userId === id)),
        reactivated = final.filter((id) =>
          members.some((m) => m.userId === id && !m.isActive),
        ),
        removed = current.filter((id) => !final.includes(id));
      if (members.length + added.length > 500)
        invalid("memberIds", "At most 500 durable membership rows are allowed");
      const managerChanged = managerId !== team.managerId,
        membershipChanged =
          added.length + removed.length + reactivated.length > 0;
      if ((managerChanged || membershipChanged) && !input.reason)
        invalid("reason", "A reason is required for manager/member changes");
      await this.validate(managerId, final, t);
      if (removed.length)
        this.blocked(
          await this.r.assignments(id, actor, t, removed),
          "MEMBER_HAS_ACTIVE_ASSIGNMENTS",
          "Reassign active records before removing these members",
        );
      const changes = {};
      for (const key of ["name", "description"])
        if (input[key] !== undefined && input[key] !== team[key])
          changes[key] = input[key];
      if (managerChanged) changes.managerId = managerId;
      if (!Object.keys(changes).length && !membershipChanged)
        return this.represent(actor, team, t, true);
      const now = new Date();
      for (const userId of removed)
        await this.r.updateWhere(
          "sales_team_members",
          {
            isActive: false,
            removedAt: now,
            removedBy: actor.id,
            updatedAt: now,
          },
          { where: { teamId: id, userId }, transaction: t },
        );
      for (const userId of reactivated)
        await this.r.updateWhere(
          "sales_team_members",
          {
            isActive: true,
            lastActivatedAt: now,
            lastActivatedBy: actor.id,
            removedAt: null,
            removedBy: null,
            updatedAt: now,
          },
          { where: { teamId: id, userId }, transaction: t },
        );
      for (const userId of added)
        await this.r.insert(
          "sales_team_members",
          {
            teamId: id,
            userId,
            isActive: true,
            joinedAt: now,
            lastActivatedAt: now,
            addedBy: actor.id,
            lastActivatedBy: actor.id,
            createdAt: now,
            updatedAt: now,
          },
          { transaction: t },
        );
      const oldManager = team.managerId;
      await this.save(team, changes, actor, t);
      await this.r.audit(
        team,
        actor,
        "TeamUpdated",
        status(team),
        input.reason,
        requestId,
        t,
        { fields: Object.keys(changes) },
      );
      if (managerChanged)
        await this.r.audit(
          team,
          actor,
          "TeamManagerChanged",
          status(team),
          input.reason,
          requestId,
          t,
          { fromManagerId: oldManager, toManagerId: managerId },
        );
      if (membershipChanged)
        await this.r.audit(
          team,
          actor,
          "TeamMembershipChanged",
          status(team),
          input.reason,
          requestId,
          t,
          { added, removed, reactivated },
        );
      return this.represent(actor, team, t, true);
    });
  }
  async lifecycle(actor, id, action, input, requestId) {
    return this.r.transaction(async (t) => {
      const team = await this.r.team(id, t, true);
      authorize(actor, id, action);
      this.version(team, input.version);
      if (
        (action === "archive" && !team.isActive) ||
        (action === "reactivate" && team.isActive)
      )
        conflict();
      const from = status(team);
      if (action === "archive")
        this.blocked(
          await this.r.assignments(id, actor, t),
          "TEAM_HAS_ACTIVE_ASSIGNMENTS",
          "Reassign active customers/open documents or resolve them through their modules",
        );
      else {
        const members = await this.r.members(id, t);
        await this.validate(
          team.managerId,
          members.filter((m) => m.isActive).map((m) => m.userId),
          t,
        );
      }
      const prior = pick(team, ["archivedAt", "archivedBy"]);
      await this.save(
        team,
        action === "archive"
          ? {
              isActive: false,
              archivedAt: new Date(),
              archivedBy: actor.id,
              archiveReason: input.reason,
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
        team,
        actor,
        action === "archive" ? "TeamArchived" : "TeamReactivated",
        from,
        input.reason,
        requestId,
        t,
        action === "reactivate" ? prior : null,
      );
      return this.represent(actor, team, t);
    });
  }
  async users(actor, q) {
    if (
      !canManage(actor) &&
      !actor.capabilities?.includes("assignments:write") &&
      !actor.capabilities?.includes("customers:assign")
    )
      throw new AppError(
        403,
        "FORBIDDEN",
        "Directory lookup permission is required",
      );
    const where = {
      isActive: true,
      role: {
        [Op.in]:
          q.managerEligible === "true"
            ? managerRoles
            : q.managerEligible === "false"
              ? eligibleStaff.filter((role) => !managerRoles.includes(role))
              : eligibleStaff,
      },
    };
    if (!canManage(actor)) {
      const memberships = await this.r.m.sales_team_members.findAll({
        where: { isActive: true, teamId: { [Op.in]: actor.salesTeamIds } },
        attributes: ["userId"],
      });
      where.id = { [Op.in]: memberships.map((m) => m.userId) };
    }
    if (q.q)
      where.displayName = {
        [Op.like]: "%" + q.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%",
      };
    const result = await this.r.m.users.findAndCountAll({
      where,
      attributes: ["id", "displayName", "role"],
      order: [
        ["displayName", "ASC"],
        ["id", "ASC"],
      ],
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
    return {
      data: result.rows.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        role: u.role,
        managerEligible: managerRoles.includes(u.role),
      })),
      meta: { page: q.page, pageSize: q.pageSize, total: result.count },
    };
  }
}
