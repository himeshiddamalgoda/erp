import { QueryTypes } from "sequelize";
import {
  teamExtensions,
  membershipExtensions,
  teamTables,
  teamIndexes,
} from "../sales-team-schema.js";
import { snake } from "../schema.js";
export const name = "006-sales-teams";
const query = (db, sql) => db.query(sql, { type: QueryTypes.SELECT });
export async function up(db) {
  const qi = db.getQueryInterface();
  const invalid = await query(
    db,
    `SELECT t.id FROM sales_teams t LEFT JOIN users u ON u.id=t.manager_id LEFT JOIN sales_team_members m ON m.team_id=t.id AND m.user_id=t.manager_id WHERE t.is_active=1 AND (u.id IS NULL OR u.is_active<>1 OR u.role NOT IN ('SalesManager','Admin') OR COALESCE(m.is_active,0)<>1) LIMIT 20`,
  );
  const badMembers = await query(
    db,
    "SELECT m.team_id,m.user_id FROM sales_team_members m JOIN sales_teams t ON t.id=m.team_id LEFT JOIN users u ON u.id=m.user_id WHERE t.is_active=1 AND m.is_active=1 AND (u.id IS NULL OR u.is_active<>1 OR u.role NOT IN ('Sales','SalesManager','Admin','Viewer')) LIMIT 20",
  );
  const tooMany = await query(
    db,
    "SELECT team_id FROM sales_team_members GROUP BY team_id HAVING COUNT(*)>500 OR SUM(is_active=1)>100 LIMIT 20",
  );
  const broken = [];
  for (const [table, where] of [
    ["customers", "e.is_active=1"],
    [
      "quotations",
      "e.deleted_at IS NULL AND e.status IN ('Draft','PendingApproval','Approved','Issued','Accepted')",
    ],
    [
      "sales_orders",
      "e.deleted_at IS NULL AND e.status IN ('Draft','Confirmed','InProgress','PartiallyDelivered','Delivered')",
    ],
  ])
    broken.push(
      ...(await query(
        db,
        `SELECT e.id,e.sales_team_id FROM ${table} e LEFT JOIN sales_teams t ON t.id=e.sales_team_id LEFT JOIN users u ON u.id=e.owner_id LEFT JOIN sales_team_members m ON m.team_id=e.sales_team_id AND m.user_id=e.owner_id WHERE ${where} AND (COALESCE(t.is_active,0)<>1 OR COALESCE(u.is_active,0)<>1 OR COALESCE(m.is_active,0)<>1) LIMIT 20`,
      )),
    );
  if (invalid.length || badMembers.length || tooMany.length || broken.length)
    throw new Error(
      "Sales Teams migration preflight failed; repair invalid manager/member/active assignments explicitly. No rows changed. " +
        JSON.stringify({
          invalidTeams: invalid,
          invalidMembers: badMembers,
          oversized: tooMany,
          invalidAssignments: broken,
        }),
    );
  const teams = await query(db, "SELECT id,code FROM sales_teams");
  let next = 1n;
  for (const row of teams) {
    const match = /^TEAM-([0-9]+)$/i.exec(row.code.trim());
    if (match && BigInt(match[1]) >= next) next = BigInt(match[1]) + 1n;
  }
  if (next >= 18446744073709551615n)
    throw new Error("Sales team code sequence exhausted");
  for (const [table, attributes] of Object.entries({
    sales_teams: teamExtensions,
    sales_team_members: membershipExtensions,
  })) {
    const columns = await qi.describeTable(table);
    for (const [key, definition] of Object.entries(attributes))
      if (!columns[snake(key)])
        await qi.addColumn(table, snake(key), definition);
  }
  // Do not infer historical first activation, creator or removal from team timestamps/current owner.
  for (const [table, indexes] of Object.entries(teamIndexes)) {
    const existing = await qi.showIndex(table);
    for (const index of indexes)
      if (!existing.some((i) => i.name === index.name))
        await qi.addIndex(table, index.fields, index);
  }
  if (!(await qi.showAllTables()).includes("team_code_sequences"))
    await qi.createTable(
      "team_code_sequences",
      Object.fromEntries(
        Object.entries(teamTables.team_code_sequences).map(([key, value]) => [
          snake(key),
          value,
        ]),
      ),
      { engine: "InnoDB", charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    );
  await db.query(
    "INSERT INTO team_code_sequences (sequence_key,next_value,updated_at) VALUES ('SALES_TEAM',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE next_value=GREATEST(next_value,VALUES(next_value))",
    { replacements: [next.toString()] },
  );
  const existingChecks = await query(
    db,
    "SELECT CONSTRAINT_NAME name FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='sales_teams'",
  );
  if (!existingChecks.some((x) => x.name === "team_archive_metadata_check"))
    await db.query(
      "ALTER TABLE sales_teams ADD CONSTRAINT team_archive_metadata_check CHECK ((is_active=1 AND archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL) OR (is_active=0 AND ((archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL) OR (archived_at IS NOT NULL AND archived_by IS NOT NULL AND CHAR_LENGTH(TRIM(archive_reason))>0))))",
    );
}
export async function down(db) {
  const [{ n }] = await query(db, "SELECT COUNT(*) n FROM sales_teams");
  if (Number(n))
    throw new Error(
      "Refusing destructive rollback while sales team records/history exist",
    );
  const qi = db.getQueryInterface();
  await qi.removeConstraint("sales_teams", "team_archive_metadata_check");
  for (const [table, indexes] of Object.entries(teamIndexes))
    for (const index of indexes) await qi.removeIndex(table, index.name);
  for (const [table, attrs] of Object.entries({
    sales_teams: teamExtensions,
    sales_team_members: membershipExtensions,
  }))
    for (const key of Object.keys(attrs))
      await qi.removeColumn(table, snake(key));
  await qi.dropTable("team_code_sequences");
}
