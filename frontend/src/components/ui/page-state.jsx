"use client";
import { Alert, AlertTitle, Button, Skeleton } from "@mui/material";
import { RefreshCw, ArrowLeft, WifiOff, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import styles from "./ui.module.css";
export function LoadingState({ label = "Loading workspace…" }) {
  return (
    <div className={styles.loading} aria-busy="true" aria-label={label}>
      <Skeleton width="40%" height={46} />
      <Skeleton width="65%" height={25} />
      <div className={styles.skeletonCards}>
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} variant="rounded" height={100} />
        ))}
      </div>
      <Skeleton variant="rounded" height={310} />
    </div>
  );
}
export function ErrorState({
  error,
  onRetry,
  title,
  backHref = ROUTES.quotations,
  backLabel = "Back to quotations",
}) {
  const denied = [401, 403, 404].includes(error?.status);
  return (
    <div className={styles.errorState}>
      {denied ? <LockKeyhole size={34} /> : <WifiOff size={34} />}
      <h2>
        {title ||
          (error?.status === 404
            ? "Quotation not found"
            : denied
              ? "Workspace access required"
              : "Unable to load this workspace")}
      </h2>
      <p>{error?.message || "Please try again in a moment."}</p>
      {error?.requestId && <small>Reference: {error.requestId}</small>}
      <div className={styles.row}>
        {onRetry && (
          <Button
            variant="contained"
            startIcon={<RefreshCw size={16} />}
            onClick={onRetry}
          >
            Try again
          </Button>
        )}
        <Button
          component={Link}
          href={backHref}
          startIcon={<ArrowLeft size={16} />}
        >
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
export function ApiErrorAlert({ error, children, resource = "quotation" }) {
  if (!error) return null;
  return (
    <Alert
      severity={error.code === "STALE_VERSION" ? "warning" : "error"}
      className={styles.errorAlert}
    >
      <AlertTitle>
        {error.code === "STALE_VERSION"
          ? `This ${resource} has changed`
          : error.code === "FAMILY_ALREADY_ACCEPTED"
            ? "This quotation family is locked"
            : "We couldn’t complete this action"}
      </AlertTitle>
      {error.message}
      {error.requestId && (
        <span className={styles.requestId}>Reference: {error.requestId}</span>
      )}
      {children}
    </Alert>
  );
}
