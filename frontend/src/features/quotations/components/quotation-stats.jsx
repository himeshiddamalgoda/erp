import { FilePenLine, Clock3, Send } from "lucide-react";
import { formatQuantity } from "@/utils/format";
import styles from "../quotations.module.css";
export function QuotationStats({ drafts, pending, issued }) {
  const cards = [
    {
      label: "Draft quotations",
      value: drafts,
      icon: FilePenLine,
      note: "Ready for your next move",
      className: "",
    },
    {
      label: "Awaiting approval",
      value: pending,
      icon: Clock3,
      note: "In the review queue",
      className: styles.statIconAmber,
    },
    {
      label: "Issued offers",
      value: issued,
      icon: Send,
      note: "With your buyers",
      className: styles.statIconBlue,
    },
  ];
  return (
    <div className={styles.stats}>
      {cards.map(({ label, value, icon: Icon, note, className }) => (
        <div className={styles.stat} key={label}>
          <div className={styles.statTop}>
            <span>{label}</span>
            <span className={`${styles.statIcon} ${className}`}>
              <Icon size={16} />
            </span>
          </div>
          <div className={styles.statNumber}>
            {value === undefined ? "—" : formatQuantity(value)}
          </div>
          <div className={styles.statNote}>
            <span />
            {note}
          </div>
        </div>
      ))}
    </div>
  );
}
