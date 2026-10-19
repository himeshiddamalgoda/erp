import { AppError } from "../../shared/errors.js";
export const canWrite = (actor) =>
  actor.role === "Admin" ||
  (Array.isArray(actor.capabilities) &&
    actor.capabilities.includes("customers:write"));
export const canAssign = (actor) =>
  actor.role === "Admin" ||
  (canWrite(actor) && actor.capabilities.includes("customers:assign"));
export const visible = (actor, c) =>
  actor.role === "Admin" || actor.salesTeamIds.includes(c.salesTeamId);
export function authorize(actor, c, action = "read") {
  if (!visible(actor, c))
    throw new AppError(404, "NOT_FOUND", "Customer not found");
  if (action !== "read" && !canWrite(actor))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Customer master-data permission is required",
    );
  if (action === "assign" && !canAssign(actor))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Customer assignment permission is required",
    );
}
export function allowedActions(actor, c, canArchive) {
  if (!canWrite(actor)) return [];
  return [
    "edit",
    ...(c.isActive ? (canArchive ? ["archive"] : []) : ["reactivate"]),
  ];
}
