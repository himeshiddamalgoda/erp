import { Suspense } from "react";
import CustomerListPage from "@/features/customers/pages/customer-list-page";
import { LoadingState } from "@/components/ui/page-state";
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CustomerListPage />
    </Suspense>
  );
}
