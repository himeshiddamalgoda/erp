import { z } from "zod";
import Decimal from "decimal.js";
import { CURRENCIES } from "@/constants/quotations";
import { businessDate, optionalDate, lineSchema } from "@/lib/validation";
export const quotationSchema = z
  .object({
    customerId: z.string().uuid("Choose a buyer"),
    salesTeamId: z.string().uuid("Choose a sales team"),
    ownerId: z.string().uuid("Choose an owner"),
    currency: z.enum(CURRENCIES),
    quotationDate: businessDate,
    validUntil: optionalDate,
    requestedDeliveryDate: optionalDate,
    billingAddressId: z.union([z.string().uuid(), z.literal("")]),
    shippingAddressId: z.union([z.string().uuid(), z.literal("")]),
    paymentTerms: z.string().max(500, "Maximum 500 characters"),
    notes: z.string().max(10000, "Maximum 10,000 characters"),
    lines: z
      .array(lineSchema)
      .min(1, "Add at least one garment line")
      .max(500, "Maximum 500 garment lines"),
    version: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    for (const key of ["validUntil", "requestedDeliveryDate"])
      if (value[key] && value[key] < value.quotationDate)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Must be on or after the quotation date",
        });
    const seen = new Set();
    let total = new Decimal(0);
    value.lines.forEach((line, index) => {
      const key = `${line.styleId}:${line.colour}:${line.size}`;
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "size"],
          message: "Duplicate variant. Combine its quantities into one line.",
        });
      seen.add(key);
      try {
        total = total.plus(new Decimal(line.unitPrice).times(line.qty));
      } catch {
        /* The field schema reports invalid input. */
      }
    });
    if (total.gt("9999999999999999.99"))
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "The quotation total exceeds the supported money precision",
      });
  });
export function makeActionSchema(action) {
  return z
    .object({
      reason: z.string().trim().max(1000).default(""),
      comment: z.string().trim().max(1000).default(""),
      decision: z.enum(["Accepted", "Declined"]).default("Accepted"),
      reference: z.string().trim().max(500).default(""),
    })
    .superRefine((value, ctx) => {
      if (
        ["reject", "withdraw", "revisions", "void"].includes(action) &&
        !value.reason
      )
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Enter a reason to continue",
        });
      if (action === "buyer-response") {
        if (!value.reference)
          ctx.addIssue({
            code: "custom",
            path: ["reference"],
            message: "Enter the buyer response reference",
          });
        if (value.decision === "Declined" && !value.reason)
          ctx.addIssue({
            code: "custom",
            path: ["reason"],
            message: "Enter the reason the buyer declined",
          });
      }
    });
}

export function quotationSubmissionSchema(today, customers = []) {
  return quotationSchema.superRefine((value, ctx) => {
    for (const [key, label] of [
      ["validUntil", "Validity date"],
      ["requestedDeliveryDate", "Requested delivery"],
      ["billingAddressId", "Billing address"],
      ["shippingAddressId", "Shipping address"],
      ["paymentTerms", "Payment terms"],
    ]) {
      if (!value[key]?.trim())
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${label} is required before submission`,
        });
    }
    if (value.validUntil && value.validUntil < today)
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "The validity date has ended",
      });
    value.lines.forEach((line, index) => {
      if (
        /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(line.unitPrice) &&
        new Decimal(line.unitPrice || 0).lte(0)
      )
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "unitPrice"],
          message: "Price must be greater than zero before submission",
        });
    });
    const buyer = customers.find(
      (customer) => customer.id === value.customerId,
    );
    if (
      buyer &&
      !buyer.contacts.some(
        (contact) => contact.name?.trim() && (contact.email || contact.phone),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message:
          "Buyer needs an active contact with email or phone before submission",
      });
  });
}
