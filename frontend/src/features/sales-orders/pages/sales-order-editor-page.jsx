"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
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
import { WRITER_ROLES } from "@/constants/quotations";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { notify, setEditorDirty } from "@/store/ui-slice";
import {
  attemptScope,
  beginOrderAttempt,
  clearOrderAttempt,
  uncertainOrderOutcome,
} from "@/utils/order-attempt";
import { orderFormValues } from "@/utils/sales-order";
import {
  useSalesOrder,
  useSalesOrderMutations,
} from "../hooks/use-sales-orders";
import { useHydrated, useOrderAttempt } from "../hooks/use-order-attempt";
import { OrderForm } from "../components/order-form";
import { OrderRecovery } from "../components/order-recovery";
import styles from "../sales-orders.module.css";
export default function SalesOrderEditorPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id || "new"}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const refs = useQuotationOptions(base),
    query = useSalesOrder(base, id),
    mutations = useSalesOrderMutations(base),
    router = useRouter(),
    dispatch = useDispatch(),
    dirty = useSelector((s) => s.ui.editorDirty);
  const [formKey, setFormKey] = useState(0),
    [leave, setLeave] = useState(false),
    [error, setError] = useState(null);
  const hydrated = useHydrated(),
    scope = attemptScope(base, refs.data?.actor.id, id),
    attempt = useOrderAttempt(scope, "create");
  const order = query.data;
  const back = id ? ROUTES.salesOrder(id) : ROUTES.salesOrders;
  const finish = (data) => {
    dispatch(setEditorDirty(false));
    dispatch(
      notify({
        message: id ? "Order draft updated." : "Sales order draft created.",
      }),
    );
    router.push(ROUTES.salesOrder(data.id));
  };
  const executeCreate = async (tracked) => {
    try {
      const data = await mutations.create.mutateAsync(tracked);
      clearOrderAttempt(scope, "create");
      finish(data);
    } catch (e) {
      if (!uncertainOrderOutcome(e)) clearOrderAttempt(scope, "create");
      throw e;
    }
  };
  const save = async (body) => {
    setError(null);
    if (id)
      finish(
        await mutations.update.mutateAsync({
          id,
          body: { ...body, version: order.version },
        }),
      );
    else await executeCreate(beginOrderAttempt(scope, "create", body));
  };
  const cancel = () => (dirty ? setLeave(true) : router.push(back));
  const canEdit = id
    ? order?.allowedActions.includes("edit")
    : WRITER_ROLES.includes(refs.data?.actor.role);
  return (
    <AppShell
      actor={refs.data?.actor}
      breadcrumb={id ? "Edit draft" : "New order"}
    >
      <button className={styles.back} onClick={cancel}>
        <ArrowLeft size={13} />
        Back to {id ? "order" : "sales orders"}
      </button>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ORDER WORKSPACE</p>
          <h1>{order ? `Edit ${order.orderNumber}` : "New direct order"}</h1>
          <p className={styles.subtitle}>
            Bring buyer PO, garment quantities and delivery requirements
            together.
          </p>
        </div>
      </div>
      {!hydrated || refs.isPending || (id && query.isPending) ? (
        <LoadingState />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          title={
            query.error?.status === 404 ? "Sales order not found" : undefined
          }
          backHref={ROUTES.salesOrders}
          backLabel="Back to sales orders"
          onRetry={() => {
            refs.refetch();
            if (id) query.refetch();
          }}
        />
      ) : !canEdit ? (
        <Alert severity="info">
          {id
            ? "This order is no longer editable."
            : "Your role cannot create sales orders."}
          <Button onClick={() => router.push(back)}>Return</Button>
        </Alert>
      ) : (
        <>
          <ApiErrorAlert error={error} resource="sales order" />
          <OrderRecovery
            attempt={attempt}
            pending={mutations.create.isPending}
            onRetry={async () => {
              try {
                setError(null);
                await executeCreate(attempt);
              } catch (e) {
                setError(e);
              }
            }}
          />
          <OrderForm
            key={formKey}
            order={order}
            initialValues={
              !id && attempt
                ? orderFormValues(attempt.body, refs.data.company.businessDate)
                : undefined
            }
            options={refs.data}
            blocked={!!attempt}
            onSave={save}
            onCancel={cancel}
            onReload={async () => {
              const r = await query.refetch();
              if (r.data) {
                dispatch(setEditorDirty(false));
                setFormKey((k) => k + 1);
              }
            }}
          />
        </>
      )}
      <Dialog open={leave} onClose={() => setLeave(false)}>
        <DialogTitle>Leave this draft?</DialogTitle>
        <DialogContent>Your unsaved changes will be lost.</DialogContent>
        <DialogActions>
          <Button onClick={() => setLeave(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={() => {
              dispatch(setEditorDirty(false));
              router.push(back);
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
