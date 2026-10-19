"use client";
import { useState } from "react";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Tab, Tabs, LinearProgress } from "@mui/material";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, ErrorState } from "@/components/ui/page-state";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { canManageTeams } from "@/constants/sales-teams";
import { notify } from "@/store/ui-slice";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { useQuotations } from "@/features/quotations/hooks/use-quotations";
import { useSalesOrders } from "@/features/sales-orders/hooks/use-sales-orders";
import {
  useAssignment,
  useReassign,
} from "@/features/assignments/hooks/use-assignments";
import {
  useSalesTeam,
  useSalesTeams,
  useTeamMutations,
} from "../hooks/use-sales-teams";
import { TeamStatus, TeamPagination } from "../components/team-shared";
import { TeamProfile } from "../components/team-profile";
import { TeamAssignments } from "../components/team-assignments";
import { TeamActionDialog } from "../components/team-action-dialog";
import { TeamReassignDialog } from "../components/team-reassign-dialog";
import styles from "../sales-teams.module.css";
export default function TeamDetailPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const refs = useQuotationOptions(base),
    query = useSalesTeam(base, id),
    mutations = useTeamMutations(base),
    dispatch = useDispatch();
  const [tab, setTab] = useState("profile"),
    [includeInactive, setIncludeInactive] = useState(false),
    [action, setAction] = useState(null),
    [record, setRecord] = useState(null),
    [targetId, setTargetId] = useState(null);
  const [pages, setPages] = useState({
    customer: { page: 1, pageSize: 20 },
    quotation: { page: 1, pageSize: 20 },
    salesOrder: { page: 1, pageSize: 20 },
  });
  const customers = useCustomers(
      base,
      { ...pages.customer, salesTeamId: id, status: "All" },
      { enabled: tab === "customer" },
    ),
    quotes = useQuotations(
      base,
      { ...pages.quotation, salesTeamId: id, includeRevisions: true },
      { enabled: tab === "quotation" },
    ),
    orders = useSalesOrders(
      base,
      { ...pages.salesOrder, salesTeamId: id },
      { enabled: tab === "salesOrder" },
    );
  const [targetFilters, setTargetFilters] = useState({
    status: "Active",
    q: "",
    page: 1,
    pageSize: 20,
  });
  const entity = useAssignment(base, record?.type, record?.id),
    teams = useSalesTeams(base, targetFilters, !!record),
    target = useSalesTeam(base, record ? targetId : null),
    transfer = useReassign(base);
  const queries = {
      customer: customers,
      quotation: quotes,
      salesOrder: orders,
    },
    assignments = queries[tab];
  const refresh = () => {
    refs.refetch();
    query.refetch();
    assignments?.refetch();
  };
  const reload = async () => {
    const result = await query.refetch();
    if (result.error) throw result.error;
    return result.data;
  };
  const team = query.data;
  return (
    <AppShell
      actor={refs.data?.actor}
      breadcrumb={team?.code || "Team profile"}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <Link href={ROUTES.salesTeams} className={styles.back}>
        ← Back to sales teams
      </Link>
      {refs.isPending || query.isPending ? (
        <LoadingState />
      ) : refs.error || query.error ? (
        <ErrorState
          title={
            query.error?.status === 404 ? "Sales team not found" : undefined
          }
          error={refs.error || query.error}
          onRetry={refresh}
          backHref={ROUTES.salesTeams}
          backLabel="Back to sales teams"
        />
      ) : (
        <>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>{team.code}</p>
              <h1>{team.name}</h1>
              <div className={styles.row}>
                <TeamStatus status={team.status} />
                <span className={styles.muted}>
                  {team.manager?.displayName || "Manager requires repair"} ·{" "}
                  {team.activeMemberCount} active members
                </span>
              </div>
            </div>
            <div className={styles.row}>
              {team.allowedActions.includes("edit") && (
                <Button
                  component={Link}
                  href={ROUTES.editSalesTeam(id)}
                  variant="outlined"
                >
                  Edit team
                </Button>
              )}
              {canManageTeams(refs.data.actor) && team.status === "Active" && (
                <Button color="error" onClick={() => setAction("archive")}>
                  Archive team
                </Button>
              )}
              {team.allowedActions.includes("reactivate") && (
                <Button
                  variant="contained"
                  onClick={() => setAction("reactivate")}
                >
                  Reactivate team
                </Button>
              )}
            </div>
          </div>
          {!canManageTeams(refs.data.actor) && (
            <Alert severity="info" className={styles.notice}>
              Team settings are read only in this workspace. Management and
              transfer actions require their own permissions.
            </Alert>
          )}
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            className={styles.tabs}
            aria-label="Team sections"
          >
            <Tab
              id="team-tab-profile"
              aria-controls="team-panel"
              value="profile"
              label="Profile & members"
            />
            <Tab
              id="team-tab-customer"
              aria-controls="team-panel"
              value="customer"
              label="Customers"
            />
            <Tab
              id="team-tab-quotation"
              aria-controls="team-panel"
              value="quotation"
              label="Quotations"
            />
            <Tab
              id="team-tab-salesOrder"
              aria-controls="team-panel"
              value="salesOrder"
              label="Sales orders"
            />
          </Tabs>
          <div
            id="team-panel"
            role="tabpanel"
            aria-labelledby={`team-tab-${tab}`}
          >
            {tab === "profile" ? (
              <TeamProfile
                team={team}
                includeInactive={includeInactive}
                onIncludeInactive={setIncludeInactive}
              />
            ) : (
              <>
                <Alert severity="info" className={styles.notice}>
                  Showing records visible to your workspace. Quotations include
                  all revisions. Resolve each active record separately before
                  removing its owner or archiving this team.
                </Alert>
                <div className={styles.panel}>
                  {assignments.isPending ? (
                    <LoadingState />
                  ) : assignments.error ? (
                    <ErrorState
                      error={assignments.error}
                      onRetry={() => assignments.refetch()}
                      backHref={ROUTES.salesTeams}
                      backLabel="Back to sales teams"
                    />
                  ) : (
                    <>
                      {assignments.isFetching && <LinearProgress />}
                      <TeamAssignments
                        data={assignments.data.data}
                        type={tab}
                        actor={refs.data.actor}
                        onReassign={(r) => {
                          setTargetId(null);
                          setTargetFilters({
                            status: "Active",
                            q: "",
                            page: 1,
                            pageSize: 20,
                          });
                          setRecord(r);
                        }}
                      />
                      <TeamPagination
                        meta={assignments.data.meta}
                        filters={pages[tab]}
                        onChange={(changes) =>
                          setPages((old) => ({
                            ...old,
                            [tab]: { ...old[tab], ...changes },
                          }))
                        }
                        disabled={assignments.isPlaceholderData}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {action && (
            <TeamActionDialog
              key={action}
              team={team}
              action={action}
              onClose={() => setAction(null)}
              onReload={reload}
              onSubmit={async (body) => {
                await mutations.lifecycle.mutateAsync({ id, action, body });
                setAction(null);
                dispatch(
                  notify({
                    message:
                      action === "archive"
                        ? "Team archived."
                        : "Team reactivated.",
                  }),
                );
              }}
            />
          )}
          {record && (
            <TeamReassignDialog
              key={`${record.type}:${record.id}`}
              record={record}
              entity={entity}
              teams={teams}
              target={target}
              filters={targetFilters}
              onFilters={(changes) =>
                setTargetFilters((old) => ({ ...old, ...changes }))
              }
              onTarget={setTargetId}
              onClose={() => setRecord(null)}
              onRetryTeams={() => teams.refetch()}
              onRetryTarget={() => target.refetch()}
              onReload={async () => {
                const result = await entity.refetch();
                if (result.error) throw result.error;
                return result.data;
              }}
              onSubmit={async (body) => {
                await transfer.mutateAsync(body);
                setRecord(null);
                dispatch(
                  notify({
                    message:
                      "Assignment transferred. Related documents retain their existing owners.",
                  }),
                );
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
