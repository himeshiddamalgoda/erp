"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import {
  Alert,
  Button,
  Tab,
  Tabs,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  ArrowLeft,
  Download,
  FilePenLine,
  MoreHorizontal,
  CheckCircle2,
  PauseCircle,
  Package,
} from "lucide-react";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { ORDER_ACTIONS, ORDER_ACTION_SUCCESS } from "@/constants/sales-orders";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  LoadingState,
  ErrorState,
  ApiErrorAlert,
} from "@/components/ui/page-state";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { notify } from "@/store/ui-slice";
import { downloadPdf } from "@/utils/download";
import { formatMoney, formatDate, formatQuantity } from "@/utils/format";
import { orderActionBody } from "@/utils/sales-order";
import {
  attemptScope,
  beginOrderAttempt,
  clearOrderAttempt,
  uncertainOrderOutcome,
} from "@/utils/order-attempt";
import {
  useSalesOrder,
  useSalesOrderMutations,
  useOrderHistory,
  useOrderFulfilment,
} from "../hooks/use-sales-orders";
import { useOrderAttempt } from "../hooks/use-order-attempt";
import { OrderOverview } from "../components/order-overview";
import { OrderActionDialog } from "../components/order-action-dialog";
import {
  OrderRevisions,
  OrderActivity,
  OrderDelivery,
  OrderHandoff,
} from "../components/order-history";
import { OrderRecovery } from "../components/order-recovery";
import styles from "../sales-orders.module.css";
export default function SalesOrderDetailPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  return <Workspace key={`${base}:${id}`} base={base} id={id} />;
}
function Workspace({ base, id }) {
  const refs = useQuotationOptions(base),
    query = useSalesOrder(base, id),
    mutations = useSalesOrderMutations(base);
  const dispatch = useDispatch(),
    router = useRouter();
  const [tab, setTab] = useState("overview"),
    [revisionParams, setRevisionParams] = useState({ page: 1, pageSize: 20 }),
    [activityParams, setActivityParams] = useState({
      page: 1,
      pageSize: 20,
      action: "",
    }),
    [dialog, setDialog] = useState(null),
    [menu, setMenu] = useState(null),
    [actionError, setActionError] = useState(null),
    [error, setError] = useState(null);
  const revisions = useOrderHistory(
      base,
      id,
      "revisions",
      revisionParams,
      tab === "revisions",
    ),
    activity = useOrderHistory(
      base,
      id,
      "activity",
      activityParams,
      tab === "activity",
    ),
    delivery = useOrderFulfilment(base, id, tab === "delivery");
  const scope = attemptScope(base, refs.data?.actor.id, id),
    confirmAttempt = useOrderAttempt(scope, "confirm"),
    revisionAttempt = useOrderAttempt(scope, "revisions"),
    attempt = confirmAttempt || revisionAttempt;
  const order = query.data,
    allowed = order?.allowedActions || [];
  const refresh = () => {
    query.refetch();
    refs.refetch();
    if (tab === "revisions") revisions.refetch();
    if (tab === "activity") activity.refetch();
    if (tab === "delivery") delivery.refetch();
  };
  const openAction = (action) => {
    setMenu(null);
    setActionError(null);
    setDialog({ action, order });
  };
  const execute = async (action, body, tracked) => {
    try {
      await mutations.action.mutateAsync({
        id,
        action,
        body: tracked ? tracked.body : body,
        idempotencyKey: tracked?.idempotencyKey,
      });
      if (tracked) clearOrderAttempt(scope, action);
      setDialog(null);
      dispatch(notify({ message: ORDER_ACTION_SUCCESS[action] }));
    } catch (e) {
      if (tracked && !uncertainOrderOutcome(e))
        clearOrderAttempt(scope, action);
      throw e;
    }
  };
  const onConfirm = async (values) => {
    const { action, order: captured } = dialog;
    if (action === "delete") {
      await mutations.remove.mutateAsync({ id, version: captured.version });
      dispatch(notify({ message: "Draft order deleted." }));
      router.push(ROUTES.salesOrders);
      return;
    }
    const body = orderActionBody(action, values, captured);
    await execute(
      action,
      body,
      ["confirm", "revisions"].includes(action)
        ? beginOrderAttempt(scope, action, body)
        : null,
    );
  };
  const pdf = async (revision) => {
    setError(null);
    try {
      const response = await mutations.pdf.mutateAsync({ id, revision });
      await downloadPdf(
        response,
        `${order.orderNumber}-R${revision || order.documentRevision}.pdf`,
      );
    } catch (e) {
      setError(e);
    }
  };
  const primary = ["confirm", "resume", "hold", "close"].find((a) =>
    allowed.includes(a),
  );
  const extras = ["revisions", "cancel", "delete"].filter((a) =>
    allowed.includes(a),
  );
  const history =
    tab === "revisions" ? revisions : tab === "activity" ? activity : delivery;
  return (
    <AppShell
      actor={refs.data?.actor}
      breadcrumb={order?.orderNumber || "Order detail"}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <Link className={styles.back} href={ROUTES.salesOrders}>
        <ArrowLeft size={13} />
        Back to sales orders
      </Link>
      {query.isPending || refs.isPending ? (
        <LoadingState />
      ) : query.error || refs.error ? (
        <ErrorState
          error={query.error || refs.error}
          title={
            query.error?.status === 404 ? "Sales order not found" : undefined
          }
          onRetry={refresh}
          backHref={ROUTES.salesOrders}
          backLabel="Back to sales orders"
        />
      ) : (
        <>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>SALES ORDER DETAIL</p>
              <h1>
                {order.orderNumber}
                <StatusBadge status={order.status} />
                {order.isOnHold && (
                  <span className={styles.hold}>
                    <PauseCircle size={12} />
                    On hold
                  </span>
                )}
              </h1>
              <p className={styles.subtitle}>
                {order.customerName} · PO {order.buyerPoNumber || "not set"} ·
                Document R{order.documentRevision} · Record version{" "}
                {order.version}
              </p>
            </div>
            <div className={styles.buttons}>
              {allowed.includes("downloadPdf") && (
                <Button
                  variant="outlined"
                  onClick={() => pdf()}
                  startIcon={<Download size={14} />}
                  disabled={mutations.pdf.isPending}
                >
                  Download PDF
                </Button>
              )}
              {allowed.includes("edit") && (
                <Button
                  component={Link}
                  href={ROUTES.editSalesOrder(id)}
                  variant="outlined"
                  startIcon={<FilePenLine size={14} />}
                  disabled={!!attempt}
                >
                  Edit draft
                </Button>
              )}
              {primary && (
                <Button
                  variant="contained"
                  onClick={() => openAction(primary)}
                  disabled={!!attempt}
                  startIcon={<CheckCircle2 size={15} />}
                >
                  {ORDER_ACTIONS[primary]}
                </Button>
              )}
              {extras.length > 0 && (
                <>
                  <IconButton
                    aria-label="More order actions"
                    aria-haspopup="menu"
                    disabled={!!attempt}
                    onClick={(e) => setMenu(e.currentTarget)}
                  >
                    <MoreHorizontal size={21} />
                  </IconButton>
                  <Menu
                    anchorEl={menu}
                    open={!!menu}
                    onClose={() => setMenu(null)}
                  >
                    {extras.map((a) => (
                      <MenuItem key={a} onClick={() => openAction(a)}>
                        {ORDER_ACTIONS[a]}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
            </div>
          </div>
          <ApiErrorAlert error={error} resource="sales order" />
          {attempt && !dialog && (
            <OrderRecovery
              attempt={attempt}
              pending={mutations.action.isPending}
              onRetry={async () => {
                setError(null);
                try {
                  await execute(attempt.operation, attempt.body, attempt);
                } catch (e) {
                  setError(e);
                }
              }}
            />
          )}
          {order.isOnHold && (
            <Alert severity="warning" className={styles.alert}>
              Local handoff on hold: {order.holdReason}. Confirmed commercial
              content remains frozen.
            </Alert>
          )}
          {order.status === "Draft" && (
            <Alert severity="info" className={styles.alert}>
              {order.sourceQuotationId
                ? "Accepted quotation terms are preserved. Complete PO and delivery details before manager confirmation."
                : "Complete the Draft, then have a manager review and confirm the order."}
            </Alert>
          )}
          {order.status === "Cancelled" && (
            <Alert severity="warning" className={styles.alert}>
              This order was cancelled. {order.cancellationReason} Historical
              documents and source links remain available.
            </Alert>
          )}
          {order.status === "Closed" && (
            <Alert severity="success" className={styles.alert}>
              Operational delivery is complete and this order is closed.
            </Alert>
          )}
          <div className={styles.detail}>
            <div className={styles.panel}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                className={styles.tabs}
                variant="scrollable"
                aria-label="Sales order sections"
              >
                {[
                  ["overview", "Overview"],
                  ["delivery", "Delivery"],
                  ["revisions", "Revisions"],
                  ["activity", "Activity"],
                ].map(([v, l]) => (
                  <Tab key={v} value={v} label={l} />
                ))}
              </Tabs>
              {tab === "overview" ? (
                <OrderOverview order={order} options={refs.data} />
              ) : history.isPending ? (
                <LoadingState />
              ) : history.error ? (
                <ErrorState
                  error={history.error}
                  onRetry={() => history.refetch()}
                  backHref={ROUTES.salesOrders}
                  backLabel="Back to sales orders"
                />
              ) : tab === "revisions" ? (
                <OrderRevisions
                  data={revisions.data.data}
                  meta={revisions.data.meta}
                  params={revisionParams}
                  onChange={(v) => setRevisionParams((p) => ({ ...p, ...v }))}
                  onPdf={pdf}
                  downloading={mutations.pdf.isPending}
                />
              ) : tab === "activity" ? (
                <OrderActivity
                  data={activity.data.data}
                  meta={activity.data.meta}
                  params={activityParams}
                  onChange={(v) => setActivityParams((p) => ({ ...p, ...v }))}
                />
              ) : (
                <OrderDelivery data={delivery.data} />
              )}
            </div>
            <aside className={styles.aside}>
              <OrderHandoff order={order} />
              <div className={styles.card}>
                <h2>
                  <Package size={15} />
                  ORDER SUMMARY
                </h2>
                <div className={styles.sideFact}>
                  <span>Garment variants</span>
                  <strong>{order.lines.length}</strong>
                </div>
                <div className={styles.sideFact}>
                  <span>Quantity</span>
                  <strong>{formatQuantity(order.totalQty)} PCS</strong>
                </div>
                <div className={styles.sideFact}>
                  <span>Total value</span>
                  <strong>{formatMoney(order.total, order.currency)}</strong>
                </div>
                <hr className={styles.divider} />
                <div className={styles.sideFact}>
                  <span>Delivered</span>
                  <strong>
                    {formatQuantity(order.fulfilment.deliveredQty)} PCS
                  </strong>
                </div>
                <div className={styles.sideFact}>
                  <span>Remaining</span>
                  <strong>
                    {formatQuantity(order.fulfilment.remainingQty)} PCS
                  </strong>
                </div>
                <div className={styles.sideFact}>
                  <span>Delivery date</span>
                  <strong>{formatDate(order.requestedDeliveryDate)}</strong>
                </div>
                {order.sourceQuotationId && (
                  <>
                    <hr className={styles.divider} />
                    <span className={styles.factLabel}>SOURCE QUOTATION</span>
                    <div className={styles.space}>
                      <Link
                        className={styles.sideLink}
                        href={ROUTES.quotation(order.sourceQuotationId)}
                      >
                        {order.sourceQuoteNumber} · R{order.sourceRevisionNo}
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
          {dialog && (
            <OrderActionDialog
              key={`${dialog.action}:${dialog.order.version}`}
              context={{
                ...dialog,
                error: actionError,
                setError: setActionError,
              }}
              options={refs.data}
              onConfirm={onConfirm}
              onClose={() => setDialog(null)}
              tracked={
                !!(dialog.action === "confirm"
                  ? confirmAttempt
                  : dialog.action === "revisions"
                    ? revisionAttempt
                    : null)
              }
              onRefresh={async () => {
                await query.refetch();
                setDialog(null);
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
