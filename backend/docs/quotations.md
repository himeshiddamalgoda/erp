# Quotations backend

Implemented in the existing JavaScript/Express 5 backend with Sequelize 6, MySQL 8, Zod, decimal.js and PDFKit. No Prisma, frontend, login, email, signing, costing, FX, production, invoice or payment implementation. Existing health/readiness endpoints are preserved. The actual frontend in this repository is Next.js; its files are untouched.

## Run locally

From the repository root:

```sh
cd backend
npm ci
# Preserve the configured .env. Copy .env.example only on a new checkout.
docker compose up -d --wait mysql
npm run migrate
npm run seed
DEV_AUTH_ENABLED=true DEV_ACTOR=sales npm run dev
```

API base: `http://localhost:4000/api/v1`. Seed is development-only and safe to rerun: deterministic `findOrCreate` inserts never overwrite existing master records. It seeds masters, not commercial offers; `demoInput()` and the demo/collection create offers with current company business date, +15-day validity and +45-day delivery. Fixed October 2026 dates in OpenAPI are illustrative only.

Host processes use `DB_HOST` or `127.0.0.1`, and `DB_PORT` or `MYSQL_PORT`. Containers use `mysql:3306`. Existing `DB_NAME/DB_USER/DB_PASSWORD` override `MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD`. Dates/timestamps use company timezone (default `Asia/Colombo`) and UTC storage respectively. Seller heading uses `COMPANY_NAME`. Readiness retains the existing mysql2 pool; quotation operations use a separately managed Sequelize pool. Both close on shutdown.

## Development identity and production integration

The development adapter is opt-in via `DEV_AUTH_ENABLED=true`. `DEV_ACTOR=sales|manager|admin|viewer` selects **one fixed server principal**, not a request header, token or request body field. Its seeded team is fixed. Production startup throws if this adapter is enabled. With it disabled and no trusted authentication middleware, quotation requests return 401.

A real authentication adapter must be installed before the quotation router and set `req.user = { id, role, salesTeamIds }`. `createApp({ principalMiddleware })` is the injection point; upstream identity must be verified server-side. Admin has global scope; SalesManager/Sales/Viewer use trusted team IDs. Sales and Managers can edit authorized team drafts and perform ordinary lifecycle actions. Only Manager/Admin can approve/reject/void; Viewer is read-only. Even Admin cannot approve their own submission. Requests cannot select their actor or role.

Development IDs:

| Master           | UUID                                   |
| ---------------- | -------------------------------------- |
| Salesperson      | `10000000-0000-4000-8000-000000000001` |
| Manager          | `10000000-0000-4000-8000-000000000002` |
| Admin            | `10000000-0000-4000-8000-000000000003` |
| Viewer           | `10000000-0000-4000-8000-000000000004` |
| Apparel team     | `20000000-0000-4000-8000-000000000001` |
| Ocean Apparel    | `30000000-0000-4000-8000-000000000001` |
| Billing address  | `40000000-0000-4000-8000-000000000001` |
| Shipping address | `40000000-0000-4000-8000-000000000002` |
| TS-100 style     | `50000000-0000-4000-8000-000000000001` |

Six variant IDs end in `000001` through `000006` with prefix `70000000-0000-4000-8000-`: Navy S/M/L then White S/M/L. Active customer contacts are selected server-side and snapshotted together; there is no caller-supplied contact ID in this contract. Submission requires at least one active contact with name and email or phone, both addresses, validity, delivery date, payment terms and positive line prices. Draft can omit final commercial fields.

## Runnable happy path

After migrations and seeding, the self-contained HTTP demo starts two local-only backend processes with different fixed principals, captures every returned ID/version, converts, replays the same key, then shuts both down:

```sh
npm run demo
# Optional alternate ports:
DEMO_PORT=4200 npm run demo
```

To run the cURL collection, start two terminals in `backend/`:

```sh
HOST=127.0.0.1 PORT=4100 DEV_AUTH_ENABLED=true DEV_ACTOR=sales npm start
```

```sh
HOST=127.0.0.1 PORT=4101 DEV_AUTH_ENABLED=true DEV_ACTOR=manager npm start
```

Then from a third terminal in `backend/`:

```sh
bash scripts/quotations.curl.sh
# Override SALES_URL / MANAGER_URL for other local ports.
```

This uses real configured fixed development principals, no fake tokens. cURL requires a version supporting `--fail-with-body`. It dynamically captures versions and IDs, retains the conversion key for replay, and prints the returned Draft order identity.

## Exact route contract

All routes below are beneath `/api/v1`. OpenAPI is in `quotations.openapi.yaml` with request/response schemas, binary PDF, realistic examples and error responses. JSON succeeds with `{data:...}`; list adds `meta`. PDF and 204 are exceptions. URL IDs always identify **revisions**.

| Method | Route                            | Behavior                                                                              |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/quotations`                    | Latest nondeleted revision per family by default; `includeRevisions=true` for history |
| GET    | `/quotations/:id`                | Detail, snapshots, lines, audit, linked order, revisions, allowedActions              |
| POST   | `/quotations`                    | New family/revision 1 Draft                                                           |
| PATCH  | `/quotations/:id`                | Draft fields; version required; supplied lines replace entire collection              |
| DELETE | `/quotations/:id`                | Soft-delete Draft with quoted `If-Match` version                                      |
| POST   | `/quotations/:id/submit`         | Draft → PendingApproval; capture snapshots                                            |
| POST   | `/quotations/:id/approve`        | PendingApproval → Approved with separate approver                                     |
| POST   | `/quotations/:id/reject`         | PendingApproval → Draft, reason required                                              |
| POST   | `/quotations/:id/withdraw`       | PendingApproval → Draft, reason required                                              |
| POST   | `/quotations/:id/issue`          | Approved → Issued; supersede old offer atomically                                     |
| GET    | `/quotations/:id/pdf`            | Scoped binary PDF; does not mutate state                                              |
| POST   | `/quotations/:id/buyer-response` | Active Issued → Accepted/Declined                                                     |
| POST   | `/quotations/:id/revisions`      | New Draft copied from latest eligible revision                                        |
| POST   | `/quotations/:id/void`           | Approved/Issued → Cancelled, manager/admin only                                       |
| POST   | `/quotations/:id/convert`        | Accepted → Converted plus one Draft order; idempotency required                       |

List date filters apply inclusively to quotation date. Latest selection occurs before status/customer/team/owner/search/date filtering, so an older Issued revision is hidden by a newer Draft unless history is requested. Search matches quote number or current buyer name using escaped, bound LIKE values. Summary buyer name uses frozen buyer name after submission. Page size max 100, sort fields allowlisted, stable ID tie-breaker. List/detail reads use consistent repeatable-read transactions. Soft-deleted revisions are excluded. `allowedActions` considers trusted role/scope, lifecycle, family lock, separation of duties, current masters, completeness and validity; writes always revalidate under locks.

PATCH omits unchanged fields; `null` clears nullable fields. Replacing lines changes their IDs. Buyers/teams/owner/variants must be active and owner must belong to selected active team. Changing buyer requires replacing/clearing addresses that no longer belong to it. Prices are never derived from an earlier quote. Revisions copy explicitly requested source prices; drafts may then edit them. Requested delivery and validity cannot precede quotation date. Supported currencies are USD/LKR/GBP/EUR, always two decimals. Integer PCS only, 1..1,000,000 per line, max 500 lines. No taxes, discounts or freight. decimal.js computes line and document totals and rejects DECIMAL precision overflow; money is returned as strings. Total quantity is safely bounded to 500 million and returned as a number.

Staff `notes` are internal and deliberately excluded from PDF; no public-notes field exists. Draft documents read current master garment/buyer descriptions. Every other status renders stored submission snapshots. Rejection/withdrawal preserve old snapshots for history until next submission recaptures them. PDF includes all garment rows across pages; nonissued statuses are watermarked. The configured seller name is a heading, not a separate seller master/address integration. PDFKit's built-in Helvetica supports Latin text; production Unicode typography requires a licensed embedded font appropriate to the company's languages.

## Schema and transactions

The configured application database was inspected and had no application tables. The migrations therefore create minimum supporting masters. They refuse unrelated unmanaged tables on a fresh migration run rather than guessing a mapping or overwriting them. All tables use InnoDB/utf8mb4, UUID CHAR(36) keys (except composite member/sequence keys), UTC DATETIME(3), commercial DATE and DECIMAL money. No `sync`, database reset or volume deletion is used.

| Tables                                                 | Relationships and purpose                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `users`, `sales_teams`, `sales_team_members`           | Team manager FK to users; active owner membership composite key                                      |
| `customers`, `customer_contacts`, `customer_addresses` | Buyer owner/team; contacts and typed addresses owned by buyer                                        |
| `styles`, `style_variants`                             | PCS fabric/GSM styles; unique `(style_id,colour,size)`                                               |
| `document_sequences`                                   | PK `(document_type,sequence_year)`; atomic row-locked number allocation                              |
| `quotation_families`                                   | Unique quote number; active/accepted revision and converted-order links                              |
| `quotations`                                           | Family FK; unique `(family_id,revision_no)`; prior revision self-FK; version/status/snapshots/actors |
| `quotation_lines`                                      | Revision FK; style/variant FKs; unique variant and line number within revision                       |
| `sales_orders`, `sales_order_lines`                    | Minimal Draft conversion target; unique source quotation retained after soft deletion                |
| `audit_events`                                         | Polymorphic entity ID, actor FK, append-only application model; actions and request IDs              |
| `idempotency_keys`                                     | Unique `(actor_id,operation,idempotency_key)`, canonical payload hash and saved result               |
| `schema_migrations`                                    | Applied versioned migrations                                                                         |

All commercial/master references use RESTRICT. Snapshots survive master edits. Family → revision/order foreign keys are added in migration 002 after related tables exist. Migration 003 adds role/currency/date/total/version/idempotency CHECKs. Indexes cover team/status/time/ID, buyer/time/ID, expiry status/validity, owner/prior revision, unique line collections, audit traversal and idempotency. Migration/model definitions share column metadata to prevent naming drift; API mappers expose camelCase explicitly.

Write lock order is idempotency reservation (conversion only), family, revision, then relevant masters and sequence/target rows. A new family is allocated its number during the creation transaction before it is exposed to competing requests. Master records are read under shared row locks when eligibility depends on active state. When integrating other master services, those services must update these same InnoDB rows in transactions; use the documented lock order for operations spanning quotations/masters and retry bounded deadlocks. Family revision pointers are checked to belong to the locked family; conversion verifies order linkage. Version checks happen under row locks. Deadlocks/lock timeouts retry the whole transaction at most twice; no external side effects occur in these transactions.

Acceptance fixes one family commercial outcome. Competing drafts remain visible and locked. New revision creation does not invalidate an old issued offer. Replacement issue and response serialize on family lock. Validity includes the entire company-local date; approval/issue check current validity, and acceptance persists expiry independently before reporting 409 if the scheduler was delayed. Accepted agreements may convert after validity. Soft deletion never releases numbers or unique order links.

Conversion reservation, number, order/lines, family/quote version changes, audit and saved response commit together. Identical actor/key/payload replays stored status/body after authorization. Different payload using same key gets 409. Another key returns the already-linked order with 200 before checking stale supplied version, including archived/deleted state. Completed idempotency records currently have no automatic retention purge (`expires_at` remains NULL); optional retention must never remove the unique order-source protection. Audit is append-only through Sequelize hooks and repository APIs; migration needs no SUPER/TRIGGER privileges. Database administrators can further restrict the runtime account to SELECT/INSERT on `audit_events`; raw administrator SQL is outside application enforcement.

MySQL DDL commits implicitly. Apply migrations with one operator; the runner holds a connection-specific advisory lock, records completed migrations and provides reverse-order rollback. Migration 003 tolerates already-added checks after partial failure. Do not run destructive rollback on a production schema containing business data. `npm run migrate:down` reverses the most recent migration; run only when appropriate for the environment. An interrupted initial table migration requires inspecting/restoring that migration before rerunning; the unmanaged-table guard deliberately avoids destructive automatic repair.

## Testing on isolated MySQL

Tests never select a database automatically. `TEST_DB_NAME` is required for integration tests, must end in `_test`, and must differ from the configured application DB. No SQLite substitution. Without it `npm test` explicitly skips the MySQL suite; contract/PDF/readiness checks still run. With it, unreachable MySQL fails tests rather than claiming a pass. Test fixtures persist in the isolated database and subsequent runs use fresh quote IDs. Seed reruns preserve masters; run this suite alone against its dedicated database because it temporarily changes seeded master activation/name fields and restores them.

For this repository's Docker MySQL, provision only the isolated test database and grant the existing application user access (no credential output or global settings changes):

```sh
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE IF NOT EXISTS erp_quotation_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON erp_quotation_test.* TO \`$MYSQL_USER\`@\`%\`;"'
TEST_DB_NAME=erp_quotation_test npm test
npm run check
npm audit
```

Coverage includes the Ocean 1,000 PCS/$5,500 example, validation/scope/separation of duties, edit and resubmission cycles, soft deletion, local midnight/delayed expiry, frozen snapshots, replacement supersession, competing acceptance/issue, version races, concurrent/idempotent conversion, deleted orders, injected line/order/audit rollback, latest-revision filters, PDF content/privacy and a 500-line multipage PDF. The Swagger parser validates exactly 15 documented operations. Production startup refusal for development authentication is tested in a separate process.

## Docker and scheduler

```sh
# Existing production-style Compose: adapter disabled; authenticated upstream integration is required.
docker compose run --rm --no-deps backend npm run migrate
# Development seed needs an explicit development environment for this one-off command:
docker compose run --rm --no-deps -e NODE_ENV=development backend npm run seed
# Rebuild to package the new backend; preserve the existing MySQL volume.
docker compose up --build -d backend
# Dev-only Compose API with fixed sales principal:
NODE_ENV=development DEV_AUTH_ENABLED=true DEV_ACTOR=sales docker compose up --build -d backend
```

Build the new image **before** one-off commands if the currently built image predates this module: `docker compose build backend`. Compose forwards quotation configuration explicitly. The Docker image keeps `NODE_ENV=production` by default; enabling development identity without changing NODE_ENV fails intentionally. Never delete the existing MySQL volume to apply migrations.

Schedule `npm run expire` repeatedly, for example every minute from a host cron with the working directory/environment set:

```cron
* * * * * cd /absolute/path/to/erp/backend && /absolute/path/to/node src/jobs/expire-quotations.js
```

Or invoke `docker compose run --rm --no-deps backend npm run expire` from a scheduler. This adds no HTTP endpoint and is safe to repeat or overlap. The job logs only the number expired, and audits use NULL system actor.

## UI event integration

| UI event                                             | API behavior                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Expand Orders sidebar                                | No API                                                                                 |
| Click Quotations                                     | GET list                                                                               |
| Search/filter/paginate                               | GET same list with query parameters                                                    |
| Create                                               | Open form; POST on Save                                                                |
| Edit                                                 | GET detail, PATCH on Save with current version                                         |
| Delete                                               | Confirmation modal, DELETE with `If-Match: "version"`                                  |
| Save & submit                                        | Save first; only after success submit using returned version                           |
| Detail                                               | GET detail; show only returned allowedActions                                          |
| Approve/reject/withdraw/issue/response/revision/void | Named action POST with version; use returned detail (revision creates a new ID)        |
| Download PDF                                         | Require success + application/pdf before downloading; display JSON errors              |
| Convert                                              | Retain same Idempotency-Key/body for retries; navigate to returned `data.salesOrderId` |
| 409 STALE_VERSION                                    | Keep unsaved input, explain conflict and offer reload; never silently overwrite        |

Successful writes include committed audit history and new version. Errors use `{error:{code,message,fields?,requestId}}`, with generated `X-Request-Id` response header. 400 is malformed input/query/header, 401 no trusted principal, 403 role/self-approval restriction, 404 missing/out-of-scope, 409 lifecycle/concurrency/idempotency conflict, 422 field validation, 500 sanitized unexpected errors.

## Postman collection

Import [the quotation collection](postman/quotations.postman_collection.json) and [local environment](postman/local.postman_environment.json). The collection covers all 15 operations with complete happy-path and alternative lifecycle folders, dynamic dates, saved revision IDs/versions, PDF checks and idempotent conversion retries. See [Postman setup and run instructions](postman/README.md) for the separate Sales/Manager development servers.

## Frontend reference data

The quotation frontend uses `GET /api/v1/reference-data/quotation-options` to load its form prerequisites. This is a separate read-only lookup endpoint; the quotation resource still has 15 operations. It requires the same trusted principal as quotations and returns `{ data: { actor, company, customers, teams, styles } }`. `actor` contains the authenticated ID, display name, role and team IDs. `company` contains the business date, timezone and supported currencies. Buyers include active contacts and typed addresses; teams include active members; active PCS styles include active colour/size variants. Buyer and team visibility follows the actor's team scope, with global access for Admin. Inactive actors receive no lookup access. The frontend never supplies an actor or role header to this endpoint.

See [frontend setup, screen mapping and tests](../../frontend/README.md).
