import QuotationEditorPage from "@/features/quotations/pages/quotation-editor-page";
export const metadata = { title: "Edit quotation" };
export default async function Page({ params }) {
  const { id } = await params;
  return <QuotationEditorPage id={id} />;
}
