"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  LoadingState,
  ErrorState,
  ApiErrorAlert,
} from "@/components/ui/page-state";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { canManageTeams } from "@/constants/sales-teams";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { notify, setEditorDirty } from "@/store/ui-slice";
import {
  beginOrderAttempt,
  clearOrderAttempt,
  uncertainOrderOutcome,
} from "@/utils/order-attempt";
import { useSalesTeam, useTeamMutations } from "../hooks/use-sales-teams";
import {
  useTeamAttempt,
  useTeamHydrated,
  teamAttemptScope,
} from "../hooks/use-team-attempt";
import { useStaff } from "@/features/staff/hooks/use-staff";
import { TeamForm } from "../components/team-form";
import styles from "../sales-teams.module.css";
export default function TeamEditorPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id || "new"}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const refs = useQuotationOptions(base),
    query = useSalesTeam(base, id),
    mutations = useTeamMutations(base),
    router = useRouter(),
    dispatch = useDispatch(),
    dirty = useSelector((s) => s.ui.editorDirty),
    hydrated = useTeamHydrated();
  const [staffFilters, setStaffFilters] = useState({
      status: "Active",
      q: "",
      page: 1,
      pageSize: 20,
    }),
    [managerFilters, setManagerFilters] = useState({
      status: "Active",
      managerEligible: true,
      q: "",
      page: 1,
      pageSize: 20,
    });
  const staff = useStaff(
      base,
      staffFilters,
      !!canManageTeams(refs.data?.actor),
    ),
    managers = useStaff(
      base,
      managerFilters,
      !!canManageTeams(refs.data?.actor),
    );
  const [formKey, setFormKey] = useState(0),
    [leave, setLeave] = useState(false),
    [error, setError] = useState(null);
  const scope = teamAttemptScope(base, refs.data?.actor.id),
    storedAttempt = useTeamAttempt(scope);
  const attempt = id ? null : storedAttempt;
  const back = id ? ROUTES.salesTeam(id) : ROUTES.salesTeams;
  const canEdit = id
    ? query.data?.allowedActions.includes("edit")
    : canManageTeams(refs.data?.actor);
  const finish = (c) => {
    dispatch(setEditorDirty(false));
    dispatch(notify({ message: id ? "Team updated." : "Team created." }));
    router.push(ROUTES.salesTeam(c.id));
  };
  const execute = async (tracked) => {
    try {
      const c = await mutations.create.mutateAsync(tracked);
      clearOrderAttempt(scope, "create");
      finish(c);
    } catch (e) {
      if (!uncertainOrderOutcome(e) && e.code !== "IDEMPOTENCY_KEY_REUSED")
        clearOrderAttempt(scope, "create");
      throw e;
    }
  };
  const save = async (body) => {
    setError(null);
    if (id) finish(await mutations.update.mutateAsync({ id, body }));
    else await execute(beginOrderAttempt(scope, "create", body));
  };
  const cancel = () => (dirty || attempt ? setLeave(true) : router.push(back));
  return (
    <AppShell
      actor={refs.data?.actor}
      breadcrumb={id ? "Edit team" : "New team"}
    >
      <button className={styles.back} onClick={cancel}>
        <ArrowLeft size={14} />
        Back to {id ? "team" : "teams"}
      </button>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>TEAM ORGANIZATION</p>
          <h1>{id ? `Edit ${query.data?.code || "team"}` : "New team"}</h1>
          <p className={styles.subtitle}>
            Organize managers, active members and assignment responsibility.
          </p>
        </div>
      </div>
      {!hydrated || refs.isPending || (id && query.isPending) ? (
        <LoadingState />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          title={query.error?.status === 404 ? "Team not found" : undefined}
          onRetry={() => {
            refs.refetch();
            if (id) query.refetch();
          }}
          backHref={ROUTES.salesTeams}
          backLabel="Back to teams"
        />
      ) : !canEdit ? (
        <Alert severity="info">
          Your current workspace does not have permission to edit team data.
          <Button onClick={() => router.push(back)}>Return</Button>
        </Alert>
      ) : (
        <>
          <ApiErrorAlert error={error} resource="team" />
          {!id && attempt && (
            <Alert severity="warning" className={styles.notice}>
              A create attempt has an unknown outcome. The submitted data is
              held unchanged so retrying uses the original idempotency key.
              <Button
                disabled={mutations.create.isPending}
                onClick={async () => {
                  setError(null);
                  try {
                    await execute(attempt);
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                Retry original create
              </Button>
            </Alert>
          )}
          <TeamForm
            key={formKey}
            team={query.data}
            staff={staff}
            onRetryStaff={() => staff.refetch()}
            onRetryManagers={() => managers.refetch()}
            managers={managers}
            staffFilters={staffFilters}
            managerFilters={managerFilters}
            onStaffFilters={(changes) =>
              setStaffFilters((old) => ({ ...old, ...changes }))
            }
            onManagerFilters={(changes) =>
              setManagerFilters((old) => ({ ...old, ...changes }))
            }
            initialValues={!id ? attempt?.body : undefined}
            blocked={!id && !!attempt}
            onSave={save}
            onCancel={cancel}
            onReload={async () => {
              const response = await query.refetch();
              if (response.error) {
                setError(response.error);
                return;
              }
              if (response.data) {
                dispatch(setEditorDirty(false));
                setFormKey((k) => k + 1);
              }
            }}
          />
        </>
      )}
      <Dialog open={leave} onClose={() => setLeave(false)}>
        <DialogTitle>Leave this team form?</DialogTitle>
        <DialogContent>
          {attempt
            ? "The unresolved create attempt will be retained for a safe retry when you return."
            : "Your unsaved edits will be discarded."}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeave(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={() => {
              dispatch(setEditorDirty(false));
              router.push(back);
            }}
          >
            Leave form
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
