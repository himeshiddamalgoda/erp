import { it, expect, vi } from "vitest";
const client = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: { id: "entity" } } }),
  post: vi.fn().mockResolvedValue({ data: { data: { id: "entity" } } }),
  patch: vi.fn().mockResolvedValue({ data: { data: { id: "entity" } } }),
}));
vi.mock("@/lib/axios", () => ({ getHttpClient: () => client }));
import * as teams from "@/features/sales-teams/services/sales-team.service";
import { listStaff } from "@/features/staff/services/staff.service";
import {
  getAssignment,
  reassign,
} from "@/features/assignments/services/assignment.service";
import { cleanTeamParams } from "@/utils/sales-team";
it("omits empty lookup filters while preserving explicit boolean flags", () => {
  expect(cleanTeamParams({ q: "  ", managerEligible: false, page: 1 })).toEqual(
    { managerEligible: false, page: 1 },
  );
  expect(cleanTeamParams({ q: "  Export  " })).toEqual({ q: "Export" });
});
it("uses six team routes and includes the inactive membership history", async () => {
  const signal = new AbortController().signal;
  await teams.listTeams("api", { page: 2 }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-teams", {
    params: { page: 2 },
    signal,
  });
  await teams.getTeam("api", "team", signal);
  expect(client.get).toHaveBeenLastCalledWith("/sales-teams/team", {
    params: { includeInactiveMembers: true },
    signal,
  });
  await teams.createTeam("api", {
    body: { name: "Export" },
    idempotencyKey: "original",
  });
  expect(client.post).toHaveBeenLastCalledWith(
    "/sales-teams",
    { name: "Export" },
    { headers: { "Idempotency-Key": "original" } },
  );
  await teams.updateTeam("api", {
    id: "team",
    body: { version: 4, memberIds: ["manager"] },
  });
  expect(client.patch).toHaveBeenLastCalledWith("/sales-teams/team", {
    version: 4,
    memberIds: ["manager"],
  });
  for (const action of ["archive", "reactivate"]) {
    await teams.teamLifecycle("api", {
      id: "team",
      action,
      body: { version: 4, reason: "Review" },
    });
    expect(client.post).toHaveBeenLastCalledWith(
      `/sales-teams/team/${action}`,
      { version: 4, reason: "Review" },
    );
  }
  await expect(
    teams.teamLifecycle("api", { id: "team", action: "delete" }),
  ).rejects.toThrow("Unsupported");
});
it("loads existing staff and transfers one entity with its own version", async () => {
  const signal = new AbortController().signal;
  await listStaff("api", { managerEligible: true }, signal);
  expect(client.get).toHaveBeenLastCalledWith("/users", {
    params: { managerEligible: true },
    signal,
  });
  for (const [type, path] of [
    ["customer", "customers"],
    ["quotation", "quotations"],
    ["salesOrder", "sales-orders"],
  ]) {
    await getAssignment("api", type, "record", signal);
    expect(client.get).toHaveBeenLastCalledWith(`/${path}/record`, { signal });
    const body = {
      entityType: type,
      entityId: "record",
      salesTeamId: "target",
      ownerId: "owner",
      version: 9,
      reason: "Transfer",
    };
    await reassign("api", body);
    expect(client.post).toHaveBeenLastCalledWith("/assignments/reassign", body);
  }
  await expect(
    getAssignment("api", "unknown", "record", signal),
  ).rejects.toThrow("Unsupported");
});
