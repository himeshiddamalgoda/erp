import { AppError } from "../../shared/errors.js";
export const has = (actor, permission) =>
  Array.isArray(actor.capabilities) && actor.capabilities.includes(permission);
export const canManage = (actor) =>
  actor.role === "Admin" || has(actor, "sales-teams:write");
export const visible = (actor, id) =>
  canManage(actor) || actor.salesTeamIds.includes(id);
export function authorize(actor, id, action = "read") {
  if (id && !visible(actor, id))
    throw new AppError(404, "NOT_FOUND", "Sales team not found");
  if (action !== "read" && !canManage(actor))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Team-management permission is required",
    );
}
export const canAssign = (actor, type) =>
  actor.role === "Admin" ||
  (type === "customer"
    ? has(actor, "customers:write") && has(actor, "customers:assign")
    : has(actor, "assignments:write"));
export function assignmentPolicy(actor, type, source, target) {
  if (!canAssign(actor, type))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Assignment-management permission is required",
    );
  if (
    actor.role !== "Admin" &&
    (!actor.salesTeamIds.includes(source) ||
      !actor.salesTeamIds.includes(target))
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Assignment permission in both source and target scopes is required",
    );
}
