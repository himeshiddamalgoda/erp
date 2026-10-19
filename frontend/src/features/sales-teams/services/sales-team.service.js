import { getHttpClient } from "@/lib/axios";
export const listTeams = async (base, params, signal) =>
  (await getHttpClient(base).get("/sales-teams", { params, signal })).data;
export const getTeam = async (base, id, signal) =>
  (
    await getHttpClient(base).get(`/sales-teams/${id}`, {
      params: { includeInactiveMembers: true },
      signal,
    })
  ).data.data;
export const createTeam = async (base, { body, idempotencyKey }) =>
  (
    await getHttpClient(base).post("/sales-teams", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data.data;
export const updateTeam = async (base, { id, body }) =>
  (await getHttpClient(base).patch(`/sales-teams/${id}`, body)).data.data;
export const teamLifecycle = async (base, { id, action, body }) => {
  if (!["archive", "reactivate"].includes(action))
    throw new Error("Unsupported team action");
  return (await getHttpClient(base).post(`/sales-teams/${id}/${action}`, body))
    .data.data;
};
