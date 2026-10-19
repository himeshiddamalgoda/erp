import { z } from "zod";
export const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Choose a real calendar date");
export const optionalDate = z.union([businessDate, z.literal("")]);
export const lineSchema = z.object({
  styleId: z.string().uuid("Choose a style"),
  colour: z.string().min(1, "Choose a colour").max(60),
  size: z.string().min(1, "Choose a size").max(30),
  qty: z.coerce
    .number()
    .int("Use a whole quantity")
    .min(1, "Quantity must be at least 1")
    .max(1000000, "Maximum quantity is 1,000,000"),
  unitPrice: z
    .string()
    .regex(
      /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
      "Use a price from 0 to 99999999.99 with up to 2 decimal places",
    ),
});
