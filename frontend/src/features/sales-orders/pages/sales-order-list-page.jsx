"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { Button, LinearProgress } from "@mui/material";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { ORDER_FILTERS } from "@/constants/sales-orders";
import { WRITER_ROLES } from "@/constants/quotations";
import { readOrderFilters, orderFilterSearch } from "@/utils/sales-order";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useSalesOrders } from "../hooks/use-sales-orders";
import { OrderFilters, OrderStats, OrderTable } from "../components/order-list";
import styles from "../sales-orders.module.css";
export default function SalesOrderListPage() {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  return <Workspace key={base} base={base} />;
}
function Workspace({ base }) {
  const router = useRouter(),
    search = useSearchParams(),
    filters = readOrderFilters(search);
  const refs = useQuotationOptions(base),
    list = useSalesOrders(base, filters);
  const counts = { ...ORDER_FILTERS, pageSize: 1 };
  const confirmed = useSalesOrders(base, { ...counts, status: "Confirmed" }),
    held = useSalesOrders(base, { ...counts, onHold: "true" }),
    delivered = useSalesOrders(base, { ...counts, status: "Delivered" });
  const onChange = (changes) => {
    const q = orderFilterSearch({ ...filters, ...changes });
    router.replace(ROUTES.salesOrders + (q ? "?" + q : ""), { scroll: false });
  };
  const reset = () => router.replace(ROUTES.salesOrders, { scroll: false });
  const refresh = () =>
    [refs, list, confirmed, held, delivered].forEach((q) => q.refetch());
  const canCreate = WRITER_ROLES.includes(refs.data?.actor.role);
  return (
    <AppShell
      actor={refs.data?.actor}
      onRefresh={refresh}
      refreshing={list.isFetching}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ORDER MANAGEMENT</p>
          <h1>Sales orders</h1>
          <p className={styles.subtitle}>
            From an agreed offer to every piece delivered.
          </p>
        </div>
        {canCreate && (
          <Button
            component={Link}
            href={ROUTES.newSalesOrder}
            variant="contained"
            startIcon={<Plus size={16} />}
          >
            New direct order
          </Button>
        )}
      </div>
      {refs.isPending || list.isPending ? (
        <LoadingState />
      ) : refs.error || list.error ? (
        <ErrorState
          error={refs.error || list.error}
          onRetry={refresh}
          backHref={ROUTES.salesOrders}
          backLabel="Back to sales orders"
        />
      ) : (
        <>
          <OrderStats
            confirmed={confirmed.data?.meta.total}
            held={held.data?.meta.total}
            delivered={delivered.data?.meta.total}
          />
          <div className={styles.panel}>
            <OrderFilters
              key={`${base}:${filters.q}`}
              filters={filters}
              options={refs.data}
              onChange={onChange}
              onReset={reset}
            />
            {list.isFetching && <LinearProgress />}
            <OrderTable
              data={list.data?.data}
              meta={list.data?.meta}
              filters={filters}
              onChange={onChange}
              canCreate={canCreate}
              onReset={reset}
              loading={list.isPlaceholderData}
            />
          </div>
          <p className={`${styles.hint} ${styles.space}`}>
            Counts reflect your workspace. Delivery completion is measured for
            each garment line.
          </p>
        </>
      )}
    </AppShell>
  );
}
