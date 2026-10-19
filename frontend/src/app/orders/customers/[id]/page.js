import CustomerDetailPage from "@/features/customers/pages/customer-detail-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <CustomerDetailPage id={id} />;
}
