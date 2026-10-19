import { z } from "zod";
export { parse } from "../quotations/quotation.schemas.js";
export const uuid = z.string().uuid().toLowerCase();
export const version = z.number().int().min(1).max(4294967295);
const reason = z.string().trim().min(1).max(1000),
  name = z.string().trim().min(2).max(150);
const description = z.preprocess(
  (v) => (typeof v === "string" && !v.trim() ? null : v),
  z.string().trim().max(1000).nullable().optional(),
);
const memberIds = z
  .array(uuid)
  .min(1)
  .max(100)
  .refine(
    (v) => new Set(v).size === v.length,
    "Duplicate members are not allowed",
  );
export const createSchema = z
  .object({ name, description, managerId: uuid, memberIds })
  .strict();
export const patchSchema = z
  .object({
    version,
    name: name.optional(),
    description,
    managerId: uuid.optional(),
    memberIds: memberIds.optional(),
    reason: reason.optional(),
  })
  .strict();
export const lifecycleSchema = z.object({ version, reason }).strict();
export const detailSchema = z
  .object({
    includeInactiveMembers: z.enum(["true", "false"]).default("false"),
  })
  .strict();
export const listSchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["Active", "Archived", "All"]).default("Active"),
    managerId: uuid.optional(),
    memberId: uuid.optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["name", "code", "createdAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export const userListSchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    status: z.literal("Active").default("Active"),
    managerEligible: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const assignmentSchema = z
  .object({
    entityType: z.enum(["customer", "quotation", "salesOrder"]),
    entityId: uuid,
    salesTeamId: uuid,
    ownerId: uuid,
    version,
    reason,
  })
  .strict();
