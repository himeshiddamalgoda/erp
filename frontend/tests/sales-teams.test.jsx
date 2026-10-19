import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  teamSchema,
  teamPayload,
} from "@/features/sales-teams/schemas/sales-team.schema";
import { TeamBlockers } from "@/features/sales-teams/components/team-shared";
import { canManageTeams, canReassign } from "@/constants/sales-teams";
import { readTeamFilters } from "@/utils/sales-team";
const manager = "10000000-0000-4000-8000-000000000002",
  member = "10000000-0000-4000-8000-000000000001";
const baseline = {
  name: "Export Sales",
  description: null,
  managerId: manager,
  version: 7,
  members: [
    { userId: manager, membershipActive: true },
    { userId: member, membershipActive: true },
  ],
};
const values = {
  name: baseline.name,
  description: "",
  managerId: manager,
  memberIds: [manager, member],
  reason: "",
};
describe("team membership contracts", () => {
  it("preserves the current set on profile edits and uses its original version", () => {
    expect(teamPayload({ ...values, name: "Updated" }, baseline)).toEqual({
      version: 7,
      name: "Updated",
    });
  });
  it("treats reordered members as the same set", () => {
    expect(
      teamPayload({ ...values, memberIds: [member, manager] }, baseline),
    ).toEqual({ version: 7 });
    expect(
      teamSchema(baseline).safeParse({
        ...values,
        memberIds: [member, manager],
      }).success,
    ).toBe(true);
  });
  it("requires a reason and sends the complete desired set when removing a member", () => {
    expect(
      teamSchema(baseline).safeParse({ ...values, memberIds: [manager] })
        .success,
    ).toBe(false);
    const v = {
      ...values,
      memberIds: [manager],
      reason: "Transferred assignments",
    };
    expect(teamSchema(baseline).safeParse(v).success).toBe(true);
    expect(teamPayload(v, baseline)).toEqual({
      version: 7,
      memberIds: [manager],
      reason: v.reason,
    });
  });
  it("rejects missing managers, duplicates and empty membership", () => {
    for (const ids of [[], [member], [manager, manager]])
      expect(
        teamSchema().safeParse({ ...values, memberIds: ids }).success,
      ).toBe(false);
  });
  it("requires an explicit reason for manager changes even if membership remains", () =>
    expect(
      teamSchema(baseline).safeParse({ ...values, managerId: member }).success,
    ).toBe(false));
  it("does not confuse manager role and team or assignment capabilities", () => {
    expect(canManageTeams({ role: "SalesManager" })).toBeFalsy();
    expect(canReassign({ role: "SalesManager" }, "quotation")).toBeFalsy();
    expect(canManageTeams({ capabilities: ["sales-teams:write"] })).toBe(true);
    expect(
      canReassign({ capabilities: ["sales-teams:write"] }, "customer"),
    ).toBeFalsy();
    expect(
      canReassign(
        { capabilities: ["customers:assign", "customers:write"] },
        "customer",
      ),
    ).toBe(true);
  });
  it("normalizes untrusted URL filters", () => {
    expect(
      readTeamFilters(
        new URLSearchParams(
          "page=-1&pageSize=1000&sortBy=anything&status=deleted&managerId=invalid",
        ),
      ),
    ).toMatchObject({
      page: 1,
      pageSize: 20,
      status: "Active",
      sortBy: "name",
      managerId: "",
    });
  });
  it("shows generic restricted blockers even when visible count is zero", () => {
    render(
      <TeamBlockers
        details={{ blockerCount: 0, restrictedBlockers: true, blockers: [] }}
      />,
    );
    expect(
      screen.getByText(
        "Additional assignments must be resolved by their authorized team.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    cleanup();
  });
});
