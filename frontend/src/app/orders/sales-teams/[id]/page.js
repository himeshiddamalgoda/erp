import TeamDetailPage from "@/features/sales-teams/pages/team-detail-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <TeamDetailPage id={id} />;
}
