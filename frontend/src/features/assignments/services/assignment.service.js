import { getHttpClient } from "@/lib/axios";
const paths = {
  customer: "customers",
  quotation: "quotations",
  salesOrder: "sales-orders",
};
export const getAssignment = async (base, type, id, signal) => {
  if (!paths[type]) throw new Error("Unsupported assignment type");
  return (await getHttpClient(base).get(`/${paths[type]}/${id}`, { signal }))
    .data.data;
};
export const reassign = async (base, body) =>
  (await getHttpClient(base).post("/assignments/reassign", body)).data.data;
