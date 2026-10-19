import { pathToFileURL } from "node:url";
import { createQuotationContext } from "../context.js";
import { seedDemo } from "./demo.js";
import { demoIds as ids } from "../../middleware/auth-context.js";
export const salesTeamDemoIds = {
  team: "20000000-0000-4000-8000-000000000002",
  merchandiserB: "10000000-0000-4000-8000-000000000005",
};
export async function seedSalesTeams(context) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Sales Teams seed is development/test only");
  await seedDemo(context);
  const { models: m } = context,
    now = new Date();
  await m.users.findOrCreate({
    where: { id: salesTeamDemoIds.merchandiserB },
    defaults: {
      displayName: "Demo Merchandiser B",
      role: "Sales",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  if (await m.sales_teams.findByPk(salesTeamDemoIds.team))
    return salesTeamDemoIds;
  const r = context.salesTeams.r,
    actor = { id: ids.admin, role: "Admin", salesTeamIds: [] };
  await r.transaction(async (t) => {
    const code = await r.number(t);
    if (
      await m.sales_teams.findByPk(salesTeamDemoIds.team, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      })
    )
      return;
    const memberIds = [ids.manager, ids.sales, salesTeamDemoIds.merchandiserB];
    await context.salesTeams.validate(ids.manager, memberIds, t);
    const team = await r.insert(
      "sales_teams",
      {
        id: salesTeamDemoIds.team,
        code,
        name: "Export Sales",
        description: "Manages overseas garment buyers and orders",
        managerId: ids.manager,
        isActive: true,
        version: 1,
        createdBy: ids.admin,
        updatedBy: ids.admin,
        createdAt: now,
        updatedAt: now,
      },
      { transaction: t },
    );
    await r.insertMany(
      "sales_team_members",
      memberIds.map((userId) => ({
        teamId: team.id,
        userId,
        isActive: true,
        joinedAt: now,
        lastActivatedAt: now,
        addedBy: ids.admin,
        lastActivatedBy: ids.admin,
        createdAt: now,
        updatedAt: now,
      })),
      { transaction: t },
    );
    await r.audit(
      team,
      actor,
      "TeamCreated",
      null,
      null,
      "sales-teams-seed",
      t,
      { memberIds, managerId: ids.manager },
    );
  });
  return salesTeamDemoIds;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const c = createQuotationContext();
  try {
    console.log(JSON.stringify(await seedSalesTeams(c), null, 2));
  } finally {
    await c.close();
  }
}
