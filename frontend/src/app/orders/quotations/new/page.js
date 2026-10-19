import QuotationEditorPage from "@/features/quotations/pages/quotation-editor-page";
export const metadata = { title: "New quotation" };
export default async function Page({ searchParams }) {
  const { customerId } = await searchParams;
  return (
    <QuotationEditorPage
      initialCustomerId={
        typeof customerId === "string" ? customerId : undefined
      }
    />
  );
}
