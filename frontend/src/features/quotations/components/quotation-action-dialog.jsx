"use client";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Radio,
  RadioGroup,
  FormControlLabel,
} from "@mui/material";
import {
  CheckCircle2,
  Info,
  LockKeyhole,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { makeActionSchema } from "../schemas/quotation.schema";
import { FormField } from "./form-field";
import { ACTION_LABELS } from "@/constants/quotations";
import { formatMoney, formatQuantity } from "@/utils/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiErrorAlert } from "@/components/ui/page-state";
import { applyServerErrors } from "@/utils/api-error";
import styles from "../quotations.module.css";
const descriptions = {
  submit:
    "Send these commercial details to your manager for review. Buyer, addresses, dates and garment details are captured at submission.",
  approve:
    "Confirm that you have reviewed the pricing, terms and garment breakdown. Your approval freezes the reviewed offer for issue.",
  reject:
    "Return this submission to Draft so the sales team can make changes. Include a clear reason for your team.",
  withdraw:
    "Take this quotation out of the approval queue so you can edit it again. Its earlier activity will remain in the history.",
  issue:
    "Make this approved quotation the active offer for the buyer. Issue is recorded manually; this action does not send an email.",
  "buyer-response":
    "Record the decision your buyer communicated to your team, and the reference that supports it.",
  revisions:
    "Prepare a separate Draft with the same quote number. The current issued offer remains valid until a replacement is issued.",
  void: "Cancel this approved or issued offer. It will remain in the quotation history.",
  delete:
    "Remove this Draft from normal lists. Its lines and audit history will remain stored.",
  convert:
    "Create one Draft sales order using the accepted quotation values and snapshots. Production and payment will not start.",
};
export function QuotationActionDialog({
  context,
  onClose,
  onConfirm,
  onRefresh,
}) {
  const { action, quotation } = context;
  const [error, setError] = [context.error, context.setError];
  const {
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(makeActionSchema(action)),
    defaultValues: {
      reason: "",
      comment: "",
      decision: "Accepted",
      reference: "",
    },
    mode: "onTouched",
  });
  const decision = useWatch({ control, name: "decision" });
  const destructive = ["delete", "void"].includes(action);
  const submit = async (values) => {
    try {
      await onConfirm(values);
    } catch (apiError) {
      setError(apiError);
      applyServerErrors(apiError, setFieldError);
    }
  };
  return (
    <Dialog
      open
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      aria-labelledby="quotation-action-title"
      disableEscapeKeyDown={isSubmitting}
    >
      <form noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle id="quotation-action-title">
          {ACTION_LABELS[action]}
        </DialogTitle>
        <DialogContent>
          <p className={styles.dialogIntro}>{descriptions[action]}</p>
          <div className={styles.modalSummary}>
            <div>
              <strong>
                {quotation.quoteNumber} / R{quotation.revision}
              </strong>
              <p>
                {quotation.customerName} · {formatQuantity(quotation.totalQty)}{" "}
                PCS
              </p>
            </div>
            <div>
              <strong>
                {formatMoney(quotation.total, quotation.currency)}
              </strong>
              <StatusBadge status={quotation.status} />
            </div>
          </div>
          <ApiErrorAlert error={error}>
            {error?.code === "STALE_VERSION" && (
              <Button size="small" onClick={onRefresh}>
                Refresh quotation
              </Button>
            )}
          </ApiErrorAlert>
          <div className={styles.dialogFields}>
            {["reject", "withdraw", "revisions", "void"].includes(action) && (
              <FormField
                name="reason"
                control={control}
                label="Reason"
                required
                multiline
                minRows={3}
                placeholder={
                  action === "revisions"
                    ? "What is changing in this offer?"
                    : "Tell your team why"
                }
              />
            )}
            {action === "approve" && (
              <FormField
                name="comment"
                control={control}
                label="Review comment"
                multiline
                minRows={2}
                placeholder="Optional notes about your review"
              />
            )}
            {action === "issue" && (
              <Alert severity="info" icon={<Send size={17} />}>
                Channel: Manual. Download the quotation PDF to share the offer
                with your buyer.
              </Alert>
            )}
            {action === "buyer-response" && (
              <>
                <Controller
                  name="decision"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      {...field}
                      row
                      aria-label="Buyer decision"
                      className={styles.decisionButtons}
                    >
                      <FormControlLabel
                        value="Accepted"
                        control={<Radio size="small" />}
                        label={
                          <span>
                            <strong>Accepted</strong>
                            <small>Buyer agrees to the offer</small>
                          </span>
                        }
                        className={`${styles.decisionChoice} ${decision === "Accepted" ? styles.decisionSelected : ""}`}
                      />
                      <FormControlLabel
                        value="Declined"
                        control={<Radio size="small" />}
                        label={
                          <span>
                            <strong>Declined</strong>
                            <small>Buyer will not proceed</small>
                          </span>
                        }
                        className={`${styles.decisionChoice} ${decision === "Declined" ? styles.decisionSelected : ""}`}
                      />
                    </RadioGroup>
                  )}
                />
                <FormField
                  name="reference"
                  control={control}
                  label="Buyer response reference"
                  required
                  placeholder="e.g. Buyer email dated 16 Oct 2026"
                />
                {decision === "Declined" && (
                  <FormField
                    name="reason"
                    control={control}
                    label="Reason for declining"
                    required
                    multiline
                    minRows={2}
                    placeholder="Why did the buyer decline?"
                  />
                )}
              </>
            )}
            {action === "convert" && (
              <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                Accepted terms are preserved exactly. Buyer PO details can be
                supplied later.
              </Alert>
            )}
            {action === "delete" && (
              <Alert severity="warning" icon={<Info size={18} />}>
                Only Draft revisions can be deleted. This quotation number will
                not be reused.
              </Alert>
            )}
          </div>
          {(action === "approve" ||
            action === "buyer-response" ||
            action === "convert" ||
            action === "revisions") && (
            <div className={styles.dialogFootnote}>
              <ShieldCheck size={14} />
              <span>
                {action === "approve"
                  ? "The approver must be different from the submitter, including for Admin users."
                  : action === "buyer-response" && decision === "Accepted"
                    ? "Acceptance locks competing revisions in this family. This is a staff-recorded response, not an electronic signature."
                    : action === "convert"
                      ? "If the connection is interrupted, retry this same attempt. The same accepted quotation cannot create a duplicate order."
                      : action === "revisions"
                        ? "Validity is copied as it stands; it is not automatically extended. Only the latest eligible revision can start replacement work."
                        : "The response timestamp is recorded by the server."}
              </span>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={destructive ? "error" : "primary"}
            disabled={isSubmitting}
            startIcon={
              destructive ? (
                <XCircle size={14} />
              ) : action === "convert" ? (
                <LockKeyhole size={14} />
              ) : undefined
            }
          >
            {isSubmitting
              ? "Working…"
              : action === "buyer-response"
                ? decision === "Accepted"
                  ? "Record acceptance"
                  : "Record decline"
                : action === "convert"
                  ? "Create Draft order"
                  : action === "revisions"
                    ? "Create new Draft"
                    : ACTION_LABELS[action]}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
