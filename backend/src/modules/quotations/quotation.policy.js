import { AppError } from "../../shared/errors.js";
const writers = ["Sales", "SalesManager", "Admin"];
export function visible(actor, quote) {
  return (
    actor.role === "Admin" || actor.salesTeamIds.includes(quote.salesTeamId)
  );
}
export function authorize(actor, quote, action = "read") {
  if (!visible(actor, quote))
    throw new AppError(404, "NOT_FOUND", "Quotation not found");
  if (
    action !== "read" &&
    (!writers.includes(actor.role) ||
      (["approve", "reject", "void"].includes(action) &&
        !["SalesManager", "Admin"].includes(actor.role)))
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Action is not permitted for this role",
    );
}
export function allowedActions(actor, quote, family, revisions, today) {
  const actions = ["pdf"];
  const permitted = (action) => {
    try {
      authorize(actor, quote, action);
      return true;
    } catch {
      return false;
    }
  };
  const unlocked = !family.acceptedRevisionId && !family.convertedOrderId;
  const valid = quote.validUntil && quote.validUntil >= today;
  if (unlocked && quote.status === "Draft")
    actions.push("edit", "delete", "submit");
  if (unlocked && quote.status === "PendingApproval") {
    actions.push("reject", "withdraw");
    if (quote.submittedBy !== actor.id && valid) actions.push("approve");
  }
  if (unlocked && quote.status === "Approved") {
    actions.push("void");
    if (valid) actions.push("issue");
  }
  if (unlocked && quote.status === "Issued") {
    actions.push("void");
    if (valid && family.activeIssuedRevisionId === quote.id)
      actions.push("buyer-response");
  }
  const latest = revisions
    .filter((r) => !r.deletedAt)
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
  if (
    unlocked &&
    latest?.id === quote.id &&
    ["Approved", "Issued", "Declined", "Expired"].includes(quote.status) &&
    !revisions.some(
      (r) =>
        r.revisionNo > quote.revisionNo &&
        !r.deletedAt &&
        ["Draft", "PendingApproval", "Approved"].includes(r.status),
    )
  )
    actions.push("revisions");
  if (
    family.acceptedRevisionId === quote.id &&
    ["Accepted", "Converted"].includes(quote.status)
  )
    actions.push("convert");
  return actions.filter((action) => action === "pdf" || permitted(action));
}
