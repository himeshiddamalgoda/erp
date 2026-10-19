import { getHttpClient } from "@/lib/axios";
export const getDevelopmentSession = async (base, signal) =>
  (await getHttpClient(base).get("/dev/session", { signal })).data.data;
export const changeDevelopmentSession = async (base, workspace) =>
  (await getHttpClient(base).post("/dev/session", { workspace })).data.data;
