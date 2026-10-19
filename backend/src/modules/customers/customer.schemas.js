import { z } from "zod";
import { env } from "../../config/env.js";
export { parse } from "../quotations/quotation.schemas.js";
export const uuid = z.string().uuid().toLowerCase();
export const version = z.number().int().min(1).max(4294967295);
const text = (n) => z.string().trim().min(1).max(n);
const blankToNull = (value) =>
  typeof value === "string" && !value.trim() ? null : value;
const optional = (schema) =>
  z.preprocess(blankToNull, schema.nullable().optional());
export const country = z
  .string()
  .trim()
  .length(2)
  .toUpperCase()
  .refine((v) => env.countries.includes(v), "Select a configured country code");
export const currency = z.enum(["USD", "LKR", "GBP", "EUR"]);
export const email = optional(
  z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((v) => {
      const split = v.lastIndexOf("@");
      return v.slice(0, split) + "@" + v.slice(split + 1).toLowerCase();
    }),
);
export const phone = optional(
  z
    .string()
    .trim()
    .max(40)
    .refine(
      (v) =>
        /^\+?[0-9() .-]+$/.test(v) &&
        v.replace(/\D/g, "").length >= 7 &&
        v.replace(/\D/g, "").length <= 18,
      "Use an international phone number with 7-18 digits",
    ),
);
export const scalarFields = {
  name: z.string().trim().min(2).max(200),
  displayName: optional(z.string().trim().max(150)),
  country,
  currency,
  paymentTerms: text(500),
  salesTeamId: uuid,
  ownerId: uuid,
  email,
  phone,
  website: optional(
    z
      .string()
      .trim()
      .max(500)
      .url()
      .refine(
        (v) => /^https?:\/\//i.test(v),
        "Use an absolute HTTP or HTTPS URL",
      ),
  ),
  registrationNumber: optional(z.string().trim().max(100)),
  internalNotes: optional(z.string().max(5000)),
};
export const contactFields = {
  name: text(150),
  jobTitle: optional(z.string().trim().max(100)),
  email,
  phone,
  primary: z.boolean().default(false),
  isActive: z.boolean().default(true),
};
export const addressFields = {
  addressType: z.enum(["billing", "shipping"]),
  label: optional(z.string().trim().max(100)),
  line1: text(200),
  line2: optional(z.string().trim().max(200)),
  city: text(100),
  region: optional(z.string().trim().max(100)),
  postalCode: optional(z.string().trim().max(30)),
  country,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
};
const partial = (shape) =>
  Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()]));
export const contactCreate = z.object(contactFields).strict();
export const addressCreate = z.object(addressFields).strict();
export const createSchema = z
  .object({
    ...scalarFields,
    contacts: z.array(contactCreate).min(1).max(100),
    addresses: z.array(addressCreate).min(2).max(100),
  })
  .strict();
export const patchSchema = z
  .object({
    version,
    ...partial(scalarFields),
    reason: text(1000).optional(),
    contacts: z
      .array(
        z.union([
          z
            .object({
              id: uuid,
              ...partial(contactFields),
              primary: z.boolean().optional(),
              isActive: z.boolean().optional(),
            })
            .strict(),
          contactCreate,
        ]),
      )
      .max(100)
      .optional(),
    addresses: z
      .array(
        z.union([
          z
            .object({
              id: uuid,
              ...partial(addressFields),
              isDefault: z.boolean().optional(),
              isActive: z.boolean().optional(),
            })
            .strict(),
          addressCreate,
        ]),
      )
      .max(100)
      .optional(),
  })
  .strict();
export const lifecycleSchema = z
  .object({ version, reason: text(1000) })
  .strict();
export const listSchema = z
  .object({
    q: text(100).optional(),
    status: z.enum(["Active", "Archived", "All"]).default("Active"),
    salesTeamId: uuid.optional(),
    ownerId: uuid.optional(),
    country: country.optional(),
    currency: currency.optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["name", "code", "createdAt"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export const detailSchema = z
  .object({
    includeInactiveChildren: z.enum(["true", "false"]).default("false"),
  })
  .strict();
