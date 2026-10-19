"use client";
import { useState } from "react";
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
import { applyServerErrors } from "@/utils/api-error";
import { customerReasonSchema } from "../schemas/customer.schema";
import { CustomerBlockers } from "./customer-shared";
export function CustomerActionDialog({
  action,
  customer,
  onClose,
  onSubmit,
  onReload,
}) {
  const [error, setError] = useState(null);
  const {
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: { reason: "" },
    resolver: zodResolver(customerReasonSchema),
  });
  const label =
    action === "archive" ? "Archive customer" : "Reactivate customer";
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit(async ({ reason }) => {
          setError(null);
          try {
            await onSubmit({ version: customer.version, reason });
          } catch (e) {
            setError(e);
            applyServerErrors(e, setFieldError);
          }
        })}
        noValidate
      >
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            {action === "archive"
              ? "Disable this buyer for new commercial work. Existing confirmed orders can continue fulfilment."
              : "Revalidate the current master and active assignment before enabling new commercial work."}
          </Alert>
          <p>
            {customer.name} · Version {customer.version}
          </p>
          <ApiErrorAlert error={error} resource="customer">
            {error?.code === "STALE_VERSION" && (
              <Button
                onClick={async () => {
                  try {
                    await onReload();
                    setError(null);
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                Reload profile and review before retrying
              </Button>
            )}
          </ApiErrorAlert>
          <CustomerBlockers details={error?.details} newTab />
          {error?.status === 422 && (
            <Alert severity="warning">
              Repair the profile’s assignment, contacts or addresses through
              Edit customer, then retry this action with the updated version.
            </Alert>
          )}
          <FormField
            name="reason"
            label="Reason"
            required
            control={control}
            multiline
            minRows={3}
            disabled={isSubmitting}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={action === "archive" ? "error" : "primary"}
            disabled={isSubmitting || error?.code === "STALE_VERSION"}
          >
            {isSubmitting ? "Saving…" : label}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
