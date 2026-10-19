# Customers screens and API journeys

Open **Orders → Customers** at `http://localhost:3000/orders/customers`.

The implementation uses the existing Next.js/React application, MUI components, shared CSS variables, Axios feature services, page-owned TanStack Query hooks, React Hook Form with Zod/resolver validation, and Redux Toolkit for workspace/navigation/dirty-form state. No new package is required. Server data stays in query caches scoped by backend URL and customer ID; inactive-inclusive detail has a separate cache key.

## Local testing access

The existing Sales4000 and Manager4101 instances read permitted customer data. Customer master writes need Admin or a trusted `customers:write` capability; assignment changes additionally need `customers:assign`. UI permissions use the server-provided actor and `allowedActions`; the backend rechecks every action.

In `frontend/.env.local`:

```ini
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_MANAGER_API_URL=http://localhost:4101
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4102
NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES=true
```

Run the Admin development server from `backend/`:

```sh
HOST=127.0.0.1 PORT=4102 NODE_ENV=development DEV_AUTH_ENABLED=true DEV_ACTOR=admin npm start
```

Run `npm run dev` from `frontend/`, then choose **Admin workspace** in the header for create/edit/archive/reactivate. A full browser reload resets the development workspace to Sales; select Admin again when resuming a create retry. The pending attempt remains isolated to the original backend/actor. Demo workspace URLs do not send actor/role headers and are disabled in production. Production uses the actual authenticated upstream principal on its configured backend.

## Screens and requests

| Screen / action | Request under `/api/v1` | Response use |
| --- | --- | --- |
| Expand Orders | None | Redux navigation state |
| Customer list `/orders/customers` | GET `/customers` with default Active/page1/pageSize20; existing GET `/reference-data/quotation-options` | Summary rows with code/name/status/country/currency/team/owner; `meta.total` for pagination; active lookups and actor permissions |
| Search/filter/sort | Same list API, URL parameters | Debounced name/code search; Active/Archived/All, country/currency/team/owner filters; reset page on changes; allowlisted sort + direction |
| New `/orders/customers/new` | Existing reference-data GET, no customer write until Save | Active team/member and configured country/currency options |
| Add contact/address | None | Local form state; max50 active/500 stored,100 changes per save |
| Create Save | POST `/customers` with retained `Idempotency-Key` | Generated code, stable child IDs, profile/version; navigate to profile |
| Profile `/orders/customers/:id` | GET `/customers/:id` | Current profile, active children, bounded counts/blockers, archive metadata, allowedActions |
| Show inactive children | GET detail with `includeInactiveChildren=true` | Historical child rows, stable IDs and inactive badges |
| Edit `/orders/customers/:id/edit` | GET detail including inactive children + lookups | Frozen form baseline/version for changeset generation |
| Save changes | PATCH `/customers/:id` | Only changed parent fields and explicit child changes. Omitted/empty children preserved; exactly one version increment if changed |
| Archive / Reactivate | POST `/customers/:id/archive` or `/reactivate`, `{version,reason}` | Refresh profile/status; retain reason/edits on failure; visibility-filtered409 blockers |
| Quotations tab | Existing GET `/quotations?customerId=:id&includeRevisions=true` | Paged, independently scoped document history; fetched only when tab selected |
| Sales orders tab | Existing GET `/sales-orders?customerId=:id` | Paged order history; fetched only when selected |
| Create quotation shortcut | Navigate to `/orders/quotations/new?customerId=:id` | Preselects active buyer/team/owner, currency, terms and default billing/shipping. No quotation is created until its own Save |

Reference-data now returns `company.countries` and a whitelisted `actor.capabilities` list for the form/policy. Owner choices come from `teams[].members`. No new lookup endpoint was introduced.

## Journey A — new buyer

1. Select Admin workspace → Orders → Customers → New customer.
2. Enter legal name, configured country, default currency and terms. Choose an active team/member.
3. Enter primary contact name and email/phone. Complete default billing/shipping addresses. Parent country fills only blank address-country fields; it does not overwrite existing address countries.
4. Save. The page calls POST once with one key, then opens returned profile ID.
5. Create quotation shortcut initializes active defaults. Internal customer notes remain internal and do not enter quotation public content.

If create times out or returns500 after an unknown outcome, the form is held unchanged and shows **Retry original create**. The submitted body/key are retained in browser session storage and memory; reload, reselect Admin, and retry the original attempt. It never silently generates a new key after an unknown outcome. Successful replay opens the same customer. Known validation errors unlock the form for correction. An idempotency conflict remains held for review rather than automatically creating a second buyer.

## Journey B — primary contact and warehouse change

1. Edit customer; existing children retain UUIDs. Add another contact/address locally.
2. Selecting a new primary or shipping/billing default explicitly clears the old flag within that type and sets the new flag. Save submits both changes atomically.
3. To retire a saved row, uncheck Active; the form clears its primary/default flag. Choose a replacement before saving. Existing rows are retained; only unsaved local rows have Remove.
4. New quotations use the new defaults. Existing document snapshots/selected warehouses remain unchanged.
5. ADDRESS_IN_USE shows Draft quotation/order links and retains unsaved rows. Blocker links open in another tab from editor/reason dialogs so the current form/reason stays available. Resolve/reselect the referenced Draft address through its own workflow, then retry the unchanged version if no customer mutation occurred.

## Journey C — archive with blockers

1. Profile shows scoped open quotation/Draft/active order counts and maximum20 authorized blocker examples. Hidden dependencies are generic; global blocker count remains authoritative.
2. Archive is offered only when returned `allowedActions` permits it. If a new document appears after profile load, the server can still return409 from the reason dialog. The dialog preserves its reason and shows authorized links.
3. Resolve relevant quotations/Draft orders, refresh profile and archive with a reason. Children remain intact, active selectors exclude the buyer, and confirmed fulfilment/history remains available.

## Journey D — archived repair/reactivation

1. Edit the archived profile; the banner explains Save keeps Archived status.
2. Repair contacts/defaults or select an active assignment. Changing either owner/team requires both target IDs plus ownership reason. Ordinary archived repairs can retain old inactive ownership temporarily; reactivation cannot.
3. Save, then Reactivate with the returned profile version and a reason.422 explains repair needs; cancelled documents stay cancelled.

## Stale, unsaved and failure states

Editor baseline/version is captured when the form mounts; background GETs never silently replace that version.409 STALE_VERSION preserves input and offers **Reload and review server data**, followed by an explicit discard confirmation. Reason dialogs also require an explicit refresh before a stale retry. Field errors bind to form paths; loading/empty/retry/not-found/permission states are included. Browser unload, shell navigation and workspace changes warn on dirty forms.

Archive/reactivate and PATCH do not automatically retry mutations. If an action times out, refresh/review current state; a repeated old version safely conflicts. The Axios normalizer retains safe `error.details` for blockers and correlation request IDs. No financial balance/revenue aggregates are invented.

## Verification commands

Provision/migrate/seed an isolated MySQL database as described in [backend verification](../../backend/docs/customers-verification.md). From `frontend/`:

```sh
npm run lint
npm test
npm run build
TEST_DB_NAME=erp_customers_test npm run test:e2e
```

Playwright starts isolated Sales4310/Manager4311/Admin4312 servers and redirects browser API traffic to those servers; its fixtures do not write to the main database. Tests cover all Customers screens, primary/default changes, create replay after reload, stale edit preservation, Draft blocker/address-in-use recovery, Sales read-only access, mobile layout, and quotation defaults. Existing quotation/order browser journeys run in the same suite.

## Recorded verification — 2026-10-19

- Production build and ESLint passed.
- Frontend unit/component tests: **68 passed**, including stable child changesets, permission rules, create-attempt retention, query/service contracts, and search focus/reset behavior.
- Full browser suite: **13 passed** (5 Customers journeys plus existing Quotation and Sales Order journeys). The list/search/read-only/mobile case was rerun after the final search-focus adjustment and passed.
- Backend regression suite: **81 passed, 0 skipped**; syntax check passed for67 JavaScript files. The reference-data contract test verifies configured countries and the whitelisted master-data capabilities.
- Desktop and390px mobile profile screenshots were inspected; the mobile page has no horizontal overflow. The Browser connection was unavailable, so verification used the project's installed Playwright/Chromium test runner.
- Main Sales4000, Manager4101 and Admin4102 servers returned200 readiness and current lookup metadata. All four Customers routes returned200 on the existing frontend3000 server.
- No dependencies were added. Backend services were refreshed with the cached dependency image after verifying the dependency lock; no fresh npm installation is claimed.
