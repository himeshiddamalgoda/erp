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
import { canManageCustomers } from "@/constants/customers";
import { readCustomerFilters, customerFilterSearch } from "@/utils/customer";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useCustomers } from "../hooks/use-customers";
import { CustomerFilters, CustomerTable } from "../components/customer-list";
import styles from "../customers.module.css";
export default function CustomerListPage() {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={base} base={base} />;
}
function Workspace({ base }) {
  const search = useSearchParams(),
    router = useRouter(),
    filters = readCustomerFilters(search);
  const refs = useQuotationOptions(base),
    query = useCustomers(base, filters);
  const onChange = useCallback(
    (changes) => {
      const q = customerFilterSearch({
        ...readCustomerFilters(search),
        ...changes,
      });
      router.replace(ROUTES.customers + (q ? "?" + q : ""), { scroll: false });
    },
    [router, search],
  );
  const reset = () => router.replace(ROUTES.customers, { scroll: false });
  const refresh = () => {
    refs.refetch();
    query.refetch();
  };
  return (
    <AppShell
      actor={refs.data?.actor}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>BUYER RELATIONSHIPS</p>
          <h1>Customers</h1>
          <p className={styles.subtitle}>
            The people, places and defaults behind every order.
          </p>
        </div>
        {canManageCustomers(refs.data?.actor) && (
          <Button
            component={Link}
            href={ROUTES.newCustomer}
            variant="contained"
            startIcon={<Plus size={16} />}
          >
            New customer
          </Button>
        )}
      </div>
      {refs.isPending || query.isPending ? (
        <LoadingState label="Loading customers…" />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          onRetry={refresh}
          backHref={ROUTES.customers}
          backLabel="Back to customers"
        />
      ) : (
        <>
          <div className={styles.panel}>
            <CustomerFilters
              filters={filters}
              options={refs.data}
              onChange={onChange}
              onReset={reset}
            />
            {query.isFetching && <LinearProgress />}
            <CustomerTable
              data={query.data.data}
              meta={query.data.meta}
              filters={filters}
              onChange={onChange}
              loading={query.isPlaceholderData}
              onReset={reset}
              canCreate={canManageCustomers(refs.data.actor)}
            />
          </div>
          <p className={styles.muted}>
            Showing buyers within your workspace. Archived buyers remain
            available in commercial history.
          </p>
        </>
      )}
    </AppShell>
  );
}
