import { z } from "zod";
export const reasonSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(1000),
});
export const sameMembers = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((id, i) => id === [...b].sort()[i]);
export const activeIds = (team) =>
  team?.members.filter((m) => m.membershipActive).map((m) => m.userId) || [];
export function teamSchema(baseline) {
  return z
    .object({
      name: z.string().trim().min(2, "Use at least 2 characters").max(150),
      description: z.string().trim().max(1000),
      managerId: z.string().uuid("Choose an active manager"),
      memberIds: z
        .array(z.string().uuid())
        .min(1, "Select at least one member")
        .max(100)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Members must be unique",
        ),
      reason: z.string().trim().max(1000),
    })
    .superRefine((v, ctx) => {
      if (!v.memberIds.includes(v.managerId))
        ctx.addIssue({
          code: "custom",
          path: ["managerId"],
          message: "The manager must be an active member",
        });
      if (
        baseline &&
        (baseline.managerId !== v.managerId ||
          !sameMembers(activeIds(baseline), v.memberIds)) &&
        !v.reason
      )
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Explain the manager or membership change",
        });
    });
}
export function teamPayload(v, baseline) {
  const body = {
    name: v.name,
    description: v.description || null,
    managerId: v.managerId,
    memberIds: v.memberIds,
  };
  if (!baseline) return body;
  const result = { version: baseline.version };
  for (const key of ["name", "description", "managerId"])
    if (body[key] !== baseline[key]) result[key] = body[key];
  if (!sameMembers(activeIds(baseline), v.memberIds))
    result.memberIds = v.memberIds;
  if (v.reason) result.reason = v.reason;
  return result;
}
export const reassignmentSchema = reasonSchema.extend({
  salesTeamId: z.string().uuid("Choose a target team"),
  ownerId: z.string().uuid("Choose an active owner"),
});
