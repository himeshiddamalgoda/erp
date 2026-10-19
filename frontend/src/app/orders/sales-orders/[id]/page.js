import SalesOrderDetailPage from "@/features/sales-orders/pages/sales-order-detail-page";
export default async function Page({ params }) {
  const { id } = await params;
  return <SalesOrderDetailPage id={id} />;
}
