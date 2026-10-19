import { z } from "zod";
import Decimal from "decimal.js";
import { businessDate, optionalDate, lineSchema } from "@/lib/validation";
const optionalId = z.union([z.string().uuid(), z.literal("")]);
const operating = {
  buyerPoNumber: z.string().trim().max(100),
  buyerPoDate: optionalDate,
  requestedDeliveryDate: optionalDate,
  shippingAddressId: optionalId,
  publicNotes: z.string().max(5000),
  internalNotes: z.string().max(5000),
};
export function orderDraftSchema(today, converted = false, original) {
  const shape = converted
    ? {
        ...operating,
        ...Object.fromEntries(
          ["publicNotes", "internalNotes"].map((key) => [
            key,
            z.string().superRefine((value, ctx) => {
              if (value !== (original?.[key] || "") && value.length > 5000)
                ctx.addIssue({
                  code: "custom",
                  message: "Maximum 5,000 characters",
                });
            }),
          ]),
        ),
      }
    : {
        ...operating,
        customerId: z.string().uuid("Choose a buyer"),
        salesTeamId: z.string().uuid("Choose a sales team"),
        ownerId: z.string().uuid("Choose an owner"),
        currency: z.enum(["USD", "LKR", "GBP", "EUR"]),
        orderDate: businessDate,
        billingAddressId: optionalId,
        paymentTerms: z.string().trim().max(500),
        lines: z
          .array(lineSchema)
          .min(1, "Add a garment line")
          .max(500, "Maximum 500 garment lines"),
      };
  return z.object(shape).superRefine((v, ctx) => {
    if (v.buyerPoDate && v.buyerPoDate > today)
      ctx.addIssue({
        code: "custom",
        path: ["buyerPoDate"],
        message: "PO date cannot be in the future",
      });
    if (
      !converted &&
      v.requestedDeliveryDate &&
      v.requestedDeliveryDate < v.orderDate
    )
      ctx.addIssue({
        code: "custom",
        path: ["requestedDeliveryDate"],
        message: "Delivery must be on or after the order date",
      });
    if (v.lines) {
      let total = new Decimal(0);
      const seen = new Set();
      v.lines.forEach((line, i) => {
        const key = `${line.styleId}:${line.colour}:${line.size}`;
        if (seen.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "size"],
            message: "Duplicate variant. Combine quantities in one row.",
          });
        seen.add(key);
        try {
          total = total.plus(new Decimal(line.unitPrice).times(line.qty));
        } catch {}
      });
      if (total.gt("9999999999999999.99"))
        ctx.addIssue({
          code: "custom",
          path: ["lines"],
          message: "Total exceeds supported money precision",
        });
    }
  });
}
export function orderActionSchema(action, today, order) {
  return z
    .object({
      reason: z.string().trim().max(1000).default(""),
      comment: z.string().trim().max(1000).default(""),
      buyerReference: z.string().trim().max(500).default(""),
      requestedDeliveryDate: optionalDate.default(""),
      shippingAddressId: optionalId.default(""),
      publicNotes: z.string().max(5000).default(""),
    })
    .superRefine((v, ctx) => {
      if (
        ["cancel", "hold", "resume", "revisions"].includes(action) &&
        !v.reason
      )
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Enter a reason",
        });
      if (action === "revisions") {
        if (!v.buyerReference)
          ctx.addIssue({
            code: "custom",
            path: ["buyerReference"],
            message: "Enter the buyer reference",
          });
        const changed =
          v.requestedDeliveryDate !== (order.requestedDeliveryDate || "") ||
          v.shippingAddressId !== (order.shippingAddressId || "") ||
          v.publicNotes !== (order.publicNotes || "");
        if (!changed)
          ctx.addIssue({
            code: "custom",
            path: ["root"],
            message: "Change delivery, shipping address or public notes",
          });
        if (
          v.requestedDeliveryDate !== (order.requestedDeliveryDate || "") &&
          (!v.requestedDeliveryDate ||
            v.requestedDeliveryDate < today ||
            v.requestedDeliveryDate < order.orderDate)
        )
          ctx.addIssue({
            code: "custom",
            path: ["requestedDeliveryDate"],
            message: "Choose a delivery date on or after today and order date",
          });
        if (!v.shippingAddressId)
          ctx.addIssue({
            code: "custom",
            path: ["shippingAddressId"],
            message: "Choose a shipping address",
          });
      }
    });
}
