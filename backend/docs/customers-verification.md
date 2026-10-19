# Customers testing guide

Read [screen/API mapping and journeys A–D](customers-ui-integration.md) for each screen's request, response fields, component behavior and errors. The integrated frontend is documented in [Customers frontend journeys](../../frontend/docs/customers-journeys.md). Use [Postman](postman/customers.postman_collection.json), [OpenAPI](customers.openapi.yaml) or the executable Node/cURL examples below.

## Local setup and principal

Run commands from `backend/` unless shown otherwise. Reuse the existing MySQL and `.env`; see [migration/adoption notes](customers.md#run-with-the-existing-mysql). Migration005 is additive and must run before using this module. Seed base data first, then optionally the repeatable customer example:

```sh
npm run migrate
npm run seed
NODE_ENV=development npm run seed:customers
```

On legacy installations, the migration asks for explicit attribution rather than inventing historical creator metadata. The seeded demo Admin can explicitly own the adoption operation:

```sh
CUSTOMER_MIGRATION_ACTOR_ID=10000000-0000-4000-8000-000000000003 npm run migrate
```

Start an Admin development instance in a separate terminal:

```sh
HOST=127.0.0.1 PORT=4102 NODE_ENV=development DEV_AUTH_ENABLED=true DEV_ACTOR=admin npm start
```

Use `http://127.0.0.1:4102/api/v1` for the Postman collection. It has six ordered requests: List, Create, Detail, PATCH warehouse switch, Archive, Reactivate. Create captures ID/version/warehouse IDs; each detail/mutation refreshes version. Keep the collection `idempotencyKey` for retries; change it only for a new intentional buyer. Existing Sales4000/manager4101 can read permitted buyers but cannot write this module by default. No auth token or role header exists in this POC. Development auth is refused in production.

Stable seed IDs:

| Entity | UUID |
| --- | --- |
| Buyer | `30000000-0000-4000-8000-000000000002` |
| Contact | `60000000-0000-4000-8000-000000000002` |
| Billing | `40000000-0000-4000-8000-000000000003` |
| Warehouse A | `40000000-0000-4000-8000-000000000004` |
| Warehouse B | `40000000-0000-4000-8000-000000000005` |
| Team / owner | `20000000-0000-4000-8000-000000000001` / `10000000-0000-4000-8000-000000000001` |

The generated seed code depends on the sequence (normallyCUS-000001 on the initial existing demo). Repeating seed never overwrites edits, restores archived state or duplicates rows. Existing quotation fixture `OCEAN` and its two addresses are preserved.

Quick reads:

```sh
curl -sS 'http://127.0.0.1:4102/api/v1/customers?status=Active&page=1&pageSize=20'
curl -sS 'http://127.0.0.1:4102/api/v1/customers/30000000-0000-4000-8000-000000000002?includeInactiveChildren=true'
```

Run one intentional new buyer through all six APIs, replay, warehouse swap, archive, archived edit and reactivate; IDs/versions are captured from real responses:

```sh
npm run demo:customers
# Equivalent six-operation cURL script (Node + curl + jq):
bash scripts/customers.curl.sh
# Override target when using an isolated test server:
ADMIN_API_URL=http://127.0.0.1:4612/api/v1 npm run demo:customers
```

Each script creates a separate example; these are writes. The cURL script accepts a retained `CUSTOMER_CREATE_KEY` for resuming the same create attempt. The Node script is a complete new demo run each time, not a retry client.

## Manual acceptance checks

| Check | Steps and expected result |
| --- | --- |
| A · Create | Use collection Create with required legal/master fields + one primary + default billing/shipping.201 with uniqueCUS-code/version1. Same key/payload returns identical201/ID; changed payload conflicts409 |
| B · Warehouse | Get edit detail; PATCH A false/B true with current version.200, same IDs, one version increment; existing documents unchanged |
| C · Archive blocked | Create Draft quotation for buyer through existing quotation Save. Archive409 CUSTOMER_HAS_OPEN_DOCUMENTS; examples link to visible document. Resolve through existing quote lifecycle, reload and archive again. Accepted conversion leaves Draft order blocker until confirmation/resolution |
| D · Repair/reactivate | Archive unblocked buyer. With inactive owner, Reactivate422 INVALID_TEAM_OWNER. PATCH both active assignment IDs+reason, then Reactivate with new version.200 Active, archive fieldsnull, history retained |
| Address in use | Reference billing/shipping ID from Draft quotation or order. Add replacement, try old deactivate/defaultfalse + new defaulttrue.409 ADDRESS_IN_USE. Change/resolve the Draft first; retry with refreshed version |
| Snapshot preservation | Confirm an order using Warehouse A. Change master text/default to B, or deactivate A after replacing default. Old confirmed order detail/PDF retains frozen address/customer/terms. Fulfilment still permitted after customer archive |
| Primary replacement | PATCH old contact primaryfalse/isActivefalse + full new primary contact. Old ID remains in includeInactiveChildren=true; normal detail hides it |
| Stale/no-op | Send two edits with same version; one200, other409 STALE_VERSION. An empty/id-only changeset with current version returns unchanged version; stale no-op still409 |
| Boundaries | Unknown/protected code/status/actors422; foreign/duplicate child IDs422; no primary/default422; immutable address type422; malformed query/UUID/JSON400; oversized body413 |
| Scope | Sales/manager/viewer GET allowed within teams; write403. Foreign team profile404/listempty. Restricted blockers give global count and no forbidden IDs/numbers; visible examples max20 |

Do not use raw database mutations as application lifecycle steps. Integration fixtures may construct historical states to exercise defensive checks, but application journeys must use the existing lifecycle APIs. Stale Issued quotations resolve via quotation expiry/resolution; archive does not expire them. The existing `npm run expire` job runs company-wide expiry and is not a per-customer UI endpoint.

## Isolated MySQL integration suite

Create a **new, separate** database ending in `_test`. Do not reset an existing database or erase volumes. From repository root, the following shell reads the container's existing root credential internally without printing it:

```sh
docker compose -f backend/compose.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot' <<'SQL'
CREATE DATABASE IF NOT EXISTS erp_customers_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON erp_customers_test.* TO 'erp'@'%';
SQL
cd backend
TEST_DB_NAME=erp_customers_test npm test
npm run check
```

Use the appropriate configured application username if it differs from `erp`. Tests refuse a name without `_test` or the configured application database. They append isolated fixtures, serialize test files sharing seed masters, use real MySQL generated constraints and locking, and never force-sync/drop/reset data. No SQLite replacement. Existing old test databases containing incomplete legacy fixture masters may fail migration preflight; use a fresh isolated test database or explicitly repair the reported fixtures.

Customers tests cover nested validation, slot swaps, stable IDs/no-op semantics, injected rollback failures, optimistic concurrency, concurrent code/idempotency creation, every open quotation blocker status, stale expiry/nonlatest revisions, Draft order blockers, resolved/deleted documents, confirmed snapshots, active-owner repair, assignment/document independence, role/team scope, restricted/capped metadata, literal wildcard search, malformed requests, and parent-lock races. Existing quotation/order suites run alongside it. See actual run results below; never infer passing checks from this list alone.

## Recorded verification

Executed locally on 2026-10-19:

- `TEST_DB_NAME=erp_customers_test npm test`: **81 passed, 0 failed, 0 skipped** across all backend contracts, Customers, Quotations, Sales Orders and readiness tests.
- `npm run check`: **67 JavaScript files** syntax checked.
- All six APIs exercised over HTTP using `npm run demo:customers` and `bash scripts/customers.curl.sh` against a temporary Admin server on4612 with the isolated database. Node journey finished Active/version5 (includes archived repair); cURL journey finished Active/version4. The temporary server was stopped afterward.
- Existing main database migration succeeded without resetting data; stable demo seed was repeated and tested for unchanged rows/IDs/counts. Historical attribution is explicitly documented in `CustomerMigrated` audit.
- Main Sales4000, manager4101 and Admin4102 readiness/list checks returned200; Sales customer PATCH returned403 FORBIDDEN; an oversized JSON request returned413 PAYLOAD_TOO_LARGE.
- OpenAPI validation and six-request Postman/captured-variable checks passed. `bash -n scripts/customers.curl.sh` and `git diff --check` passed.
- The Docker backend was refreshed using its cached installed dependencies after matching the dependency-lock hash. No fresh npm dependency download/build is claimed; no dependencies were added. Frontend checks are recorded separately in the frontend journey guide.

The temporary HTTP examples intentionally added fixtures only to the isolated test database. Local Admin4102 remains available for manual Postman testing.
