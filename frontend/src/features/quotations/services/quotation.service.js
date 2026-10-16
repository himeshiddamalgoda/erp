import { getHttpClient } from "@/lib/axios";
export const listQuotations = async (baseURL, params, signal) =>
  (await getHttpClient(baseURL).get("/quotations", { params, signal })).data;
export const getQuotation = async (baseURL, id, signal) =>
  (await getHttpClient(baseURL).get(`/quotations/${id}`, { signal })).data.data;
export const createQuotation = async (baseURL, body) =>
  (await getHttpClient(baseURL).post("/quotations", body)).data.data;
export const updateQuotation = async (baseURL, { id, body }) =>
  (await getHttpClient(baseURL).patch(`/quotations/${id}`, body)).data.data;
export const deleteQuotation = async (baseURL, { id, version }) =>
  getHttpClient(baseURL).delete(`/quotations/${id}`, {
    headers: { "If-Match": `"${version}"` },
  });
export const quotationAction = async (
  baseURL,
  { id, action, body, idempotencyKey },
) =>
  (
    await getHttpClient(baseURL).post(`/quotations/${id}/${action}`, body, {
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    })
  ).data.data;
export const getQuotationPdf = (baseURL, id) =>
  getHttpClient(baseURL).get(`/quotations/${id}/pdf`, { responseType: "blob" });
