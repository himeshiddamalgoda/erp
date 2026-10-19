import { Alert, Button } from "@mui/material";
import styles from "../sales-orders.module.css";
export function OrderRecovery({ attempt, onRetry, pending }) {
  if (!attempt) return null;
  return (
    <Alert severity="warning" className={styles.alert}>
      <strong>
        {attempt.operation === "create"
          ? "A Draft creation request is being tracked."
          : "An order action is awaiting confirmation."}
      </strong>
      <div>
        The original request is kept for a safe retry. Finish checking its
        result before making further changes.
      </div>
      <Button onClick={onRetry} disabled={pending}>
        {pending ? "Checking request…" : "Retry original request"}
      </Button>
    </Alert>
  );
}
