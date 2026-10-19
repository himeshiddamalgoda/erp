"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { FormField } from "@/components/forms/form-field";
import { ApiErrorAlert } from "@/components/ui/page-state";
import { ORDER_ACTIONS } from "@/constants/sales-orders";
import { applyServerErrors } from "@/utils/api-error";
import { withMissing } from "@/utils/sales-order";
import { addressLabel, formatDate } from "@/utils/format";
import { orderActionSchema } from "../schemas/sales-order.schema";
import styles from "../sales-orders.module.css";
const descriptions = {
  confirm:
    "Review PO, contact, addresses, prices and delivery. Confirmation freezes document revision 1 and queues the production handoff.",
  hold: "Pause the local queued handoff. This cannot stop work that has already been claimed or started.",
  resume: "Release the local hold. The handoff becomes eligible for dispatch.",
  cancel:
    "Cancel this order and its local queued handoff. Quotation conversion and document history remain preserved.",
  close:
    "Close operational delivery after every garment line is complete. Payment settlement is separate.",
  revisions:
    "Amend delivery, shipping address or buyer-visible notes. Prices, quantities and all other commercial terms remain frozen.",
  delete:
    "Remove this Draft from the workspace. Its history and source quotation link remain reserved.",
};
export function OrderActionDialog({
  context,
  options,
  onConfirm,
  onClose,
  onRefresh,
  tracked,
}) {
  const { order, action, error, setError } = context;
  const form = useForm({
    resolver: zodResolver(
      orderActionSchema(action, options.company.businessDate, order),
    ),
    defaultValues: {
      reason: "",
      comment: "",
      buyerReference: "",
      requestedDeliveryDate: order.requestedDeliveryDate || "",
      shippingAddressId: order.shippingAddressId || "",
      publicNotes: order.publicNotes || "",
    },
  });
  const {
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { isSubmitting, errors },
  } = form;
  const addresses = withMissing(
    (options.customers.find((c) => c.id === order.customerId)?.addresses || [])
      .filter((a) => a.addressType === "shipping")
      .map((a) => ({ id: a.id, label: addressLabel(a) })),
    order.shippingAddressId,
    "Current frozen shipping address",
  );
  const disabled = isSubmitting || tracked;
  return (
    <Dialog
      open
      onClose={isSubmitting ? undefined : onClose}
      disableEscapeKeyDown={isSubmitting}
      aria-labelledby="order-action-title"
    >
      <form
        noValidate
        onSubmit={handleSubmit(async (values) => {
          setError(null);
          try {
            await onConfirm(values);
          } catch (e) {
            setError(e);
            applyServerErrors(e, setFieldError);
          }
        })}
      >
        <DialogTitle id="order-action-title">
          {ORDER_ACTIONS[action]}
        </DialogTitle>
        <DialogContent>
          <p className={styles.subtitle}>
            {order.orderNumber} · Record version {order.version}
          </p>
          <p className={`${styles.subtitle} ${styles.space}`}>
            {descriptions[action]}
          </p>
          <ApiErrorAlert error={error} resource="sales order">
            {Object.entries(error?.fields || {}).length > 0 && (
              <ul className={styles.errorList}>
                {Object.entries(error.fields)
                  .filter(
                    ([key]) =>
                      ![
                        "reason",
                        "comment",
                        "buyerReference",
                        "requestedDeliveryDate",
                        "shippingAddressId",
                        "publicNotes",
                      ].includes(key),
                  )
                  .map(([key, value]) => (
                    <li key={key}>
                      {key}: {value}
                    </li>
                  ))}
              </ul>
            )}
            {error?.status === 409 && (
              <Button disabled={isSubmitting} onClick={onRefresh}>
                Reload latest order
              </Button>
            )}
          </ApiErrorAlert>
          {tracked && (
            <Alert severity="warning">
              Retry will send the original request with the same key and
              version.
            </Alert>
          )}
          <div className={styles.dialogFields}>
            {["cancel", "hold", "resume", "revisions"].includes(action) && (
              <FormField
                name="reason"
                label="Reason"
                control={control}
                required
                multiline
                minRows={2}
                disabled={disabled}
              />
            )}
            {["confirm", "close"].includes(action) && (
              <FormField
                name="comment"
                label="Review comment"
                control={control}
                multiline
                minRows={2}
                disabled={disabled}
              />
            )}
            {action === "confirm" && (
              <Alert severity="info">
                PO: {order.buyerPoNumber || "Not set"} · Delivery:{" "}
                {formatDate(order.requestedDeliveryDate)}. Edit the Draft first
                if anything is incomplete.
              </Alert>
            )}
            {action === "revisions" && (
              <>
                <Alert severity="info">
                  The order keeps its ID, number and Confirmed status. A new
                  immutable document revision will be created.
                </Alert>
                <FormField
                  name="buyerReference"
                  label="Buyer reference"
                  control={control}
                  required
                  disabled={disabled}
                />
                <FormField
                  name="requestedDeliveryDate"
                  label="Requested delivery"
                  type="date"
                  control={control}
                  disabled={disabled}
                />
                <FormField
                  name="shippingAddressId"
                  label="Shipping address"
                  control={control}
                  options={addresses}
                  disabled={disabled}
                />
                <FormField
                  name="publicNotes"
                  label="Buyer-visible notes"
                  control={control}
                  multiline
                  minRows={3}
                  disabled={disabled}
                />
                {errors.root?.message && (
                  <Alert severity="error">{errors.root.message}</Alert>
                )}
              </>
            )}
            {action === "delete" && (
              <Alert severity="warning">
                This action removes the Draft from lists. It cannot free a
                quotation for another conversion.
              </Alert>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button disabled={isSubmitting} onClick={onClose}>
            Keep order
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={["cancel", "delete"].includes(action) ? "error" : "primary"}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Saving…"
              : tracked
                ? "Retry original request"
                : ORDER_ACTIONS[action]}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
