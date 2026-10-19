# Sales Teams setup and testing

Read [implementation/policy/locking](sales-teams.md), [screen/API journeys](sales-teams-ui-integration.md), [six-operation OpenAPI](sales-teams.openapi.yaml), [separate dependency OpenAPI](team-supporting-apis.openapi.yaml), and [Postman](postman/sales-teams.postman_collection.json).

## Reuse local MySQL and migrate

From repository root:

```sh
cd backend
npm ci
# Reuse backend/.env and the existing volume. No reinstall/reset.
docker compose up -d mysql
npm run migrate
NODE_ENV=development npm run seed:teams
```

No dependency was added by this module. Unknown team/member provenance stays nullable on legacy rows; no new migration actor variable is needed for006. Earlier customer migration005 still has its own documented legacy adoption requirement on old pre-Customers installations. Preflight reports invalid live manager/member/ownership assignments for explicit repair before006. Do not choose random users, delete conflict rows, or run the SQL reference as an installer. Existing test databases may contain intentionally invalid older fixtures; use a freshly provisioned isolated database rather than resetting them.

Docker-only equivalents after building the updated backend:

```sh
docker compose build backend
docker compose run --rm backend npm run migrate
docker compose run --rm -e NODE_ENV=development backend npm run seed:teams
docker compose up -d --no-build backend
```

Restart every writer instance, including any separate Sales/Manager/Admin local servers, before allowing team management; the race protocol requires all writers on the new guard code. Existing server environment/credentials are reused, not printed.

Run a localhost Admin instance from `backend/`:

```sh
HOST=127.0.0.1 PORT=4102 NODE_ENV=development DEV_AUTH_ENABLED=true DEV_ACTOR=admin npm start
```

Use `http://127.0.0.1:4102/api/v1` as base. There is no route at `/api/v1` itself. Existing Sales4000/Manager4101 readers retain current scoped access but cannot manage teams without explicit capabilities. There are no tokens/role headers to send. Development authentication is prohibited in production; upstream trusted middleware supplies real principals there.

## Deterministic development seed

`seed:teams` safely reuses existing base Admin/Manager/Sales/Viewer and creates:

| Item | Stable UUID |
| --- | --- |
| Export Sales | `20000000-0000-4000-8000-000000000002` |
| Existing Manager | `10000000-0000-4000-8000-000000000002` |
| Existing Merchandiser A | `10000000-0000-4000-8000-000000000001` |
| Merchandiser B | `10000000-0000-4000-8000-000000000005` |

Manager/A/B are the new team's initial active set. Generated code follows the sequence, normallyTEAM-000001 on the initial existing installation. Existing APPAREL code and Ocean Apparel/customer/document assignments remain intact; seeding never silently transfers them. Repeating seed preserves current profile/status/membership edits and first metadata; it does not resurrect removed members. Staff seeding is development/test only and creates no passwords or login APIs.

The fixed development Sales/Manager principal claims only its established APPAREL scope. Admin can test newly created teams globally. A production identity adapter must refresh claims for new grants; the server always intersects claims with current active membership and promptly removes revoked access.

## Postman and executable HTTP journeys

Import the collection. Its first folder has exactly six Team requests; the second identifies staff/reassignment dependencies and existing assignment lists. Team create/detail/mutations capture `teamId/teamVersion`. Keep `createKey` on retries; change it only for an intentional new team. PATCH example omits members to preserve them. For removal, send the complete final set and reason. Supporting reassignment needs the returned **entity version**, not teamVersion.

Both scripts capture real IDs/versions:

```sh
# Full HTTP journey: team create/replay/edit; buyer + quotation + order;
# blocked removal; explicit transfer each; remove; transfer out; archive;
# archived repair; reactivate; final list/detail/directory checks.
npm run demo:teams
# cURL + jq + Node equivalent using a customer assignment blocker:
bash scripts/sales-teams.curl.sh
# Point at an isolated test server when verifying instead of creating main demo records:
ADMIN_API_URL=http://127.0.0.1:4613/api/v1 npm run demo:teams
ADMIN_API_URL=http://127.0.0.1:4613/api/v1 bash scripts/sales-teams.curl.sh
```

These scripts intentionally create new demo records. The cURL script accepts a retained `TEAM_CREATE_KEY`; its same create payload can replay safely. The Node script starts a new intentional journey each run. It never sends auth tokens or impersonation headers.

Basic reads:

```sh
curl -sS 'http://127.0.0.1:4102/api/v1/sales-teams?status=Active&page=1&pageSize=20'
curl -sS 'http://127.0.0.1:4102/api/v1/sales-teams/20000000-0000-4000-8000-000000000002?includeInactiveMembers=true'
curl -sS 'http://127.0.0.1:4102/api/v1/users?status=Active&managerEligible=true'
```

## Isolated real-MySQL suite

Do not reset existing databases. From repository root, use the existing container's root environment internally without printing it:

```sh
docker compose -f backend/compose.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot' <<'SQL'
CREATE DATABASE IF NOT EXISTS erp_sales_teams_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON erp_sales_teams_test.* TO 'erp'@'%';
SQL
cd backend
TEST_DB_NAME=erp_sales_teams_test npm test
npm run check
```

Use the configured application username when it differs from `erp`. Test names must end `_test` and differ from the application database. Fixtures append isolated data; no force-sync/drop/reset/SQLite substitute. Test files serialize shared base-master fixture changes.

For HTTP examples against the isolated DB, start a temporary server in another terminal:

```sh
HOST=127.0.0.1 PORT=4613 DB_NAME=erp_sales_teams_test NODE_ENV=development DEV_AUTH_ENABLED=true DEV_ACTOR=admin npm start
```

Stop that temporary server after verification. Main Sales4000/Manager4101/Admin4102 continue using their normal DB.

The suite covers manager/member eligibility, complete-set semantics, durable pair reactivation, manager role independence, all blocker statuses/revisions, terminal/deleted/other-team records, archive/repair, stale versions, audit rollback, concurrent creates/idempotency, source+target transfer permission, hidden/capped metadata, no N+1 list counts, stale claims across PDFs/history, and both directions of real-MySQL assignment/archive/removal races. Existing customer/quote/order suites run alongside it. Tests construct selected historical states directly only inside the isolated DB; real application journeys use lifecycle APIs.

## Regenerate artifacts

```sh
npm run docs:teams
node scripts/generate-sales-teams-postman.js
node scripts/generate-sales-teams-ddl.js
```

The SQL exporter reads definitions/indexes only from the configured migrated MySQL, never credentials/data. Standard Docker build uses the repository Dockerfile; an offline source refresh can reuse the current installed dependency image only after checking its dependency-lock hash matches the repository. No fresh dependency installation is claimed by a cached source refresh.

## Recorded results

Executed on 2026-10-19:

- `TEST_DB_NAME=erp_sales_teams_test npm test`: **103 passed, 0 failed, 0 skipped**, including the full customer/quotation/order suites,18 Sales Teams integration cases and Sales Teams/supporting OpenAPI contracts.
- `npm run check`: **86 JavaScript files** syntax checked.
- Existing frontend Playwright regression suite against isolated MySQL: **13 passed**, covering Customers, Quotations and Sales Orders with the new live-scope/assignment guards.
- Node HTTP demo passed all six Team APIs plus staff lookup and customer/quotation/order reassignment. It observed3 ownership blockers, explicitly resolved them, removed the member and finished the team Active/version6.
- Executable cURL journey passed its customer blocker/transfer/removal/archive/repair/reactivation flow and finished Active/version6. Both HTTP examples used temporary Admin4613 on the isolated database; that server was stopped afterward.
- Main migration006 succeeded without resets; deterministic seed ran twice. The new Export Sales team has3 active members and no integrity warnings. Existing APPAREL provenance remains NULL with explicit legacy warnings.
- Refreshed main Sales4000/Manager4101/Admin4102 readiness and Team GET returned200; Sales Team PATCH returned403. Admin staff lookup returned200. All writer instances were refreshed to current guard code.
- OpenAPI validation includes exactly six Team operations and two separately documented dependencies. Postman contract, `bash -n scripts/sales-teams.curl.sh` and `git diff --check` passed.
- No dependency was added/downloaded for this change. Docker source refresh reused installed dependencies only after its dependency-lock SHA256 matched the repository; no fresh npm install is claimed.

No Sales Teams frontend screens were requested in this supplied backend scope; the complete screen/action/API integration guide is included. User account/role administration and authentication remain outside this module, as documented.
