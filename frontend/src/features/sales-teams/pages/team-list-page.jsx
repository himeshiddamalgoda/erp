"use client";
import { useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { Button, LinearProgress } from "@mui/material";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, ErrorState } from "@/components/ui/page-state";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { canManageTeams } from "@/constants/sales-teams";
import { readTeamFilters, teamFilterSearch } from "@/utils/sales-team";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useSalesTeams } from "../hooks/use-sales-teams";
import { TeamFilters, TeamTable } from "../components/team-list";
import styles from "../sales-teams.module.css";
export default function TeamListPage() {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={base} base={base} />;
}
function Workspace({ base }) {
  const search = useSearchParams(),
    router = useRouter(),
    filters = readTeamFilters(search),
    refs = useQuotationOptions(base),
    query = useSalesTeams(
      base,
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
    );
  const onChange = useCallback(
    (changes) =>
      router.replace(
        `${ROUTES.salesTeams}?${teamFilterSearch({ ...readTeamFilters(search), ...changes })}`,
        { scroll: false },
      ),
    [search, router],
  );
  const refresh = () => {
    refs.refetch();
    query.refetch();
  };
  const people = [
    ...new Map(
      (refs.data?.teams || []).flatMap((t) => t.members).map((m) => [m.id, m]),
    ).values(),
  ];
  return (
    <AppShell
      actor={refs.data?.actor}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PEOPLE & RESPONSIBILITY</p>
          <h1>Sales teams</h1>
          <p className={styles.subtitle}>
            A clear home for managers, members and commercial assignments.
          </p>
        </div>
        {canManageTeams(refs.data?.actor) && (
          <Button
            component={Link}
            href={ROUTES.newSalesTeam}
            variant="contained"
            startIcon={<Plus size={16} />}
          >
            New team
          </Button>
        )}
      </div>
      {refs.isPending || query.isPending ? (
        <LoadingState label="Loading sales teams…" />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          onRetry={refresh}
          backHref={ROUTES.salesTeams}
          backLabel="Back to sales teams"
        />
      ) : (
        <>
          <div className={styles.panel}>
            <TeamFilters
              filters={filters}
              people={people}
              onChange={onChange}
              onReset={() => router.replace(ROUTES.salesTeams)}
            />
            {query.isFetching && <LinearProgress />}
            <TeamTable
              data={query.data.data}
              meta={query.data.meta}
              filters={filters}
              onChange={onChange}
              loading={query.isPlaceholderData}
            />
          </div>
          <p className={styles.muted}>
            Team membership controls scope. A manager title does not grant
            additional global permissions.
          </p>
        </>
      )}
    </AppShell>
  );
}
