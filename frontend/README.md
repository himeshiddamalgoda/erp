# Orders frontend

Next.js App Router with Material UI, Axios, TanStack Query, Redux Toolkit, React Hook Form and Zod. Open `/orders/quotations` or `/orders/sales-orders`; `/` redirects to Quotations.

## Start locally

Use Node.js 22.13+ on the 22.x line or Node.js 24+. Install dependencies separately in `backend` and `frontend`.

```sh
cd frontend
npm ci
# First setup only; preserve existing local configuration.
cp .env.example .env.local
npm run dev
```

The API must be running with migrations and seed data applied. See [backend setup](../backend/docs/quotations.md). For the Sales development principal, put `DEV_AUTH_ENABLED=true` and `DEV_ACTOR=sales` in **backend** `.env`, then restart the backend (rebuild the container after source changes). Never put these variables in the browser environment. They are development authentication settings, not shell commands.

```ini
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

An origin or a URL ending in `/api/v1` is accepted. `/api/v1` itself is a prefix, not a resource; the list is `GET /api/v1/quotations`. Public variables are included at build time. Do not place secrets in them. Restart Next after changes.

### Test manager approval locally

The backend determines the actor. The frontend does not send role or actor impersonation headers. Optionally start a second local backend against the same development database:

```sh
cd backend
PORT=4101 DEV_AUTH_ENABLED=true DEV_ACTOR=manager npm start
```

Enable the development-only selector in `frontend/.env.local` and restart Next:

```ini
NEXT_PUBLIC_MANAGER_API_URL=http://localhost:4101
NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES=true
```

Select Sales to create/submit, Manager to approve/reject, then Sales to issue and record the buyer response. Each choice connects to its respective server. The selector is disabled in production builds. In production, integrate trusted authentication middleware on the backend and configure the matching browser credentials/token flow; this implementation does not add a login system.

## Screens and API journeys

All paths below are relative to `/api/v1`.

| Screen or action              | API                                     | Outcome                                                                                                     |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Quotation list                | `GET /quotations`                       | URL-backed search, status/buyer/owner/date filters, sorting, pagination, include revisions                  |
| New quotation                 | `POST /quotations`                      | Create Draft with real buyer defaults and garment variants                                                  |
| Details                       | `GET /quotations/:id`                   | Current version, server-authorized actions, snapshots, revisions and activity                               |
| Edit Draft                    | `PATCH /quotations/:id`                 | Version-checked updates; conflicting edits preserve unsaved input                                           |
| Delete Draft                  | `DELETE /quotations/:id`                | Soft-delete after confirmation                                                                              |
| Submit                        | `POST /quotations/:id/submit`           | Draft → Pending approval                                                                                    |
| Manager approval              | `POST /quotations/:id/approve`          | Pending approval → Approved                                                                                 |
| Manager rejection             | `POST /quotations/:id/reject`           | Return to Draft with reason                                                                                 |
| Withdraw                      | `POST /quotations/:id/withdraw`         | Return pending submission to Draft with reason                                                              |
| Issue                         | `POST /quotations/:id/issue`            | Record manual issue; replacement can supersede prior offer                                                  |
| Buyer response                | `POST /quotations/:id/buyer-response`   | Record acceptance or decline with evidence reference                                                        |
| Revise                        | `POST /quotations/:id/revisions`        | Create a new editable Draft; original remains until replacement is issued                                   |
| Void                          | `POST /quotations/:id/void`             | Cancel eligible offer with reason                                                                           |
| Convert                       | `POST /quotations/:id/convert`          | Accepted offer → one linked Draft sales order                                                               |
| PDF                           | `GET /quotations/:id/pdf`               | Download backend-generated offer PDF                                                                        |
| Form prerequisites / identity | `GET /reference-data/quotation-options` | Active scoped buyers, contacts, addresses, teams, owners, styles, variants, actor and company business date |

The read-only reference-data endpoint was added because quotation editing requires master data and a trusted actor identity. There are still exactly 15 quotation operations. The sales order is shown as a linked summary; the Sales Orders workspace opens from the linked order number. Other future modules are visibly disabled.

Drafts may have unfinished commercial terms or zero prices. Save & submit additionally requires complete terms, addresses, dates, a contact and positive prices. The server remains authoritative for eligibility, totals, snapshots and authorization. Save & submit is two requests: if submission fails after saving, the same saved Draft is retained for correction and retry.

Conversion keeps its idempotency key and accepted quotation version in session storage, scoped by API URL, actor and quotation. After a lost response, retry reuses the exact original request. Mutations never retry automatically. Quote PDFs are checked for a PDF response before download; JSON errors are displayed instead of saved as PDF files.

## Structure and boundaries

```text
src/
  app/                        Next routes, layout and global CSS
  components/layout/          Responsive application shell
  components/ui/              Shared status/loading/error/empty UI
  constants/                  API configuration, routes, status/action definitions
  features/quotations/
    services/                 Axios quotation API functions
    hooks/                    TanStack queries, mutations and cache keys
    schemas/                  Zod draft/submission/action validation
    components/               Presentational UI and React Hook Form forms
    pages/                    Page controllers: queries, mutations, navigation
  features/reference-data/    Separate lookup service and query hook
  lib/                        Shared Axios, query client and Material UI theme
  providers/                  MUI App Router cache, theme, Redux and query providers
  store/                      Redux Toolkit store and UI slice
  styles/                     Semantic CSS variables and shared theme tokens
  utils/                      Formatting, payload mapping, errors, filters and downloads
```

Only page controllers invoke feature API hooks. Presentational components receive data and callbacks. Hooks delegate HTTP work to feature services, which use the shared Axios client. ESLint and an architecture test enforce the component boundary. Queries are scoped by API URL so local Sales and Manager caches cannot leak across workspaces.

TanStack Query owns server state. Redux owns UI state (navigation, workspace, notices and unsaved-edit guard); it does not duplicate quotation responses. React Hook Form owns form state and field arrays. Zod resolvers validate before submission, and backend field errors map back to fields. Money previews use decimal arithmetic and exact string formatting. Dates use company business dates for commercial rules.

Styles use CSS Modules and semantic custom properties in `src/styles/variables.css`; `tokens.js` supplies the same palette to Material UI. Components provide accessible labels, keyboard controls, loading/error/empty states and responsive layouts. Wide garment tables scroll inside their own container on small screens. The app uses a locally bundled Inter font.

## Manual journey testing

See the [quotation testing guide](docs/quotation-testing-guide.md) for screen-to-API mapping, sample input, returned fields, four step-by-step journeys and expected results.

## Verification

```sh
cd frontend
npm run lint
npm test
npm run build
npm start
```

Unit/component tests cover validation, decimal totals, HTTP contracts, PDF errors, stale edits, action forms, idempotency retention and the page/component boundary.

Browser tests use a **separate**, provisioned MySQL database ending in `_test`. They create persistent fixtures there; they do not reset or write to the development database. Provision the database and grant the application DB user access, then:

```sh
cd backend
DB_NAME=erp_quotation_test npm run migrate
DB_NAME=erp_quotation_test npm run seed
cd ../frontend
npx playwright install chromium
TEST_DB_NAME=erp_quotation_test npm run test:e2e
```

The Playwright configuration starts Sales and Manager test APIs on ports 4310 and 4311. Browser requests are routed to those APIs. If reusing an existing Next development server, start it with `NEXT_PUBLIC_API_URL=http://localhost:4000`, `NEXT_PUBLIC_MANAGER_API_URL=http://localhost:4101` and `NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES=true`. Tests exercise six garment lines, approval, PDF bytes, acceptance, conversion after a lost response, stale edits, deletion, revision/supersession, decline, void, withdrawal, rejection and mobile navigation. Screenshots and failure traces are written to ignored `test-results/`.

## Sales Orders frontend

The Sales Orders list, direct Draft create/edit, converted Draft editor and detail screens integrate all 15 Sales Orders APIs. Detail includes Overview, Delivery, Revisions and Activity, plus role-aware confirm/hold/resume/amend/cancel/close/delete dialogs. View immutable document snapshots and download selected revision PDFs.

See [screen/API mapping and testing journeys](docs/sales-order-testing-guide.md). Feature services/hooks/pages/components/schemas live in `src/features/sales-orders`; shared form controls and the garment editor live in `src/components/forms`. Existing Redux, theme tokens, Axios and query providers are reused. Pages own API hooks; components only consume data and callbacks.

Create/confirm/amendment retain the original key and body for uncertain-outcome retries. Direct and quotation-converted Drafts have different editable fields; the latter never sends frozen commercial fields. Quotation detail links to the converted order, which links back to the source quotation.

## Customers

Customers list/create/profile/edit screens are available under **Orders → Customers**. All six Customers APIs are integrated, including nested contacts/addresses, archive/reactivate reason dialogs, scoped commercial history, blocker recovery, create idempotency and version conflicts. See [screen/API journeys and test setup](docs/customers-journeys.md). Add `NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4102` with development workspaces enabled and run an Admin backend on4102 for local master-data writes. Sales/manager customer access stays read-only. Production uses its authenticated backend principal.

## Sales teams

Sales Teams list/create/profile/edit screens are available under **Orders → Sales teams**. They integrate all six team APIs, existing staff lookup and explicit assignment transfers. Profile tabs show customers, every quotation revision and sales orders; membership history, blocker recovery, archive/reactivate, stale versions and durable create retries are supported. See [screen/API mapping and testing journeys](docs/sales-teams-journeys.md). Use the development Admin workspace for team management; production uses backend capabilities and current team scope.
