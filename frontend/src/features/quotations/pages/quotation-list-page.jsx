"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { Button, LinearProgress } from "@mui/material";
import { Plus, ShieldCheck } from "lucide-react";
import { getApiBaseUrl } from "@/constants/api";
import { DEFAULT_FILTERS, WRITER_ROLES } from "@/constants/quotations";
import { ROUTES } from "@/constants/routes";
import { readListFilters, filtersToSearch } from "@/utils/list-filters";
import { useQuotations } from "../hooks/use-quotations";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, ErrorState } from "@/components/ui/page-state";
import { QuotationStats } from "../components/quotation-stats";
import { QuotationFilters } from "../components/quotation-filters";
import { QuotationTable } from "../components/quotation-table";
import styles from "../quotations.module.css";
export default function QuotationListPage() {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  return <ListWorkspace key={base} base={base} />;
}
function ListWorkspace({ base }) {
  const search = useSearchParams();
  const router = useRouter();
  const filters = readListFilters(search);
  const options = useQuotationOptions(base);
  const list = useQuotations(base, filters);
  const counts = { ...DEFAULT_FILTERS, pageSize: 1 };
  const drafts = useQuotations(base, { ...counts, status: "Draft" });
  const pending = useQuotations(base, { ...counts, status: "PendingApproval" });
  const issued = useQuotations(base, { ...counts, status: "Issued" });
  const onChange = (changes) => {
    const query = filtersToSearch({ ...filters, ...changes });
    router.replace(`${ROUTES.quotations}${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  };
  const canCreate = WRITER_ROLES.includes(options.data?.actor.role);
  const refresh = () => {
    options.refetch();
    list.refetch();
    drafts.refetch();
    pending.refetch();
    issued.refetch();
  };
  return (
    <AppShell
      actor={options.data?.actor}
      onRefresh={refresh}
      refreshing={list.isFetching}
    >
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>ORDER MANAGEMENT</p>
          <h1>Quotations</h1>
          <p>Shape the right offer. Keep every detail connected.</p>
        </div>
        {canCreate && (
          <Button
            component={Link}
            href={ROUTES.newQuotation}
            variant="contained"
            startIcon={<Plus size={17} />}
          >
            New quotation
          </Button>
        )}
      </div>
      {options.isPending || list.isPending ? (
        <LoadingState />
      ) : options.error || list.error ? (
        <ErrorState error={options.error || list.error} onRetry={refresh} />
      ) : (
        <>
          <QuotationStats
            drafts={drafts.data?.meta.total}
            pending={pending.data?.meta.total}
            issued={issued.data?.meta.total}
          />
          <div className={styles.panel}>
            <QuotationFilters
              key={`${base}:${filters.q}`}
              filters={filters}
              options={options.data}
              onChange={onChange}
              onReset={() =>
                router.replace(ROUTES.quotations, { scroll: false })
              }
              total={list.data?.meta.total}
            />
            <div className={styles.loadingLine}>
              {list.isFetching && <LinearProgress />}
            </div>
            <QuotationTable
              data={list.data?.data}
              meta={list.data?.meta}
              filters={filters}
              onPage={(page) => onChange({ page })}
              onPageSize={(pageSize) => onChange({ pageSize, page: 1 })}
              canCreate={canCreate}
              onReset={() =>
                router.replace(ROUTES.quotations, { scroll: false })
              }
              isPlaceholderData={list.isPlaceholderData}
            />
          </div>
          <div className={styles.workspaceHint}>
            <ShieldCheck size={12} />
            Showing the latest visible revision of each quotation family. Counts
            reflect your workspace.
          </div>
        </>
      )}
    </AppShell>
  );
}
