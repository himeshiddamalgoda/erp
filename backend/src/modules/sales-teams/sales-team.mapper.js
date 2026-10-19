export const pick = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value[key] ?? null]));
export const status = (team) => (team.isActive ? "Active" : "Archived");
export const summary = (team, manager, counts) => ({
  ...pick(team, ["id", "code", "name", "version"]),
  status: status(team),
  manager: pick(manager, ["id", "displayName"]),
  activeMemberCount: Number(counts.active || 0),
  eligibleMemberCount: Number(counts.eligible || 0),
});
export function member(row, managerId, inactive) {
  return {
    ...pick(row, ["userId", "displayName", "joinedAt", "lastActivatedAt"]),
    teamRole: row.userId === managerId ? "Manager" : "Member",
    membershipActive: Boolean(row.isActive),
    userActive: Boolean(row.userActive),
    ...(inactive ? pick(row, ["removedAt", "removedBy"]) : {}),
  };
}
