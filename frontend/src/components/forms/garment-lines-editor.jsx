"use client";
import { useFieldArray, useWatch } from "react-hook-form";
import {
  Alert,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import { FormField } from "./form-field";
import { emptyLine } from "@/utils/quotation-form";
import { withMissing } from "@/utils/sales-order";
import { formatMoney, lineTotal } from "@/utils/format";
import styles from "./forms.module.css";
export function GarmentLinesEditor({ form, options, disabled = false }) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = useWatch({ control: form.control, name: "lines" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const update = (key, value) =>
    form.setValue(key, value, { shouldDirty: true });
  const error = form.formState.errors.lines;
  return (
    <>
      <div className={styles.actions}>
        <div>
          <h2>Garment breakdown</h2>
          <p>
            One row per style, colour and size. Quantities are whole pieces.
          </p>
        </div>
        <Button
          type="button"
          variant="outlined"
          startIcon={<Plus size={15} />}
          disabled={disabled || fields.length >= 500}
          onClick={() => append(emptyLine())}
        >
          Add line
        </Button>
      </div>
      {(error?.message || error?.root?.message) && (
        <Alert severity="error">{error.message || error.root.message}</Alert>
      )}
      <div className={styles.tableWrap}>
        <Table className={styles.lineEditor} aria-label="Garment line editor">
          <TableHead>
            <TableRow>
              {[
                "Style / fabric",
                "Colour",
                "Size",
                "Qty (PCS)",
                "Unit price",
                "Line total",
                "Remove",
              ].map((h, i) => (
                <TableCell
                  key={h}
                  width={["25%", "15%", "12%", "12%", "14%", "16%", "6%"][i]}
                >
                  {h === "Remove" ? <span className="sr-only">Remove</span> : h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field, i) => {
              const l = lines?.[i] || field;
              const style = options.styles.find((s) => s.id === l.styleId);
              const colours = [
                ...new Set(style?.variants.map((v) => v.colour) || []),
              ];
              const sizes =
                style?.variants
                  .filter((v) => v.colour === l.colour)
                  .map((v) => v.size) || [];
              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <FormField
                      name={`lines.${i}.styleId`}
                      label={`Style, line ${i + 1}`}
                      control={form.control}
                      disabled={disabled}
                      options={withMissing(
                        options.styles.map((s) => ({
                          id: s.id,
                          label: `${s.code} · ${s.name}`,
                        })),
                        l.styleId,
                      )}
                      onValueChange={() => {
                        update(`lines.${i}.colour`, "");
                        update(`lines.${i}.size`, "");
                      }}
                      placeholder="Choose style"
                    />
                    {style && (
                      <div className={styles.meta}>
                        {style.fabricDescription} · {style.gsm} GSM
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <FormField
                      name={`lines.${i}.colour`}
                      label={`Colour, line ${i + 1}`}
                      control={form.control}
                      disabled={disabled}
                      options={withMissing(
                        colours.map((c) => ({ id: c, label: c })),
                        l.colour,
                        l.colour,
                      )}
                      onValueChange={() => update(`lines.${i}.size`, "")}
                      placeholder="Colour"
                    />
                  </TableCell>
                  <TableCell>
                    <FormField
                      name={`lines.${i}.size`}
                      label={`Size, line ${i + 1}`}
                      control={form.control}
                      disabled={disabled}
                      options={withMissing(
                        sizes.map((s) => ({ id: s, label: s })),
                        l.size,
                        l.size,
                      )}
                      placeholder="Size"
                    />
                  </TableCell>
                  <TableCell>
                    <FormField
                      name={`lines.${i}.qty`}
                      label={`Quantity, line ${i + 1}`}
                      type="number"
                      control={form.control}
                      disabled={disabled}
                      slotProps={{
                        htmlInput: {
                          "aria-label": `Quantity, line ${i + 1}`,
                          min: 1,
                          max: 1000000,
                          step: 1,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <FormField
                      name={`lines.${i}.unitPrice`}
                      label={`Unit price, line ${i + 1}`}
                      control={form.control}
                      disabled={disabled}
                      slotProps={{
                        htmlInput: {
                          "aria-label": `Unit price, line ${i + 1}`,
                          inputMode: "decimal",
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className={styles.money}>
                      {formatMoney(lineTotal(l.qty, l.unitPrice), currency)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      aria-label={`Remove line ${i + 1}`}
                      disabled={disabled || fields.length === 1}
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
