import { AppError } from "../../shared/errors.js";
export const managers = ["SalesManager", "Admin"];
export function visible(actor, o) {
  return actor.role === "Admin" || actor.salesTeamIds.includes(o.salesTeamId);
}
export function authorize(actor, o, action = "read") {
  if (!visible(actor, o))
    throw new AppError(404, "NOT_FOUND", "Sales order not found");
  if (
    action !== "read" &&
    (!["Sales", "SalesManager", "Admin"].includes(actor.role) ||
      (!["create", "edit", "delete"].includes(action) &&
        !managers.includes(actor.role)))
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Action is not permitted for this role",
    );
}
export function allowedActions(actor, o, handoff, hasActivity, complete) {
  const result = ["downloadPdf"];
  if (o.status === "Draft") {
    if (["Sales", "SalesManager", "Admin"].includes(actor.role))
      result.push("edit", "delete");
    if (managers.includes(actor.role)) result.push("confirm", "cancel");
  }
  if (managers.includes(actor.role)) {
    const local =
      o.status === "Confirmed" &&
      handoff?.status === "Queued" &&
      !handoff.claimedAt &&
      !hasActivity;
    if (local)
      result.push("cancel", o.isOnHold ? "resume" : "hold", "revisions");
    if (
      o.status === "Delivered" &&
      complete &&
      !["Failed", "Claimed"].includes(handoff?.status)
    )
      result.push("close");
  }
  return result;
}
