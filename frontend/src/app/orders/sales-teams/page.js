import { Suspense } from "react";
import TeamListPage from "@/features/sales-teams/pages/team-list-page";
import { LoadingState } from "@/components/ui/page-state";
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TeamListPage />
    </Suspense>
  );
}
