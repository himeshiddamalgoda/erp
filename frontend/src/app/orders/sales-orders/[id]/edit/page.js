import SalesOrderEditorPage from "@/features/sales-orders/pages/sales-order-editor-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <SalesOrderEditorPage id={id} />;
}
