import { pathToFileURL } from "node:url";
import { createSequelize } from "./sequelize.js";
import * as initial from "./migrations/001-quotation-schema.js";
import * as links from "./migrations/002-family-links.js";
import * as guards from "./migrations/003-commercial-guards.js";
import * as orders from "./migrations/004-sales-orders.js";
import * as customers from "./migrations/005-customers.js";
import * as teams from "./migrations/006-sales-teams.js";
export async function migrate(db, direction = "up") {
  const connection = await db.connectionManager.getConnection();
  let locked = false;
  try {
    // Sequelize v6 does not honor an arbitrary query {connection} option.
    // Use the same checked-out mysql2 session for both advisory-lock calls.
    const [lock] = await connection
      .promise()
      .query("SELECT GET_LOCK('erp_quotation_migrations', 30) AS acquired");
    if (Number(lock[0].acquired) !== 1)
      throw new Error("Migration lock unavailable");
    locked = true;
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at DATETIME(3) NOT NULL) ENGINE=InnoDB",
    );
    const [rows] = await db.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const migrations = [initial, links, guards, orders, customers, teams];
    if (direction === "down") {
      const migration = migrations
        .toReversed()
        .find((m) => applied.has(m.name));
      if (migration) {
        await migration.down(db);
        await db.query("DELETE FROM schema_migrations WHERE name = ?", {
          replacements: [migration.name],
        });
      }
    } else {
      if (!applied.has(initial.name)) {
        const tables = await db.getQueryInterface().showAllTables();
        if (tables.some((t) => t !== "schema_migrations"))
          throw new Error(
            "Unmanaged tables found; map existing master tables before migrating. No existing tables were changed.",
          );
      }
      for (const migration of migrations)
        if (!applied.has(migration.name)) {
          await migration.up(db);
          await db.query(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP(3))",
            { replacements: [migration.name] },
          );
        }
    }
  } finally {
    try {
      if (locked)
        await connection
          .promise()
          .query("SELECT RELEASE_LOCK('erp_quotation_migrations')");
    } finally {
      await db.connectionManager.releaseConnection(connection);
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const db = createSequelize();
  try {
    await migrate(db, process.argv[2]);
    console.log("Migrations complete");
  } finally {
    await db.close();
  }
}
