# Orders > Customers: screen, API and data contract

The Customers screens are implemented in `frontend/src/features/customers` using feature services/hooks, page-level fetching, React Hook Form/Zod, shared MUI components/CSS variables and Redux UI state. See [frontend journeys](../../frontend/docs/customers-journeys.md) for current setup and verification.

| Screen/action | Request under `/api/v1` | Data/state to use |
| --- | --- | --- |
| Expand Orders sidebar | None | Local navigation state |
| `/orders/customers` | GET `/customers?status=Active&page=1&pageSize=20` | `data` summary rows; `meta.total` for pages. ID/code/name/displayName/country/currency/status/team/owner/version; no contact payloads |
| Search/filter/page | Same GET with `q,status,salesTeamId,ownerId,country,currency,page,pageSize,sortBy,sortOrder` | Reset page on filter changes; debounce search; keep previous page while fetching |
| `/orders/customers/new` lookups | Existing GET `/reference-data/quotation-options` | `data.teams`, `data.teams[].members`, `data.company.currencies`; scope is server-controlled |
| Add a contact/address row | None | Local form arrays; do not create records until Save |
| Create Save | POST `/customers`, `Idempotency-Key` | Complete legal/master fields + nested contacts/addresses.201 `data` contains generated code, IDs, version and profile |
| `/orders/customers/:id` | GET `/customers/:id` | Scalar/profile/archive metadata; active children; summary, allowedActions |
| `/orders/customers/:id/edit` | GET `/customers/:id?includeInactiveChildren=true` | Stable IDs for explicit child changes, including deactivation history |
| Save edit | PATCH `/customers/:id` with `version` | Only changed scalar fields and child changes. Response includes inactive children and updated version |
| Primary/default switch | Same PATCH | Send old false + new true together; validate final state locally |
| Archive reason dialog | POST `/customers/:id/archive` | `{version,reason}`;200 Archived profile or409 with safe blocker details |
| Repair archived profile | PATCH, then optional GET | Status stays Archived. Use returned version for next operation |
| Reactivate reason dialog | POST `/customers/:id/reactivate` | `{version,reason}`;422 highlights incomplete master/invalid ownership;200 Active profile |
| Quotations tab | Existing GET `/quotations?customerId=:id&includeRevisions=true&page=1&pageSize=20` | Existing quotation list envelope; do not treat customer blocker examples as full history |
| Sales Orders tab | Existing GET `/sales-orders?customerId=:id&page=1&pageSize=20` | Existing order list envelope and independent document scope |
| Create quotation shortcut | Navigate `/orders/quotations/new?customerId=:id` | No write on navigation. New form loads active buyer/defaults and POSTs quotation only on Save |

The existing reference-data endpoint returns `teams`, `teams[].members` (active user/team membership choices), active buyer/address/contact options and style options. There are no separate users/teams CRUD endpoints in this repository; do not invent routes. The quotation new screen consumes `customerId` to preselect the buyer and current defaults. Archived customers are absent from active reference-data selectors.

## UI composition and request boundaries

Use list filters + paginated table; profile header + contacts/address cards + document tabs; create/edit form sections for company, assignment, contacts and addresses. Use repeatable local contact/address components, a primary radio and default radio per billing/shipping group, and reason dialogs for lifecycle/ownership changes. Buttons follow `allowedActions`, but the backend always rechecks. On archived profiles show archive metadata, Edit and Reactivate when permitted. Do not display revenue/balance/debt cards: those data are outside this module.

Keep Axios calls in `features/customers/services`, TanStack Query hooks in `features/customers/hooks`, and call hooks at page level; presentational form/table/card components take values/callbacks only. Forms use React Hook Form + Zod and submit through page handlers. Store URL filters in query params and transient navigation/dialog state in the established Redux Toolkit UI slice; server data belongs in TanStack Query. Example query keys: `['customers','list',filters]`, `['customers','detail',id,includeInactiveChildren]`. After mutations invalidate customer lists/detail and the existing quotation-options key, because future-document defaults/selectors can change. Independently refresh document history after document actions.

Create one idempotency key per intentional create attempt and retain it with the submitted body while the outcome is unknown. Freeze that submitted payload for a timeout retry. Once success is known, navigate to returned ID and reset the create form/key. Changing payload while reusing a completed key gives409. A fresh key with the same company details creates another buyer by design; there is no email/name deduplication.

Never diff by array index or replace every child with new IDs. Build PATCH from the original detail plus edits: `{id,...changedFields}` for existing rows, full fields without ID for new rows, explicit `isActive:false` and flag false for deactivation. Empty/omitted arrays preserve everything. Removing an unsaved row is local only. Save uses the version loaded with that form; success replaces the form baseline with the returned profile/version. Ownership changes include both target IDs and a reason.

## Journey A: create and start a quotation

1. Open list: GET Active page1. Open New: read existing active team/member lookups; no customer writes yet.
2. Enter legal name, country, currency, payment terms and active assignment. Add one primary contact with email/phone, one default billing, one default shipping (optionally Warehouse B). POST once on Save.
3. Use201 `data.id/code/version`, stable contacts/addresses, and route to profile. GET detail can refresh it.
4. Create quotation navigation preselects this buyer; use active default billing/shipping IDs and parent payment terms/currency as initial form defaults. Quotation POST remains the existing module's separate Save. Staff notes must not be copied to public notes/PDFs.

## Journey B: warehouse change with historical preservation

1. Edit GET includes inactive rows. Add Warehouse B locally if missing, then PATCH the full new row without ID. Save returned B ID/version.
2. PATCH old default A false and B true in one request:

```json
{"version":2,"addresses":[{"id":"<warehouse-a>","isDefault":false},{"id":"<warehouse-b>","isDefault":true}]}
```

3. New quotation form selects B after refreshing reference options. Existing documents remain on their selected address/snapshot. Show: “Default changes apply to future selections. Existing documents keep their selected warehouse.”
4. To deactivate A, send `isActive:false,isDefault:false`;409 ADDRESS_IN_USE means a nondeleted Draft quotation/order still references its billing/shipping ID. Open the authorized blocker and select a replacement through that document's own edit workflow first. Confirmed/frozen uses remain readable and do not block.

## Journey C: resolve blockers then archive

1. Profile `commercialSummary` gives counts/eligibility, maximum20 authorized examples and global blocker count. Open Draft quotation causes `canArchive:false`; the UI can show a reason why archive is unavailable.
2. If archive is attempted after eligibility changed, POST returns409 CUSTOMER_HAS_OPEN_DOCUMENTS. Show `error.details.archiveBlockers`; keep hidden blockers generic when `restrictedBlockers:true`. Global total can exceed visible counts. Never suggest the actor can access a hidden document.
3. Resolve Draft/approved/issued/accepted documents through their existing workflows (accepted conversion produces a Draft order which also needs resolution/confirmation). A stale Issued quotation with `validityEnded:true` still needs its expiry/resolution workflow; archive does not run it.
4. Reload profile/version, archive with reason.200 sets Archived metadata/version; active selectors no longer show buyer. Existing confirmed order fulfilment/history continues. Do not deactivate children automatically.

## Journey D: repair ownership and reactivate

1. Archived buyer remains readable. If assigned owner is inactive, Reactivate returns422 INVALID_TEAM_OWNER; preserve form state and show owner/team fields.
2. Edit assignment with active team/member from lookups. PATCH both `salesTeamId` and `ownerId`, `reason`, and current version. Archived scalar/child repairs are also allowed, provided final contact/default completeness holds.
3. Reactivate with returned version and a reason.200 clears current archive metadata, preserves audit history and makes buyer available to future selectors. Cancelled quotations/orders remain cancelled.

## Loading and failures

| Result | UI behavior |
| --- | --- |
| Loading / empty | Skeleton or inline busy state; explicit no-buyers/no-search-results messages |
| Network/500 | Retry; preserve unsaved input. Create retries keep key and submitted body |
|400 INVALID_REQUEST / MALFORMED_JSON | Fix route/query/request construction; display a useful error |
|401 /403 | Authentication/permission state; never switch role using headers |
|404 | Missing or outside scope; no foreign profile preview |
|409 STALE_VERSION | Offer reload/review of server data; keep unsaved input for comparison; never silent overwrite/retry with a newer version |
|409 ADDRESS_IN_USE / CUSTOMER_HAS_OPEN_DOCUMENTS | Safe links and visible/global counts from `error.details`; generic explanation for restricted records |
|409 IDEMPOTENCY_KEY_REUSED | Review the pending create attempt; do not silently generate another key |
|422 | Bind `error.fields` paths to form inputs; unknown/duplicate child references require reloading/review |
|413 | Body exceeds1MB; reduce payload; local form should cap arrays |

Error envelope is `{error:{code,message,fields?,details?,requestId}}`. Use `requestId` for support correlation. Display user text as text; do not render website/notes as HTML.
