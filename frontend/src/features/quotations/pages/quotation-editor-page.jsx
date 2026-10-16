"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { ArrowLeft, FilePenLine } from "lucide-react";
import { getApiBaseUrl } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { WRITER_ROLES } from "@/constants/quotations";
import { notify, setEditorDirty } from "@/store/ui-slice";
import { useQuotationOptions } from "@/features/reference-data/hooks/use-quotation-options";
import { useQuotation, useQuotationMutations } from "../hooks/use-quotations";
import { QuotationForm } from "../components/quotation-form";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, ErrorState } from "@/components/ui/page-state";
import styles from "../quotations.module.css";
export default function QuotationEditorPage({ id }) {
  const workspace = useSelector((s) => s.ui.workspace);
  const base = getApiBaseUrl(workspace);
  // Changing identity must unmount local form state as well as separating query keys.
  return <EditorWorkspace key={`${base}:${id || "new"}`} base={base} id={id} />;
}
function EditorWorkspace({ base, id }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const dirty = useSelector((s) => s.ui.editorDirty);
  const [savedQuote, setSavedQuote] = useState(null);
  const references = useQuotationOptions(base);
  const detail = useQuotation(base, id || savedQuote?.id);
  const mutations = useQuotationMutations(base);
  const [formKey, setFormKey] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const quotation = savedQuote || detail.data;
  const canEdit = id
    ? quotation?.status === "Draft" &&
      !quotation.familyLocked &&
      quotation.allowedActions.includes("edit")
    : WRITER_ROLES.includes(references.data?.actor.role);
  const cancel = () => {
    if (dirty) setCancelOpen(true);
    else
      router.push(
        quotation ? ROUTES.quotation(quotation.id) : ROUTES.quotations,
      );
  };
  const save = async ({ body, version, intent }) => {
    const saved = quotation
      ? await mutations.update.mutateAsync({
          id: quotation.id,
          body: { ...body, version },
        })
      : await mutations.create.mutateAsync(body);
    if (intent === "submit") {
      try {
        const submitted = await mutations.action.mutateAsync({
          id: saved.id,
          action: "submit",
          body: { version: saved.version },
        });
        dispatch(setEditorDirty(false));
        dispatch(notify({ message: "Quotation submitted for approval." }));
        router.push(ROUTES.quotation(submitted.id));
        return { quotation: submitted };
      } catch (error) {
        setSavedQuote(saved);
        dispatch(
          notify({
            severity: "warning",
            message:
              "Your draft was saved. Complete the highlighted details before submitting.",
          }),
        );
        return { quotation: saved, submissionError: error };
      }
    }
    dispatch(setEditorDirty(false));
    dispatch(
      notify({
        message: quotation
          ? "Draft changes saved."
          : "Quotation draft created.",
      }),
    );
    router.push(ROUTES.quotation(saved.id));
    return { quotation: saved };
  };
  const reload = async () => {
    const result = await detail.refetch();
    if (result.data) {
      setSavedQuote(id ? null : result.data);
      setFormKey((key) => key + 1);
      dispatch(setEditorDirty(false));
    }
  };
  return (
    <AppShell
      actor={references.data?.actor}
      breadcrumb={id ? "Edit draft" : "New quotation"}
    >
      <button
        className={`${styles.backLink} ${styles.backButton}`}
        onClick={cancel}
      >
        <ArrowLeft size={13} />
        Back to {quotation ? "quotation" : "quotations"}
      </button>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>BUILD AN OFFER</p>
          <h1>
            {quotation ? `Edit ${quotation.quoteNumber}` : "New quotation"}
          </h1>
          <p>
            Bring buyer details, commercial terms and every garment variation
            together.
          </p>
        </div>
        <FilePenLine size={24} className={styles.documentIcon} />
      </div>
      {references.isPending || (id && detail.isPending) ? (
        <LoadingState />
      ) : references.error || detail.error ? (
        <ErrorState
          error={references.error || detail.error}
          onRetry={() => {
            references.refetch();
            if (id) detail.refetch();
          }}
        />
      ) : !canEdit ? (
        <div>
          <Alert severity="info">
            {quotation?.familyLocked
              ? "This quotation family has an accepted offer. Competing revisions are locked."
              : quotation
                ? "This revision is no longer editable."
                : "Your role can view quotations, but cannot create them."}
          </Alert>
          <Button
            component={Link}
            href={
              quotation ? ROUTES.quotation(quotation.id) : ROUTES.quotations
            }
          >
            Return to {quotation ? "detail" : "list"}
          </Button>
        </div>
      ) : (
        <>
          {savedQuote && !id && (
            <Alert severity="info" className={styles.errorAlert}>
              Draft {savedQuote.quoteNumber} is saved. You can correct and retry
              here, or{" "}
              <Link href={ROUTES.editQuotation(savedQuote.id)}>
                open the saved draft
              </Link>
              .
            </Alert>
          )}
          <QuotationForm
            key={formKey}
            quotation={quotation}
            options={references.data}
            onSave={save}
            onCancel={cancel}
            onReload={reload}
          />
        </>
      )}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <DialogTitle>Leave this draft?</DialogTitle>
        <DialogContent>
          Your unsaved changes will be lost. Save your draft if you want to
          return to these edits later.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={() => {
              dispatch(setEditorDirty(false));
              router.push(
                quotation ? ROUTES.quotation(quotation.id) : ROUTES.quotations,
              );
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
