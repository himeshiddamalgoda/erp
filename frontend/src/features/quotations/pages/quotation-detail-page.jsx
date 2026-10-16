"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { Button, IconButton, Menu, MenuItem, Tab, Tabs } from "@mui/material";
import {
  ArrowLeft,
  Download,
  FilePenLine,
  GitBranch,
  LockKeyhole,
  MoreHorizontal,
  Send,
  ShieldCheck,
} from "lucide-react";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { ACTION_LABELS } from "@/constants/quotations";
import { actionBody } from "@/utils/quotation-form";
import { formatDate } from "@/utils/format";
import { downloadPdf } from "@/utils/download";
import { getConversionAttempt } from "@/utils/conversion-attempt";
import { notify } from "@/store/ui-slice";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useQuotation, useQuotationMutations } from "../hooks/use-quotations";
import { QuotationOverview } from "../components/quotation-overview";
import {
  QuotationRevisions,
  QuotationActivity,
  QuotationSidebar,
} from "../components/quotation-history";
import { QuotationActionDialog } from "../components/quotation-action-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApiErrorAlert,
  ErrorState,
  LoadingState,
} from "@/components/ui/page-state";
import styles from "../quotations.module.css";
export default function QuotationDetailPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  return <DetailWorkspace key={`${base}:${id}`} base={base} id={id} />;
}
function DetailWorkspace({ base, id }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const options = useQuotationOptions(base);
  const query = useQuotation(base, id);
  const mutations = useQuotationMutations(base);
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [menu, setMenu] = useState(null);
  const q = query.data;
  const allowed = q?.allowedActions || [];
  const primary = [
    "submit",
    "approve",
    "issue",
    "buyer-response",
    "convert",
  ].find(
    (action) =>
      allowed.includes(action) && !(action === "convert" && q?.linkedOrder),
  );
  const extras = ["revisions", "reject", "withdraw", "void", "delete"].filter(
    (action) => allowed.includes(action),
  );
  const openAction = (action) => {
    setMenu(null);
    setActionError(null);
    setDialog({ action, quotation: q });
  };
  const onConfirm = async (values) => {
    const { action, quotation } = dialog;
    if (action === "delete") {
      await mutations.remove.mutateAsync({
        id: quotation.id,
        version: quotation.version,
      });
      dispatch(notify({ message: "Draft quotation deleted." }));
      router.push(ROUTES.quotations);
      return;
    }
    let body = actionBody(action, values, quotation.version);
    let idempotencyKey;
    if (action === "convert") {
      const attempt = getConversionAttempt(
        `${base}:${options.data?.actor.id}`,
        quotation,
      );
      body = { version: attempt.version };
      idempotencyKey = attempt.idempotencyKey;
    }
    const result = await mutations.action.mutateAsync({
      id: quotation.id,
      action,
      body,
      idempotencyKey,
    });
    setDialog(null);
    dispatch(
      notify({
        message:
          action === "convert"
            ? `Draft sales order ${result.orderNumber} is linked to this quotation.`
            : action === "revisions"
              ? "Replacement draft created. The original offer keeps its current status."
              : `${ACTION_LABELS[action]} completed.`,
      }),
    );
    if (action === "revisions") router.push(ROUTES.editQuotation(result.id));
  };
  const pdf = async () => {
    setPageError(null);
    try {
      const response = await mutations.pdf.mutateAsync(id);
      await downloadPdf(response, `${q.quoteNumber}-R${q.revision}.pdf`);
      dispatch(notify({ message: "Quotation PDF downloaded." }));
    } catch (error) {
      setPageError(error);
    }
  };
  const refresh = () => {
    query.refetch();
    options.refetch();
  };
  return (
    <AppShell
      actor={options.data?.actor}
      breadcrumb={q?.quoteNumber || "Quotation detail"}
      onRefresh={refresh}
      refreshing={query.isFetching}
    >
      <Link href={ROUTES.quotations} className={styles.backLink}>
        <ArrowLeft size={13} />
        Back to quotations
      </Link>
      {query.isPending || options.isPending ? (
        <LoadingState />
      ) : query.error || options.error ? (
        <ErrorState error={query.error || options.error} onRetry={refresh} />
      ) : (
        <>
          <div className={`${styles.pageHeading} ${styles.detailHeading}`}>
            <div>
              <p className={styles.eyebrow}>QUOTATION DETAIL</p>
              <h1>
                {q.quoteNumber}
                <span className={styles.revisionPill}>
                  REVISION {q.revision}
                </span>
                <StatusBadge status={q.status} />
              </h1>
              <div className={styles.detailSubtitle}>
                <span>{q.customerName}</span>
                <span>·</span>
                <span>Created {formatDate(q.createdAt)}</span>
                <span>·</span>
                <span>Version {q.version}</span>
              </div>
            </div>
            <div className={styles.headingActions}>
              <Button
                variant="outlined"
                startIcon={<Download size={14} />}
                onClick={pdf}
                disabled={mutations.pdf.isPending}
              >
                {mutations.pdf.isPending ? "Downloading…" : "Download PDF"}
              </Button>
              {allowed.includes("edit") && (
                <Button
                  component={Link}
                  href={ROUTES.editQuotation(id)}
                  variant={primary ? "outlined" : "contained"}
                  startIcon={<FilePenLine size={14} />}
                >
                  Edit draft
                </Button>
              )}
              {primary && (
                <Button
                  variant="contained"
                  onClick={() => openAction(primary)}
                  startIcon={
                    primary === "convert" ? (
                      <GitBranch size={14} />
                    ) : primary === "approve" ? (
                      <ShieldCheck size={14} />
                    ) : (
                      <Send size={14} />
                    )
                  }
                >
                  {ACTION_LABELS[primary]}
                </Button>
              )}
              {extras.length > 0 && (
                <>
                  <IconButton
                    aria-label="More quotation actions"
                    aria-haspopup="menu"
                    onClick={(event) => setMenu(event.currentTarget)}
                  >
                    <MoreHorizontal size={21} />
                  </IconButton>
                  <Menu
                    anchorEl={menu}
                    open={Boolean(menu)}
                    onClose={() => setMenu(null)}
                  >
                    {extras.map((action) => (
                      <MenuItem key={action} onClick={() => openAction(action)}>
                        {ACTION_LABELS[action]}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
            </div>
          </div>
          <ApiErrorAlert error={pageError} />
          {q.familyLocked && q.status === "Draft" && (
            <div className={`${styles.callout} ${styles.calloutMuted}`}>
              <LockKeyhole size={18} />
              <p>
                <strong>This replacement revision is locked.</strong>Another
                revision in this quotation family has been accepted. You can
                review this work and download its PDF.
              </p>
            </div>
          )}
          {q.status === "PendingApproval" && (
            <div className={styles.callout}>
              <ShieldCheck size={17} />
              <p>
                <strong>Ready for a second pair of eyes.</strong>
                {allowed.includes("approve")
                  ? "Review the frozen commercial details, then approve or send it back with a reason."
                  : "A different Sales Manager or Admin must approve this submission. Commercial details are frozen during review."}
              </p>
            </div>
          )}
          {q.status === "Issued" && (
            <div className={styles.callout}>
              <Send size={17} />
              <p>
                <strong>
                  {q.validUntil &&
                  q.validUntil < options.data.company.businessDate
                    ? "The offer validity has ended."
                    : "This offer is with the buyer."}
                </strong>
                {q.validUntil &&
                q.validUntil < options.data.company.businessDate
                  ? "Prepare a new revision to offer updated terms. Buyer responses can no longer be recorded on this offer."
                  : "Record their acceptance or decline while the offer is valid. A replacement draft does not withdraw this issued offer."}
              </p>
            </div>
          )}
          {q.status === "Converted" && q.linkedOrder && (
            <div className={styles.callout}>
              <GitBranch size={17} />
              <p>
                <strong>
                  Sales order {q.linkedOrder.orderNumber} is linked.
                </strong>
                {q.linkedOrder.archived
                  ? "The linked order is archived. It cannot be recreated by conversion."
                  : "The accepted offer has been copied into a Draft sales order. Its commercial history is preserved."}
              </p>
            </div>
          )}
          {["Expired", "Superseded", "Cancelled", "Declined"].includes(
            q.status,
          ) && (
            <div className={`${styles.callout} ${styles.calloutWarning}`}>
              <InfoIcon />
              <p>
                <strong>
                  {q.status === "Superseded"
                    ? "A newer revision replaced this offer."
                    : q.status === "Expired"
                      ? "This offer has expired."
                      : q.status === "Cancelled"
                        ? "This offer was cancelled."
                        : "The buyer declined this offer."}
                </strong>
                This revision remains available for reference.{" "}
                {allowed.includes("revisions")
                  ? "Create a revision to prepare another offer."
                  : "Review the revision history for related work."}
              </p>
            </div>
          )}
          <div className={styles.detailLayout}>
            <div className={`${styles.panel} ${styles.detailMain}`}>
              <Tabs
                value={tab}
                onChange={(_, value) => setTab(value)}
                className={styles.detailTabs}
                aria-label="Quotation detail sections"
              >
                <Tab value="overview" label="Overview" />
                <Tab
                  value="revisions"
                  label={`Revisions (${q.revisions.length})`}
                />
                <Tab value="activity" label={`Activity (${q.audit.length})`} />
              </Tabs>
              {tab === "overview" ? (
                <QuotationOverview quotation={q} options={options.data} />
              ) : tab === "revisions" ? (
                <QuotationRevisions quotation={q} />
              ) : (
                <QuotationActivity quotation={q} />
              )}
            </div>
            <QuotationSidebar quotation={q} />
          </div>
          {dialog && (
            <QuotationActionDialog
              key={`${dialog.action}:${dialog.quotation.version}`}
              context={{
                ...dialog,
                error: actionError,
                setError: setActionError,
              }}
              onClose={() => setDialog(null)}
              onConfirm={onConfirm}
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
function InfoIcon() {
  return <LockKeyhole size={17} />;
}
