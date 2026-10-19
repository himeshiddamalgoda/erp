"use client";
import { useState } from "react";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { Button, Tabs, Tab, LinearProgress, Alert } from "@mui/material";
import { ArrowLeft, FilePlus2, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  LoadingState,
  ErrorState,
  ApiErrorAlert,
} from "@/components/ui/page-state";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { WRITER_ROLES } from "@/constants/quotations";
import { notify } from "@/store/ui-slice";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useQuotations } from "@/features/quotations/hooks/use-quotations";
import { useSalesOrders } from "@/features/sales-orders/hooks/use-sales-orders";
import { useCustomer, useCustomerMutations } from "../hooks/use-customers";
import { CustomerProfile } from "../components/customer-profile";
import {
  CustomerStatus,
  CustomerDocuments,
  CustomerPagination,
} from "../components/customer-shared";
import { CustomerActionDialog } from "../components/customer-action-dialog";
import styles from "../customers.module.css";
export default function CustomerDetailPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const [inactive, setInactive] = useState(false),
    [tab, setTab] = useState(0),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [action, setAction] = useState(null);
  const refs = useQuotationOptions(base),
    query = useCustomer(base, id, inactive),
    mutations = useCustomerMutations(base),
    dispatch = useDispatch();
  const filters = {
    customerId: id,
    page,
    pageSize,
    sortBy: "createdAt",
    sortOrder: "desc",
  };
  const quotations = useQuotations(
      base,
      { ...filters, includeRevisions: "true" },
      { enabled: tab === 1 && !!query.data },
    ),
    orders = useSalesOrders(base, filters, {
      enabled: tab === 2 && !!query.data,
    });
  const c = query.data,
    history = tab === 1 ? quotations : orders;
  const refresh = () => {
    refs.refetch();
    query.refetch();
    if (tab) history.refetch();
  };
  return (
    <AppShell
      actor={refs.data?.actor}
      breadcrumb={c?.code || "Customer profile"}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <Link className={styles.back} href={ROUTES.customers}>
        <ArrowLeft size={14} />
        Back to customers
      </Link>
      {refs.isPending || query.isPending ? (
        <LoadingState />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          title={query.error?.status === 404 ? "Customer not found" : undefined}
          onRetry={refresh}
          backHref={ROUTES.customers}
          backLabel="Back to customers"
        />
      ) : (
        <>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>
                {c.code} · VERSION {c.version}
              </p>
              <div className={styles.row}>
                <h1>{c.displayName || c.name}</h1>
                <CustomerStatus status={c.status} />
              </div>
              <p className={styles.subtitle}>
                {c.name} · {c.country} · {c.salesTeam.name}
              </p>
            </div>
            <div className={styles.row}>
              {c.status === "Active" &&
                WRITER_ROLES.includes(refs.data.actor.role) && (
                  <Button
                    component={Link}
                    href={`${ROUTES.newQuotation}?customerId=${c.id}`}
                    startIcon={<FilePlus2 size={16} />}
                  >
                    Create quotation
                  </Button>
                )}
              {c.allowedActions.includes("edit") && (
                <Button
                  component={Link}
                  href={ROUTES.editCustomer(id)}
                  variant="outlined"
                  startIcon={<Pencil size={15} />}
                >
                  Edit customer
                </Button>
              )}
              {c.allowedActions.includes("archive") && (
                <Button
                  color="error"
                  onClick={() =>
                    setAction({ name: "archive", version: c.version })
                  }
                >
                  Archive customer
                </Button>
              )}
              {c.allowedActions.includes("reactivate") && (
                <Button
                  variant="contained"
                  onClick={() =>
                    setAction({ name: "reactivate", version: c.version })
                  }
                >
                  Reactivate customer
                </Button>
              )}
            </div>
          </div>
          {query.isFetching && <LinearProgress />}
          {c.status === "Archived" && (
            <Alert severity="info" className={styles.notice}>
              This customer is archived. Historical documents and confirmed
              order fulfilment remain available.
            </Alert>
          )}
          <Tabs
            className={styles.tabs}
            value={tab}
            onChange={(_, value) => {
              setTab(value);
              setPage(1);
            }}
            aria-label="Customer sections"
          >
            <Tab
              label="Profile"
              id="customer-tab-0"
              aria-controls="customer-panel-0"
            />
            <Tab
              label="Quotations"
              id="customer-tab-1"
              aria-controls="customer-panel-1"
            />
            <Tab
              label="Sales orders"
              id="customer-tab-2"
              aria-controls="customer-panel-2"
            />
          </Tabs>
          <div
            role="tabpanel"
            id={`customer-panel-${tab}`}
            aria-labelledby={`customer-tab-${tab}`}
          >
            {tab === 0 ? (
              <CustomerProfile
                customer={c}
                includeInactive={inactive}
                onIncludeInactive={setInactive}
              />
            ) : (
              <div className={styles.panel}>
                {history.isPending ? (
                  <LoadingState label="Loading commercial history…" />
                ) : history.error ? (
                  <div className={styles.section}>
                    <ApiErrorAlert error={history.error} />
                    <Button onClick={() => history.refetch()}>
                      Retry history
                    </Button>
                  </div>
                ) : (
                  <>
                    {history.isFetching && <LinearProgress />}
                    <CustomerDocuments
                      data={history.data?.data || []}
                      kind={tab === 1 ? "quotations" : "orders"}
                    />
                    <CustomerPagination
                      meta={history.data?.meta}
                      filters={{ page, pageSize }}
                      onChange={(changes) => {
                        if (changes.pageSize) setPageSize(changes.pageSize);
                        setPage(changes.page || 1);
                      }}
                      disabled={history.isPlaceholderData}
                    />
                  </>
                )}
              </div>
            )}
          </div>
          {action && (
            <CustomerActionDialog
              action={action.name}
              customer={{ ...c, version: action.version }}
              onClose={() => setAction(null)}
              onReload={async () => {
                const result = await query.refetch();
                if (result.data)
                  setAction((a) => ({ ...a, version: result.data.version }));
                else throw result.error;
              }}
              onSubmit={async (body) => {
                const result = await mutations.lifecycle.mutateAsync({
                  id,
                  action: action.name,
                  body,
                });
                dispatch(
                  notify({
                    message:
                      result.status === "Archived"
                        ? "Customer archived."
                        : "Customer reactivated.",
                  }),
                );
                setAction(null);
                await query.refetch();
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
