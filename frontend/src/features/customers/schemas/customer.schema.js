import { z } from "zod";
const text = (n) => z.string().trim().min(1, "Required").max(n);
const optional = (n) => z.string().trim().max(n);
const email = z.union([
  z.string().trim().max(254).email("Use a valid email address"),
  z.literal(""),
]);
const phone = optional(40).refine(
  (v) =>
    !v ||
    (/^\+?[0-9() .-]+$/.test(v) &&
      v.replace(/\D/g, "").length >= 7 &&
      v.replace(/\D/g, "").length <= 18),
  "Use 7–18 digits with international phone punctuation",
);
const id = z.string().uuid().optional();
export function customerSchema(options, baseline) {
  const countries = options.company.countries || [];
  const country = z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Choose a country")
    .refine(
      (v) => !countries.length || countries.includes(v),
      "Choose a configured country",
    );
  return z
    .object({
      name: z.string().trim().min(2, "Use at least 2 characters").max(200),
      displayName: optional(150),
      country,
      currency: z.enum(["USD", "LKR", "GBP", "EUR"]),
      paymentTerms: text(500),
      salesTeamId: z.string().uuid("Choose an active team"),
      ownerId: z.string().uuid("Choose an active owner"),
      email,
      phone,
      website: z.union([
        z
          .string()
          .trim()
          .max(500)
          .url("Use an absolute URL")
          .regex(/^https?:\/\//i, "Use HTTP or HTTPS"),
        z.literal(""),
      ]),
      registrationNumber: optional(100),
      internalNotes: z.string().max(5000),
      reason: optional(1000),
      contacts: z
        .array(
          z.object({
            id,
            name: text(150),
            jobTitle: optional(100),
            email,
            phone,
            primary: z.boolean(),
            isActive: z.boolean(),
          }),
        )
        .min(1)
        .max(500),
      addresses: z
        .array(
          z.object({
            id,
            addressType: z.enum(["billing", "shipping"]),
            label: optional(100),
            line1: text(200),
            line2: optional(200),
            city: text(100),
            region: optional(100),
            postalCode: optional(30),
            country,
            isDefault: z.boolean(),
            isActive: z.boolean(),
          }),
        )
        .min(2)
        .max(500),
    })
    .superRefine((v, ctx) => {
      const issue = (path, message) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      if (
        v.contacts.filter((c) => c.isActive && c.primary).length !== 1 ||
        v.contacts.some((c) => !c.isActive && c.primary)
      )
        issue(["contacts"], "Choose exactly one active primary contact");
      v.contacts.forEach((c, i) => {
        if (c.isActive && !c.email && !c.phone)
          issue(
            ["contacts", i, "email"],
            "An active contact needs an email or phone",
          );
      });
      if (v.contacts.filter((c) => c.isActive).length > 50)
        issue(["contacts"], "At most 50 active contacts");
      for (const type of ["billing", "shipping"])
        if (
          v.addresses.filter(
            (a) => a.isActive && a.addressType === type && a.isDefault,
          ).length !== 1
        )
          issue(
            ["addresses"],
            `Choose exactly one active default ${type} address`,
          );
      if (v.addresses.some((a) => !a.isActive && a.isDefault))
        issue(["addresses"], "Inactive addresses cannot be default");
      if (v.addresses.filter((a) => a.isActive).length > 50)
        issue(["addresses"], "At most 50 active addresses");
      if (
        baseline &&
        (v.ownerId !== baseline.ownerId ||
          v.salesTeamId !== baseline.salesTeamId) &&
        !v.reason.trim()
      )
        issue(["reason"], "Explain this ownership change");
    });
}
export const customerReasonSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(1000),
});
