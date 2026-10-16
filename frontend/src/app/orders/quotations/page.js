import { Suspense } from "react";
import QuotationListPage from "@/features/quotations/pages/quotation-list-page";
import { LoadingState } from "@/components/ui/page-state";
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <QuotationListPage />
    </Suspense>
  );
}
