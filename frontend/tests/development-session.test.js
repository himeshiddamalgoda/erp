import { it, expect, vi } from "vitest";
const client = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: { workspace: "manager" } } }),
  post: vi.fn().mockResolvedValue({ data: { data: { workspace: "admin" } } }),
}));
vi.mock("@/lib/axios", () => ({ getHttpClient: () => client }));
import { API, getApiBaseUrl } from "@/constants/api";
import {
  getDevelopmentSession,
  changeDevelopmentSession,
} from "@/features/development-session/services/development-session.service";
it("uses the same API for Sales, Manager and Admin", () => {
  for (const role of ["sales", "manager", "admin"])
    expect(getApiBaseUrl(role)).toBe(API.sales);
  expect(API.manager).toBeUndefined();
  expect(API.admin).toBeUndefined();
});
it("reads and switches the server session without role headers or a second API", async () => {
  const signal = new AbortController().signal;
  expect(await getDevelopmentSession("api", signal)).toEqual({
    workspace: "manager",
  });
  expect(client.get).toHaveBeenCalledWith("/dev/session", { signal });
  expect(await changeDevelopmentSession("api", "admin")).toEqual({
    workspace: "admin",
  });
  expect(client.post).toHaveBeenCalledWith("/dev/session", {
    workspace: "admin",
  });
});
