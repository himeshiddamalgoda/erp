"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { FormField } from "@/components/forms/form-field";
import { ApiErrorAlert, LoadingState } from "@/components/ui/page-state";
import { applyServerErrors } from "@/utils/api-error";
import { reassignmentSchema } from "../schemas/sales-team.schema";
import styles from "../sales-teams.module.css";
export function TeamReassignDialog({
  record,
  entity,
  teams,
  target,
  filters,
  onFilters,
  onTarget,
  onClose,
  onSubmit,
  onReload,
  onRetryTeams,
  onRetryTarget,
}) {
  const [error, setApiError] = useState(null),
    [selected, setSelected] = useState(null),
    [reviewedVersion, setReviewedVersion] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  if (!snapshot && entity.data && !entity.isFetching) setSnapshot(entity.data);
  const {
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({
    defaultValues: { salesTeamId: "", ownerId: "", reason: "" },
    resolver: zodResolver(reassignmentSchema),
  });
  const values = useWatch({ control });
  const version = reviewedVersion ?? snapshot?.version;
  const members =
    target.data?.members.filter((m) => m.membershipActive && m.userActive) ||
    [];
  const invalidManager = target.data?.integrityWarnings.some(
    (w) => w.code === "INVALID_MANAGER",
  );
  const ready =
    !!snapshot &&
    !!entity.data &&
    !entity.error &&
    !entity.isFetching &&
    !!target.data &&
    !target.error &&
    !target.isFetching &&
    !invalidManager &&
    target.data.status === "Active";
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
        onSubmit={handleSubmit(async (data) => {
          setApiError(null);
          try {
            await onSubmit({
              ...data,
              entityType: record.type,
              entityId: record.id,
              version,
            });
          } catch (e) {
            setApiError(e);
            applyServerErrors(e, setError);
          }
        })}
      >
        <DialogTitle>Reassign {record.label}</DialogTitle>
        <DialogContent>
          <div className={styles.stack}>
            <Alert severity="info">
              Transfer this record only. Commercial content and approvals stay
              unchanged. A customer transfer does not move its quotations or
              orders. Both source and target access are required.
            </Alert>
            {entity.isPending ? (
              <LoadingState label="Loading current assignment…" />
            ) : entity.error ? (
              <Alert severity="error">
                {entity.error.message}
                <Button
                  onClick={async () => {
                    try {
                      const latest = await onReload();
                      setReviewedVersion(latest.version);
                      setApiError(null);
                    } catch (e) {
                      setApiError(e);
                    }
                  }}
                >
                  Reload record
                </Button>
              </Alert>
            ) : (
              <p>Current record version: {version}</p>
            )}
            <ApiErrorAlert error={error} resource="record">
              {error?.code === "STALE_VERSION" && (
                <Button
                  onClick={async () => {
                    try {
                      const latest = await onReload();
                      setReviewedVersion(latest.version);
                      setApiError(null);
                    } catch (e) {
                      setApiError(e);
                    }
                  }}
                >
                  Reload record and review before retrying
                </Button>
              )}
            </ApiErrorAlert>
            <Autocomplete
              options={teams.data?.data || []}
              value={selected}
              filterOptions={(x) => x}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={(t) => `${t.code} · ${t.name}`}
              loading={teams.isFetching}
              disabled={isSubmitting}
              onInputChange={(_, q, reason) => {
                if (reason === "input" || reason === "clear")
                  onFilters({ q, page: 1 });
              }}
              onChange={(_, team) => {
                setSelected(team);
                setValue("salesTeamId", team?.id || "", {
                  shouldValidate: true,
                });
                setValue("ownerId", "");
                onTarget(team?.id);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Target sales team"
                  error={!!errors.salesTeamId}
                  helperText={errors.salesTeamId?.message}
                />
              )}
            />
            {teams.error && (
              <Alert severity="error">
                Unable to load target teams.
                <Button onClick={onRetryTeams}>Retry teams</Button>
              </Alert>
            )}
            <div className={styles.row}>
              <Button
                disabled={isSubmitting || filters.page <= 1 || teams.isFetching}
                onClick={() => onFilters({ page: filters.page - 1 })}
              >
                Previous teams
              </Button>
              <small>
                Page {filters.page} · {teams.data?.meta.total || 0} matching
                teams
              </small>
              <Button
                disabled={
                  isSubmitting ||
                  teams.isFetching ||
                  filters.page * filters.pageSize >=
                    (teams.data?.meta.total || 0)
                }
                onClick={() => onFilters({ page: filters.page + 1 })}
              >
                Next teams
              </Button>
            </div>
            {target.isFetching && values.salesTeamId && (
              <p>Loading eligible members…</p>
            )}
            {target.error && (
              <Alert severity="error">
                {target.error.message}
                <Button onClick={onRetryTarget}>Retry members</Button>
              </Alert>
            )}
            {invalidManager && (
              <Alert severity="warning">
                Repair the target manager before transferring responsibility.
              </Alert>
            )}
            {target.data &&
              !target.data.eligibleForAssignment &&
              !invalidManager && (
                <Alert severity="warning">
                  This team requires staff repairs. An explicit transfer to an
                  eligible active owner can resolve existing assignments; repair
                  the team before creating new commercial work.
                </Alert>
              )}
            <FormField
              control={control}
              name="ownerId"
              label="Target owner"
              required
              options={members.map((m) => ({
                id: m.userId,
                label: m.displayName,
              }))}
              disabled={isSubmitting || !ready}
            />
            <FormField
              control={control}
              name="reason"
              label="Transfer reason"
              required
              multiline
              minRows={3}
              disabled={isSubmitting}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !ready || error?.code === "STALE_VERSION"}
          >
            {isSubmitting ? "Transferring…" : "Transfer assignment"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
