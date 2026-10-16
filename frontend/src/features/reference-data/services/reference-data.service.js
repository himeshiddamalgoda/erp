import { getHttpClient } from "@/lib/axios";
export async function getQuotationOptions(baseURL, signal) {
  const response = await getHttpClient(baseURL).get(
    "/reference-data/quotation-options",
    { signal },
  );
  return response.data.data;
}
