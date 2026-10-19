"use client";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Save, Building2, ClipboardList, LockKeyhole } from "lucide-react";
import { FormField } from "@/components/forms/form-field";
import { GarmentLinesEditor } from "@/components/forms/garment-lines-editor";
import { setEditorDirty } from "@/store/ui-slice";
import { orderDraftSchema } from "../schemas/sales-order.schema";
import {
  orderFormValues,
  orderPayload,
  withMissing,
} from "@/utils/sales-order";
import {
  formatMoney,
  formatQuantity,
  quotationTotals,
  addressLabel,
} from "@/utils/format";
import { applyServerErrors } from "@/utils/api-error";
import { ApiErrorAlert } from "@/components/ui/page-state";
import { OrderCommercialTerms, OrderLines } from "./order-overview";
import styles from "../sales-orders.module.css";
export function OrderForm({
  order,
  options,
  initialValues,
  onSave,
  onCancel,
  onReload,
  blocked = false,
}) {
  const converted = !!order?.sourceQuotationId,
    dispatch = useDispatch();
  const form = useForm({
    resolver: zodResolver(
      orderDraftSchema(options.company.businessDate, converted, order),
    ),
    defaultValues:
      initialValues || orderFormValues(order, options.company.businessDate),
    mode: "onTouched",
  });
  const {
    control,
    setValue,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors },
    setError,
  } = form;
  const values = useWatch({ control }),
    [error, setApiError] = useState(null),
    [reload, setReload] = useState(false);
  const buyer = options.customers.find(
    (c) => c.id === (converted ? order.customerId : values.customerId),
  );
  const team = options.teams.find((t) => t.id === values.salesTeamId);
  const disabled = blocked || isSubmitting;
  const update = (k, v) => setValue(k, v, { shouldDirty: true });
  const totals = quotationTotals(values.lines);
  useEffect(() => {
    dispatch(setEditorDirty(isDirty));
    return () => dispatch(setEditorDirty(false));
  }, [dispatch, isDirty]);
  useEffect(() => {
    if (!isDirty) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [isDirty]);
  const chooseBuyer = (id) => {
    const b = options.customers.find((c) => c.id === id);
    if (!b) return;
    for (const k of ["salesTeamId", "ownerId", "currency", "paymentTerms"])
      update(k, b[k] || "");
    for (const type of ["billing", "shipping"])
      update(
        type + "AddressId",
        b.addresses.find((a) => a.addressType === type && a.isDefault)?.id ||
          b.addresses.find((a) => a.addressType === type)?.id ||
          "",
      );
  };
  const addressOptions = (type) =>
    withMissing(
      (buyer?.addresses || [])
        .filter((a) => a.addressType === type)
        .map((a) => ({ id: a.id, label: addressLabel(a) })),
      values[type + "AddressId"],
    );
  const field = (name, label, props = {}) => (
    <FormField
      name={name}
      label={label}
      control={control}
      disabled={disabled}
      {...props}
    />
  );
  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (data) => {
        setApiError(null);
        try {
          const body = orderPayload(data, converted, order);
          if (!Object.keys(body).length) {
            setError("root", {
              type: "manual",
              message: "Change an operational detail before saving.",
            });
            return;
          }
          await onSave(body);
        } catch (e) {
          setApiError(e);
          applyServerErrors(e, setError);
        }
      })}
    >
      {errors.root?.message && (
        <Alert severity="error" className={styles.alert}>
          {errors.root.message}
        </Alert>
      )}
      <ApiErrorAlert error={error} resource="sales order">
        {error?.code === "STALE_VERSION" && (
          <Button onClick={() => setReload(true)}>Reload latest version</Button>
        )}
      </ApiErrorAlert>
      {converted && (
        <Alert severity="info" className={styles.alert}>
          This order comes from an accepted quotation. Buyer, currency, billing,
          terms, garments, quantities and prices are frozen.
        </Alert>
      )}
      <div className={styles.panel}>
        <fieldset className={styles.fieldset} disabled={disabled}>
          {converted ? (
            <>
              <section className={styles.section}>
                <h2>
                  <LockKeyhole size={16} />
                  Agreed commercial terms
                </h2>
                <p>
                  Review the original agreement while updating the operational
                  details below.
                </p>
                <OrderCommercialTerms order={order} options={options} />
              </section>
              <OrderLines order={order} />
            </>
          ) : (
            <section className={styles.section}>
              <h2>
                <Building2 size={17} />
                Buyer &amp; ownership
              </h2>
              <p>
                Choose a buyer to load their team, addresses and payment
                defaults.
              </p>
              <div className={styles.grid}>
                {field("customerId", "Buyer", {
                  required: true,
                  options: withMissing(
                    options.customers.map((c) => ({
                      id: c.id,
                      label: `${c.name} · ${c.code}`,
                    })),
                    values.customerId,
                    order?.customerName,
                  ),
                  onValueChange: chooseBuyer,
                  placeholder: "Choose a buyer",
                })}
                {field("salesTeamId", "Sales team", {
                  required: true,
                  options: withMissing(
                    options.teams.map((t) => ({ id: t.id, label: t.name })),
                    values.salesTeamId,
                  ),
                  onValueChange: (id) => {
                    if (
                      !options.teams
                        .find((t) => t.id === id)
                        ?.members.some((m) => m.id === values.ownerId)
                    )
                      update("ownerId", "");
                  },
                })}
                {field("ownerId", "Order owner", {
                  required: true,
                  options: withMissing(
                    (team?.members || []).map((m) => ({
                      id: m.id,
                      label: m.displayName,
                    })),
                    values.ownerId,
                  ),
                })}
              </div>
              {buyer && (
                <p className={styles.space}>
                  {buyer.contacts
                    .map(
                      (c) =>
                        `${c.name} · ${c.email || c.phone || "Contact details missing"}`,
                    )
                    .join(" / ") ||
                    "An active primary buyer contact is required before confirmation."}
                </p>
              )}
            </section>
          )}
          <section className={styles.section}>
            <h2>
              <ClipboardList size={17} />
              PO &amp; delivery details
            </h2>
            <p>
              Drafts can be saved before final details are ready. A manager
              confirms the completed order.
            </p>
            <div className={styles.grid}>
              {!converted &&
                field("orderDate", "Order date", {
                  type: "date",
                  required: true,
                })}
              {field("buyerPoNumber", "Buyer PO number", {
                placeholder: "e.g. OA-1045",
              })}
              {field("buyerPoDate", "Buyer PO date", { type: "date" })}
              {field("requestedDeliveryDate", "Requested delivery", {
                type: "date",
              })}
              {!converted &&
                field("currency", "Currency", {
                  options: options.company.currencies.map((id) => ({
                    id,
                    label: id,
                  })),
                  helperText:
                    "Prices remain as entered; no currency conversion.",
                })}
              {!converted &&
                field("billingAddressId", "Billing address", {
                  options: addressOptions("billing"),
                })}
              {field("shippingAddressId", "Shipping address", {
                options: addressOptions("shipping"),
              })}
            </div>
            <div className={`${styles.two} ${styles.space}`}>
              {!converted &&
                field("paymentTerms", "Payment terms", {
                  multiline: true,
                  minRows: 2,
                })}
              {field("publicNotes", "Buyer-visible notes", {
                multiline: true,
                minRows: 2,
                helperText: "Included on the order confirmation PDF.",
              })}
              {field("internalNotes", "Internal notes", {
                multiline: true,
                minRows: 2,
                helperText: "Staff only. Never shown on the buyer PDF.",
              })}
            </div>
          </section>
          {!converted && (
            <section className={styles.section}>
              <GarmentLinesEditor
                form={form}
                options={options}
                disabled={disabled}
              />
              <div className={styles.totals}>
                <div className={styles.total}>
                  <span>Total quantity</span>
                  <strong>{formatQuantity(totals.qty)} PCS</strong>
                </div>
                <div className={`${styles.total} ${styles.grand}`}>
                  <span>Order total</span>
                  <strong>{formatMoney(totals.amount, values.currency)}</strong>
                </div>
                <div className={styles.hint}>
                  Preview totals. The server calculates final amounts.
                </div>
              </div>
            </section>
          )}
        </fieldset>
        <div className={styles.footer}>
          <span className={styles.hint}>
            <LockKeyhole size={12} />
            {isDirty ? "Unsaved changes" : "Draft workspace"}
          </span>
          <div className={styles.buttons}>
            <Button onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<Save size={15} />}
              disabled={disabled}
            >
              {isSubmitting ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={reload} onClose={() => setReload(false)}>
        <DialogTitle>Reload the latest order?</DialogTitle>
        <DialogContent>
          Your unsaved entries will be replaced. Keep editing if you need to
          copy them first.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReload(false)}>Keep editing</Button>
          <Button
            variant="contained"
            onClick={() => {
              setReload(false);
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
