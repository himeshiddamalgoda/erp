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
import { reasonSchema } from "../schemas/sales-team.schema";
import { TeamBlockers } from "./team-shared";
export function TeamActionDialog({
  team,
  action,
  onClose,
  onSubmit,
  onReload,
}) {
  const [error, setApiError] = useState(null),
    [version, setVersion] = useState(team.version);
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: { reason: "" },
    resolver: zodResolver(reasonSchema),
  });
  const label = action === "archive" ? "Archive team" : "Reactivate team";
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
        noValidate
        onSubmit={handleSubmit(async ({ reason }) => {
          setApiError(null);
          try {
            await onSubmit({ version, reason });
          } catch (e) {
            setApiError(e);
            applyServerErrors(e, setError);
          }
        })}
      >
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            {action === "archive"
              ? "Active customers and open documents must be resolved first. Delivered orders still block until closed or transferred. Members and history are preserved."
              : "Repair inactive staff or an invalid manager before reactivation. Existing documents retain their status."}
          </Alert>
          <p>
            {team.name} · Version {version}
          </p>
          <ApiErrorAlert error={error} resource="sales team">
            {error?.code === "STALE_VERSION" && (
              <Button
                onClick={async () => {
                  try {
                    const latest = await onReload();
                    setVersion(latest.version);
                    setApiError(null);
                  } catch (e) {
                    setApiError(e);
                  }
                }}
              >
                Reload profile and review before retrying
              </Button>
            )}
          </ApiErrorAlert>
          <TeamBlockers details={error?.details} />
          <FormField
            control={control}
            name="reason"
            label="Reason"
            required
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
