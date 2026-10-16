import QuotationDetailPage from "@/features/quotations/pages/quotation-detail-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <QuotationDetailPage id={id} />;
}
