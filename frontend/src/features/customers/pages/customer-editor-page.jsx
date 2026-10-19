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
import { canManageCustomers } from "@/constants/customers";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { notify, setEditorDirty } from "@/store/ui-slice";
import {
  beginOrderAttempt,
  clearOrderAttempt,
  uncertainOrderOutcome,
} from "@/utils/order-attempt";
import { useCustomer, useCustomerMutations } from "../hooks/use-customers";
import {
  useCustomerAttempt,
  useCustomerHydrated,
  customerAttemptScope,
} from "../hooks/use-customer-attempt";
import { CustomerForm } from "../components/customer-form";
import styles from "../customers.module.css";
export default function CustomerEditorPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace),
    base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id || "new"}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const refs = useQuotationOptions(base),
    query = useCustomer(base, id, true),
    mutations = useCustomerMutations(base),
    router = useRouter(),
    dispatch = useDispatch(),
    dirty = useSelector((s) => s.ui.editorDirty),
    hydrated = useCustomerHydrated();
  const [formKey, setFormKey] = useState(0),
    [leave, setLeave] = useState(false),
    [error, setError] = useState(null);
  const scope = customerAttemptScope(base, refs.data?.actor.id),
    storedAttempt = useCustomerAttempt(scope);
  const attempt = id ? null : storedAttempt;
  const back = id ? ROUTES.customer(id) : ROUTES.customers;
  const canEdit = id
    ? query.data?.allowedActions.includes("edit")
    : canManageCustomers(refs.data?.actor);
  const finish = (c) => {
    dispatch(setEditorDirty(false));
    dispatch(
      notify({ message: id ? "Customer updated." : "Customer created." }),
    );
    router.push(ROUTES.customer(c.id));
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
      breadcrumb={id ? "Edit customer" : "New customer"}
    >
      <button className={styles.back} onClick={cancel}>
        <ArrowLeft size={14} />
        Back to {id ? "customer" : "customers"}
      </button>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>BUYER MASTER</p>
          <h1>
            {id ? `Edit ${query.data?.code || "customer"}` : "New customer"}
          </h1>
          <p className={styles.subtitle}>
            Keep business contacts, delivery locations and commercial defaults
            together.
          </p>
        </div>
      </div>
      {!hydrated || refs.isPending || (id && query.isPending) ? (
        <LoadingState />
      ) : refs.error || query.error ? (
        <ErrorState
          error={refs.error || query.error}
          title={query.error?.status === 404 ? "Customer not found" : undefined}
          onRetry={() => {
            refs.refetch();
            if (id) query.refetch();
          }}
          backHref={ROUTES.customers}
          backLabel="Back to customers"
        />
      ) : !canEdit ? (
        <Alert severity="info">
          Your current workspace does not have permission to edit customer
          master data.<Button onClick={() => router.push(back)}>Return</Button>
        </Alert>
      ) : (
        <>
          <ApiErrorAlert error={error} resource="customer" />
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
          <CustomerForm
            key={formKey}
            customer={query.data}
            options={refs.data}
            initialValues={!id ? attempt?.body : undefined}
            blocked={!id && !!attempt}
            onSave={save}
            onCancel={cancel}
            onReload={async () => {
              const response = await query.refetch();
              if (response.data) {
                dispatch(setEditorDirty(false));
                setFormKey((k) => k + 1);
              }
            }}
          />
        </>
      )}
      <Dialog open={leave} onClose={() => setLeave(false)}>
        <DialogTitle>Leave this customer form?</DialogTitle>
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
