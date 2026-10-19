import { Suspense } from "react";
import SalesOrderListPage from "@/features/sales-orders/pages/sales-order-list-page";
import { LoadingState } from "@/components/ui/page-state";
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SalesOrderListPage />
    </Suspense>
  );
}
