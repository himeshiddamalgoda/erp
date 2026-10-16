"use client";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import {
  Building2,
  Check,
  FileText,
  Info,
  Layers3,
  LockKeyhole,
  Plus,
  Save,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import {
  quotationSchema,
  quotationSubmissionSchema,
} from "../schemas/quotation.schema";
import { FormField } from "./form-field";
import { setEditorDirty } from "@/store/ui-slice";
import {
  toFormValues,
  toQuotationPayload,
  emptyLine,
} from "@/utils/quotation-form";
import {
  addressLabel,
  formatMoney,
  formatQuantity,
  lineTotal,
  quotationTotals,
} from "@/utils/format";
import { applyServerErrors } from "@/utils/api-error";
import { ApiErrorAlert } from "@/components/ui/page-state";
import styles from "../quotations.module.css";

function withMissing(options, value, label) {
  return value && !options.some((option) => option.id === value)
    ? [...options, { id: value, label, disabled: true }]
    : options;
}
export function QuotationForm({
  quotation,
  options,
  onSave,
  onCancel,
  onReload,
  initialError,
}) {
  const dispatch = useDispatch();
  const submissionIntent = useRef("save");
  const form = useForm({
    resolver: (values, context, resolverOptions) =>
      zodResolver(
        submissionIntent.current === "submit"
          ? quotationSubmissionSchema(
              options.company.businessDate,
              options.customers,
            )
          : quotationSchema,
      )(values, context, resolverOptions),
    defaultValues: toFormValues(quotation, options.company.businessDate),
    mode: "onTouched",
    reValidateMode: "onChange",
  });
  const {
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control });
  const [apiError, setApiError] = useState(initialError || null);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [intent, setIntent] = useState("save");
  const customer = options.customers.find((c) => c.id === values.customerId);
  const team = options.teams.find((t) => t.id === values.salesTeamId);
  const totals = quotationTotals(values.lines);
  const blocked = apiError?.code === "FAMILY_ALREADY_ACCEPTED";
  useEffect(() => {
    dispatch(setEditorDirty(isDirty));
    return () => dispatch(setEditorDirty(false));
  }, [dispatch, isDirty]);
  useEffect(() => {
    if (!isDirty) return;
    const prevent = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [isDirty]);
  const update = (key, value) => setValue(key, value, { shouldDirty: true });
  const chooseBuyer = (id) => {
    const buyer = options.customers.find((item) => item.id === id);
    if (!buyer) return;
    update("currency", buyer.currency);
    update("salesTeamId", buyer.salesTeamId);
    update("ownerId", buyer.ownerId);
    update("paymentTerms", buyer.paymentTerms || "");
    for (const type of ["billing", "shipping"])
      update(
        `${type}AddressId`,
        buyer.addresses.find(
          (address) => address.addressType === type && address.isDefault,
        )?.id ||
          buyer.addresses.find((address) => address.addressType === type)?.id ||
          "",
      );
  };
  const chooseTeam = (id) => {
    const next = options.teams.find((item) => item.id === id);
    if (!next?.members.some((member) => member.id === values.ownerId))
      update("ownerId", "");
  };
  const submit = async (data, submissionIntent) => {
    setApiError(null);
    try {
      const result = await onSave({
        body: toQuotationPayload(data),
        version: data.version,
        intent: submissionIntent,
      });
      if (result?.quotation) {
        reset(toFormValues(result.quotation));
        if (result.submissionError) {
          setApiError(result.submissionError);
          applyServerErrors(result.submissionError, setError);
        }
      }
    } catch (error) {
      setApiError(error);
      applyServerErrors(error, setError);
    }
  };
  const customers = withMissing(
    options.customers.map((c) => ({
      id: c.id,
      label: `${c.name} · ${c.code}`,
    })),
    values.customerId,
    `${quotation?.customerName || "Buyer"} (unavailable)`,
  );
  const teams = withMissing(
    options.teams.map((t) => ({ id: t.id, label: t.name })),
    values.salesTeamId,
    "Unavailable sales team",
  );
  const owners = withMissing(
    (team?.members || []).map((member) => ({
      id: member.id,
      label: member.displayName,
    })),
    values.ownerId,
    "Unavailable owner",
  );
  const addresses = (type) =>
    withMissing(
      (customer?.addresses || [])
        .filter((a) => a.addressType === type)
        .map((a) => ({ id: a.id, label: addressLabel(a) })),
      values[`${type}AddressId`],
      "Selected address (unavailable)",
    );
  const selectedStyleOptions = (styleId) =>
    withMissing(
      options.styles.map((style) => ({
        id: style.id,
        label: `${style.code} · ${style.name}`,
      })),
      styleId,
      "Selected style (unavailable)",
    );
  return (
    <form
      noValidate
      onSubmit={(event) => {
        const nextIntent = event.nativeEvent.submitter?.value || "save";
        submissionIntent.current = nextIntent;
        setIntent(nextIntent);
        return handleSubmit((data) => submit(data, nextIntent))(event);
      }}
    >
      <ApiErrorAlert error={apiError}>
        {apiError?.code === "STALE_VERSION" && (
          <div>
            <Button size="small" onClick={() => setReloadDialog(true)}>
              Reload latest version
            </Button>
            <p className={styles.fieldHelp}>
              Your entries are preserved until you choose to reload.
            </p>
          </div>
        )}
      </ApiErrorAlert>
      <div className={styles.panel}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>
                <Building2 size={17} />
                Buyer &amp; ownership
              </h2>
              <p>Choose who the offer is for and the team looking after it.</p>
            </div>
            <span className={styles.sectionNumber}>01</span>
          </div>
          <div className={styles.formGrid}>
            <FormField
              name="customerId"
              label="Buyer"
              required
              control={control}
              options={customers}
              placeholder="Choose a buyer"
              onValueChange={chooseBuyer}
            />
            <FormField
              name="salesTeamId"
              label="Sales team"
              required
              control={control}
              options={teams}
              placeholder="Choose a team"
              onValueChange={chooseTeam}
            />
            <FormField
              name="ownerId"
              label="Quotation owner"
              required
              control={control}
              options={owners}
              placeholder="Choose an owner"
            />
          </div>
          {customer && (
            <div className={styles.buyerHint}>
              <Users size={15} />
              <span>
                {customer.contacts.length
                  ? customer.contacts
                      .map(
                        (contact) =>
                          `${contact.name}${contact.email ? ` · ${contact.email}` : contact.phone ? ` · ${contact.phone}` : ""}`,
                      )
                      .join(" / ")
                  : "This buyer has no active contact. Add contact details in customer master data before submission."}
              </span>
            </div>
          )}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>
                <FileText size={17} />
                Commercial details
              </h2>
              <p>Drafts can be saved before all final terms are ready.</p>
            </div>
            <span className={styles.sectionNumber}>02</span>
          </div>
          <div className={styles.formGrid}>
            <FormField
              name="quotationDate"
              label="Quotation date"
              type="date"
              required
              control={control}
            />
            <FormField
              name="validUntil"
              label="Valid until"
              type="date"
              control={control}
            />
            <FormField
              name="requestedDeliveryDate"
              label="Requested delivery"
              type="date"
              control={control}
            />
            <FormField
              name="currency"
              label="Currency"
              required
              control={control}
              options={options.company.currencies.map((currency) => ({
                id: currency,
                label: currency,
              }))}
              helperText="Prices stay as entered; no currency conversion."
            />
            <FormField
              name="billingAddressId"
              label="Billing address"
              control={control}
              options={addresses("billing")}
              placeholder="Choose billing address"
            />
            <FormField
              name="shippingAddressId"
              label="Shipping address"
              control={control}
              options={addresses("shipping")}
              placeholder="Choose shipping address"
            />
          </div>
          <div className={`${styles.formGridTwo} ${styles.spaceAbove}`}>
            <FormField
              name="paymentTerms"
              label="Payment terms"
              control={control}
              multiline
              minRows={2}
              placeholder="e.g. 30% advance; 70% before shipment"
            />
            <FormField
              name="notes"
              label="Internal notes"
              control={control}
              multiline
              minRows={2}
              placeholder="Notes for your team"
              helperText="Internal only. These notes do not appear on the buyer PDF."
            />
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>
                <Layers3 size={17} />
                Garment breakdown
              </h2>
              <p>
                One row per style, colour and size. Quantities are whole pieces.
              </p>
            </div>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<Plus size={14} />}
              disabled={fields.length >= 500 || isSubmitting || blocked}
              onClick={() => append(emptyLine())}
            >
              Add line
            </Button>
          </div>
          {errors.lines?.root?.message && (
            <Alert severity="error">{errors.lines.root.message}</Alert>
          )}
          {errors.lines?.message && (
            <Alert severity="error">{errors.lines.message}</Alert>
          )}
          <div className={styles.lineEditorWrap}>
            <Table
              className={styles.lineEditor}
              aria-label="Garment line editor"
            >
              <TableHead>
                <TableRow>
                  <TableCell width="25%">Style / fabric</TableCell>
                  <TableCell width="16%">Colour</TableCell>
                  <TableCell width="12%">Size</TableCell>
                  <TableCell width="12%">Quantity (PCS)</TableCell>
                  <TableCell width="14%">Unit price</TableCell>
                  <TableCell align="right" width="15%">
                    Line total
                  </TableCell>
                  <TableCell>
                    <span className="sr-only">Remove</span>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => {
                  const line = values.lines?.[index] || field;
                  const style = options.styles.find(
                    (item) => item.id === line.styleId,
                  );
                  const colours = [
                    ...new Set(style?.variants.map((v) => v.colour) || []),
                  ];
                  const sizes =
                    style?.variants
                      .filter((v) => v.colour === line.colour)
                      .map((v) => v.size) || [];
                  return (
                    <TableRow key={field.id}>
                      <TableCell>
                        <FormField
                          name={`lines.${index}.styleId`}
                          label={`Style, line ${index + 1}`}
                          control={control}
                          options={selectedStyleOptions(line.styleId)}
                          placeholder="Choose style"
                          onValueChange={(id) => {
                            const next = options.styles.find(
                              (item) => item.id === id,
                            );
                            const nextColours = [
                              ...new Set(
                                next?.variants.map((v) => v.colour) || [],
                              ),
                            ];
                            update(
                              `lines.${index}.colour`,
                              nextColours.length === 1 ? nextColours[0] : "",
                            );
                            update(`lines.${index}.size`, "");
                          }}
                        />
                        {style && (
                          <div className={styles.styleMeta}>
                            {style.fabricDescription}
                            {style.gsm ? ` · ${style.gsm} GSM` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <FormField
                          name={`lines.${index}.colour`}
                          label={`Colour, line ${index + 1}`}
                          control={control}
                          options={withMissing(
                            colours.map((c) => ({ id: c, label: c })),
                            line.colour,
                            line.colour,
                          )}
                          placeholder="Colour"
                          onValueChange={() =>
                            update(`lines.${index}.size`, "")
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          name={`lines.${index}.size`}
                          label={`Size, line ${index + 1}`}
                          control={control}
                          options={withMissing(
                            sizes.map((size) => ({ id: size, label: size })),
                            line.size,
                            line.size,
                          )}
                          placeholder="Size"
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          name={`lines.${index}.qty`}
                          label={`Quantity, line ${index + 1}`}
                          control={control}
                          type="number"
                          slotProps={{
                            htmlInput: {
                              min: 1,
                              max: 1000000,
                              step: 1,
                              "aria-label": `Quantity, line ${index + 1}`,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          name={`lines.${index}.unitPrice`}
                          label={`Unit price, line ${index + 1}`}
                          control={control}
                          slotProps={{
                            htmlInput: {
                              inputMode: "decimal",
                              "aria-label": `Unit price, line ${index + 1}`,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className={styles.lineAmount}>
                          {formatMoney(
                            lineTotal(line.qty, line.unitPrice),
                            values.currency,
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip
                          title={
                            fields.length === 1
                              ? "Keep at least one line"
                              : "Remove line"
                          }
                        >
                          <span>
                            <IconButton
                              aria-label={`Remove line ${index + 1}`}
                              disabled={
                                fields.length === 1 || isSubmitting || blocked
                              }
                              onClick={() => remove(index)}
                              size="small"
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className={styles.lineTotals}>
            <div className={styles.lineTotalsNote}>
              <Info size={14} />
              <span>
                Totals shown are a preview. Final amounts are calculated by the
                server. Taxes, freight and discounts are not included.
              </span>
            </div>
            <div className={styles.totalsBox}>
              <div className={styles.totalRow}>
                <span>Total quantity</span>
                <strong>{formatQuantity(totals.qty)} PCS</strong>
              </div>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <strong>{formatMoney(totals.amount, values.currency)}</strong>
              </div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Quotation total</span>
                <strong>{formatMoney(totals.amount, values.currency)}</strong>
              </div>
            </div>
          </div>
        </section>
        <div className={styles.formFooter}>
          <p>
            <LockKeyhole size={12} />
            {isDirty ? "Unsaved changes" : "Your draft is ready to work on"}
          </p>
          <div className={styles.formActions}>
            <Button type="button" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              value="save"
              variant="outlined"
              startIcon={<Save size={14} />}
              disabled={isSubmitting || blocked}
              onClick={() => setIntent("save")}
            >
              {isSubmitting && intent === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="submit"
              value="submit"
              variant="contained"
              startIcon={
                isSubmitting ? <Check size={14} /> : <Send size={14} />
              }
              disabled={isSubmitting || blocked}
              onClick={() => setIntent("submit")}
            >
              {isSubmitting && intent === "submit"
                ? "Saving & submitting…"
                : "Save & submit"}
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={reloadDialog} onClose={() => setReloadDialog(false)}>
        <DialogTitle>Reload the latest quotation?</DialogTitle>
        <DialogContent>
          Your current unsaved entries will be replaced by the latest saved
          version. You can keep editing to copy them first.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReloadDialog(false)}>Keep editing</Button>
          <Button
            variant="contained"
            onClick={() => {
              setReloadDialog(false);
              onReload();
            }}
          >
            Reload latest
          </Button>
        </DialogActions>
      </Dialog>
    </form>
  );
}
