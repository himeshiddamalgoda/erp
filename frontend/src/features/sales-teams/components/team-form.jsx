"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDispatch } from "react-redux";
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
import { setEditorDirty } from "@/store/ui-slice";
import { applyServerErrors } from "@/utils/api-error";
import {
  activeIds,
  teamSchema,
  teamPayload,
} from "../schemas/sales-team.schema";
import { StaffPicker } from "./staff-picker";
import { TeamBlockers } from "./team-shared";
import styles from "../sales-teams.module.css";
export function TeamForm({
  team,
  initialValues,
  blocked,
  onSave,
  onCancel,
  onReload,
  staff,
  managers,
  staffFilters,
  managerFilters,
  onStaffFilters,
  onManagerFilters,
  onRetryStaff,
  onRetryManagers,
}) {
  const [baseline] = useState(team),
    [error, setApiError] = useState(null),
    [review, setReview] = useState(null),
    [reload, setReload] = useState(false);
  const [known, setKnown] = useState(() =>
    Object.fromEntries(
      (team?.members || []).map((m) => [
        m.userId,
        {
          id: m.userId,
          displayName: m.displayName,
          managerEligible: m.userId === team.managerId,
        },
      ]),
    ),
  );
  const {
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    defaultValues: initialValues
      ? {
          ...initialValues,
          description: initialValues.description || "",
          reason: "",
        }
      : {
          name: team?.name || "",
          description: team?.description || "",
          managerId: team?.managerId || "",
          memberIds: activeIds(team),
          reason: "",
        },
    resolver: zodResolver(teamSchema(baseline)),
    mode: "onTouched",
  });
  const values = useWatch({ control }),
    dispatch = useDispatch(),
    disabled = isSubmitting || blocked;
  const lookup = {
    ...known,
    ...Object.fromEntries(
      [...(staff.data?.data || []), ...(managers.data?.data || [])].map((u) => [
        u.id,
        u,
      ]),
    ),
  };
  const person = (id) => lookup[id] || { id, displayName: id };
  const remember = (users) =>
    setKnown((old) => ({
      ...old,
      ...Object.fromEntries(users.map((u) => [u.id, u])),
    }));
  const update = (key, value) =>
    setValue(key, value, { shouldDirty: true, shouldValidate: true });
  useEffect(() => {
    dispatch(setEditorDirty(isDirty));
    return () => dispatch(setEditorDirty(false));
  }, [dispatch, isDirty]);
  useEffect(() => {
    if (!isDirty && !blocked) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [isDirty, blocked]);
  const submit = async (data) => {
    setApiError(null);
    try {
      await onSave(teamPayload(data, baseline));
    } catch (e) {
      setApiError(e);
      applyServerErrors(e, setError);
    }
  };
  const removed =
    baseline?.members.filter(
      (m) => m.membershipActive && !values.memberIds.includes(m.userId),
    ) || [];
  return (
    <form
      noValidate
      onSubmit={handleSubmit((data) => {
        if (removed.length) setReview(data);
        else return submit(data);
      })}
    >
      <ApiErrorAlert error={error} resource="sales team">
        {error?.code === "STALE_VERSION" && (
          <Button onClick={() => setReload(true)}>
            Reload and review server data
          </Button>
        )}
      </ApiErrorAlert>
      <TeamBlockers details={error?.details} />
      {!!error?.details?.members?.length && (
        <ul className={styles.blockers}>
          {error.details.members.map((m) => (
            <li key={m.memberId}>
              {person(m.memberId).displayName}: {m.blockerCount} visible
              assignments
              {m.restrictedBlockers &&
                "; additional assignments require their authorized team"}
            </li>
          ))}
        </ul>
      )}
      {error?.code === "MEMBER_HAS_ACTIVE_ASSIGNMENTS" && (
        <Alert severity="info">
          Your edits are retained. Open this team’s assignment tabs in another
          tab, transfer each active record, then retry this complete membership
          set.
        </Alert>
      )}
      {baseline?.status === "Archived" && (
        <Alert severity="info">
          You are repairing an archived team. Reactivate it separately after
          saving.
        </Alert>
      )}
      <fieldset disabled={disabled} className={styles.fieldset}>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Team details</h2>
          <p className={styles.muted}>
            Group existing staff around customer ownership and commercial work.
          </p>
          <div className={styles.grid}>
            <FormField
              control={control}
              name="name"
              label="Team name"
              required
            />
            <FormField
              control={control}
              name="description"
              label="Description"
              multiline
              minRows={2}
            />
          </div>
        </section>
        <section
          className={`${styles.panel} ${styles.section} ${styles.stack}`}
        >
          <h2>Manager and members</h2>
          <Alert severity="info">
            Selecting a manager adds them to the active member selection. The
            previous manager stays a member until you explicitly remove them.
            Membership does not change anyone’s global role.
          </Alert>
          <StaffPicker
            label="Team manager"
            selected={values.managerId ? person(values.managerId) : null}
            onChange={(u) => {
              if (u) remember([u]);
              update("managerId", u?.id || "");
              if (u && !values.memberIds.includes(u.id))
                update("memberIds", [...values.memberIds, u.id]);
            }}
            query={managers}
            onRetry={onRetryManagers}
            filters={managerFilters}
            onFilters={onManagerFilters}
            error={errors.managerId?.message}
            disabled={disabled}
          />
          <StaffPicker
            label="Active team members"
            multiple
            selected={values.memberIds.map(person)}
            onChange={(users) => {
              remember(users);
              update(
                "memberIds",
                users.map((u) => u.id),
              );
            }}
            query={staff}
            onRetry={onRetryStaff}
            filters={staffFilters}
            onFilters={onStaffFilters}
            error={errors.memberIds?.message}
            disabled={disabled}
          />
          <p className={styles.muted}>
            {values.memberIds.length} selected · Save submits the complete
            active membership set. Removed members remain in history.
          </p>
          {baseline && (
            <FormField
              control={control}
              name="reason"
              label="Change reason"
              multiline
              minRows={2}
              helperText="Required for manager or membership changes."
            />
          )}
        </section>
      </fieldset>
      <div className={styles.actions}>
        <Button disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={disabled || error?.code === "STALE_VERSION"}
        >
          {isSubmitting ? "Saving…" : baseline ? "Save changes" : "Create team"}
        </Button>
      </div>
      <Dialog
        open={!!review}
        onClose={() => {
          if (!isSubmitting) setReview(null);
        }}
      >
        <DialogTitle>Review member removals</DialogTitle>
        <DialogContent>
          <p>
            Remove these members from the active team? Their current assignments
            must be transferred or completed first.
          </p>
          <ul>
            {removed.map((m) => (
              <li key={m.userId}>{m.displayName}</li>
            ))}
          </ul>
        </DialogContent>
        <DialogActions>
          <Button disabled={isSubmitting} onClick={() => setReview(null)}>
            Keep editing
          </Button>
          <Button
            disabled={isSubmitting}
            color="error"
            onClick={async () => {
              const data = review;
              setReview(null);
              await handleSubmit(() => submit(data))();
            }}
          >
            Confirm removals and save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={reload} onClose={() => setReload(false)}>
        <DialogTitle>Reload this team?</DialogTitle>
        <DialogContent>
          Your unsaved edits will be discarded. Review the latest version before
          saving again.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReload(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={async () => {
              setReload(false);
              await onReload();
            }}
          >
            Discard edits and reload
          </Button>
        </DialogActions>
      </Dialog>
    </form>
  );
}
