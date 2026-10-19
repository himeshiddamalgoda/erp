import { AsyncLocalStorage } from "node:async_hooks";
import { Op } from "sequelize";
import { AppError, invalid } from "./errors.js";
export const actorContext = new AsyncLocalStorage();
export const eligibleStaff = ["Sales", "SalesManager", "Admin", "Viewer"];
export const managerRoles = ["SalesManager", "Admin"];
export async function resolveActor(repository, actor, transaction) {
  const user = await repository.m.users.findByPk(actor.id, { transaction });
  if (!user?.isActive || user.role !== actor.role)
    throw new AppError(
      401,
      "INVALID_PRINCIPAL",
      "An active principal with current role claims is required",
    );
  if (actor.role === "Admin") return { ...actor };
  const memberships = await repository.m.sales_team_members.findAll({
    where: {
      userId: actor.id,
      isActive: true,
      teamId: { [Op.in]: actor.salesTeamIds },
    },
    attributes: ["teamId"],
    transaction,
  });
  return { ...actor, salesTeamIds: memberships.map((m) => m.teamId) };
}
// Resolve scopes for direct service consumers as well as HTTP, without caching stale claims.
export function scopedService(service, methods) {
  for (const method of methods) {
    const original = service[method].bind(service);
    service[method] = async function (actor, ...args) {
      if (actorContext.getStore()?.actor === actor)
        return original(actor, ...args);
      const current = await resolveActor(service.r, actor);
      return actorContext.run({ actor: current }, () =>
        original(current, ...args),
      );
    };
  }
  return service;
}
export async function lockTeams(repository, ids, t) {
  if (!t) throw new Error("Team guard requires a transaction");
  const result = new Map();
  for (const id of [...new Set(ids)].sort()) {
    const team = await repository.findById("sales_teams", id, {
      transaction: t,
      lock: t.LOCK.SHARE,
    });
    if (!team) invalid("salesTeamId", "Select an existing sales team");
    result.set(id, team);
  }
  return result;
}
export async function teamGuard(
  repository,
  id,
  ownerId,
  t,
  { lockedTeams, requireActive = true, allowStaleMembers = false } = {},
) {
  const team = (lockedTeams || (await lockTeams(repository, [id], t))).get(id);
  if (requireActive && !team.isActive)
    invalid("salesTeamId", "Select an active sales team");
  const opt = { transaction: t, lock: t.LOCK.SHARE };
  const owner = await repository.findById("users", ownerId, opt),
    member = await repository.one("sales_team_members", {
      where: { teamId: id, userId: ownerId },
      ...opt,
    });
  const manager = await repository.findById("users", team.managerId, opt),
    managerMember = await repository.one("sales_team_members", {
      where: { teamId: id, userId: team.managerId },
      ...opt,
    });
  if (
    !owner?.isActive ||
    !eligibleStaff.includes(owner.role) ||
    !member?.isActive
  )
    invalid(
      "ownerId",
      "Owner must be an eligible active member of the selected team",
    );
  if (
    !manager?.isActive ||
    !managerRoles.includes(manager.role) ||
    !managerMember?.isActive
  )
    invalid(
      "salesTeamId",
      "Repair the active manager and manager membership before assigning work",
    );
  const activeMembers = await repository.m.sales_team_members.findAll({
    where: { teamId: id, isActive: true },
    transaction: t,
    lock: t.LOCK.SHARE,
  });
  const activeUsers = await repository.m.users.findAll({
    where: { id: { [Op.in]: activeMembers.map((m) => m.userId) } },
    order: [["id", "ASC"]],
    transaction: t,
    lock: t.LOCK.SHARE,
  });
  if (
    !allowStaleMembers &&
    activeUsers.some((u) => !u.isActive || !eligibleStaff.includes(u.role))
  )
    invalid(
      "salesTeamId",
      "Repair inactive or ineligible active team members before assigning work",
    );
  const current = actorContext.getStore()?.actor;
  if (current && current.role !== "Admin") {
    const live = await resolveActor(repository, current, t);
    if (!live.salesTeamIds.includes(id))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Current membership in the target team is required",
      );
  }
  return { team, owner, member };
}
