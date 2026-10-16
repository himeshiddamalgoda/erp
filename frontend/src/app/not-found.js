import styles from "@/components/ui/ui.module.css";
import Link from "next/link";
export default function NotFound() {
  return (
    <main className={styles.notFound}>
      <h1>Page not found</h1>
      <p>This page may have moved.</p>
      <Link href="/orders/quotations">Back to quotations</Link>
    </main>
  );
}
