import { getHttpClient } from "@/lib/axios";
export const listSalesOrders = async (base, params, signal) =>
  (await getHttpClient(base).get("/sales-orders", { params, signal })).data;
export const getSalesOrder = async (base, id, signal) =>
  (await getHttpClient(base).get(`/sales-orders/${id}`, { signal })).data.data;
export const createSalesOrder = async (base, { body, idempotencyKey }) =>
  (
    await getHttpClient(base).post("/sales-orders", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data.data;
export const updateSalesOrder = async (base, { id, body }) =>
  (await getHttpClient(base).patch(`/sales-orders/${id}`, body)).data.data;
export const deleteSalesOrder = (base, { id, version }) =>
  getHttpClient(base).delete(`/sales-orders/${id}`, {
    headers: { "If-Match": `"${version}"` },
  });
export const salesOrderAction = async (
  base,
  { id, action, body, idempotencyKey },
) =>
  (
    await getHttpClient(base).post(`/sales-orders/${id}/${action}`, body, {
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    })
  ).data.data;
export const getOrderRevisions = async (base, id, params, signal) =>
  (
    await getHttpClient(base).get(`/sales-orders/${id}/revisions`, {
      params,
      signal,
    })
  ).data;
export const getOrderActivity = async (base, id, params, signal) =>
  (
    await getHttpClient(base).get(`/sales-orders/${id}/activity`, {
      params,
      signal,
    })
  ).data;
export const getOrderFulfilment = async (base, id, signal) =>
  (await getHttpClient(base).get(`/sales-orders/${id}/fulfilment`, { signal }))
    .data.data;
export const getOrderPdf = (base, { id, revision }) =>
  getHttpClient(base).get(`/sales-orders/${id}/pdf`, {
    responseType: "blob",
    params: revision ? { revision } : undefined,
  });
