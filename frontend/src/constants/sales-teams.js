export const canManageTeams = (actor) =>
  actor?.role === "Admin" || actor?.capabilities?.includes("sales-teams:write");
export const canReassign = (actor, type) =>
  actor?.role === "Admin" ||
  (type === "customer"
    ? actor?.capabilities?.includes("customers:write") &&
      actor?.capabilities?.includes("customers:assign")
    : actor?.capabilities?.includes("assignments:write"));
export const entityHref = (type, id) =>
  `/orders/${type === "customer" ? "customers" : type === "quotation" ? "quotations" : "sales-orders"}/${id}`;
