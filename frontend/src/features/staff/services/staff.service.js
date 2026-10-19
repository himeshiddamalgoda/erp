import { getHttpClient } from "@/lib/axios";
export const listStaff = async (base, params, signal) =>
  (await getHttpClient(base).get("/users", { params, signal })).data;
