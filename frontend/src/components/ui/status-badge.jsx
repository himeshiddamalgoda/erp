import { STATUS_COLORS, STATUS_LABELS } from "@/constants/quotations";
import styles from "./ui.module.css";
export function StatusBadge({ status }) {
  return (
    <span
      className={`${styles.badge} ${styles[STATUS_COLORS[status] || "neutral"]}`}
    >
      <span className={styles.dot} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
