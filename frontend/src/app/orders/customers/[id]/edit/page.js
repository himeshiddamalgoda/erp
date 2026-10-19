import CustomerEditorPage from "@/features/customers/pages/customer-editor-page";
export const metadata = { title: "Edit customer" };
export default async function Page({ params }) {
  const { id } = await params;
  return <CustomerEditorPage id={id} />;
}
