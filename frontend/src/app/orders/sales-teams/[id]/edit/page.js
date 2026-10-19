import TeamEditorPage from "@/features/sales-teams/pages/team-editor-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <TeamEditorPage id={id} />;
}
