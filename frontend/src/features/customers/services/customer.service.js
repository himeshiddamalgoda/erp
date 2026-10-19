import { getHttpClient } from "@/lib/axios";
export const listCustomers = async (base, params, signal) =>
  (await getHttpClient(base).get("/customers", { params, signal })).data;
export const getCustomer = async (base, id, includeInactiveChildren, signal) =>
  (
    await getHttpClient(base).get(`/customers/${id}`, {
      params: { includeInactiveChildren },
      signal,
    })
  ).data.data;
export const createCustomer = async (base, { body, idempotencyKey }) =>
  (
    await getHttpClient(base).post("/customers", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data.data;
export const updateCustomer = async (base, { id, body }) =>
  (await getHttpClient(base).patch(`/customers/${id}`, body)).data.data;
export const customerLifecycle = async (base, { id, action, body }) => {
  if (!["archive", "reactivate"].includes(action))
    throw new Error("Unsupported customer action");
  return (await getHttpClient(base).post(`/customers/${id}/${action}`, body))
    .data.data;
};
