# Quotation testing guide

This guide follows the implemented frontend and backend. It explains what to click, which request the page sends, which response fields populate the screen, and how to judge the result. Examples use seeded Ocean Apparel master data. Dates and quotation/order numbers are examples: use the current company business date and the IDs/versions returned by your server.

## 1. Open the test workspace

- Frontend: http://localhost:3000/orders/quotations
- Sales API base: http://localhost:4000/api/v1
- Manager API base, if started: http://localhost:4101/api/v1
- Backend readiness: http://localhost:4000/api/ready

`/api/v1` is a prefix, so opening that URL alone can return route not found. Use `/api/v1/quotations` for the resource.

### Enable the two local actors

The Sales backend must use these **backend** environment variables:

```ini
DEV_AUTH_ENABLED=true
DEV_ACTOR=sales
```

Restart the Sales backend after environment changes. For a second backend, run from `backend/`, against the same development database:

```sh
PORT=4101 DEV_AUTH_ENABLED=true DEV_ACTOR=manager npm start
```

In **frontend** `.env.local`:

```ini
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_MANAGER_API_URL=http://localhost:4101
NEXT_PUBLIC_ENABLE_DEMO_WORKSPACES=true
```

Restart `npm run dev` in `frontend/`. The header then offers **Sales workspace** and **Manager workspace**. This selector connects to two different servers; it does not send actor headers. It is available only in development. A Sales user cannot approve their own submitted quote; use the separate Manager identity.

If ports 3000, 4000 and 4101 are already serving the configured applications, use those running instances rather than launching duplicates. For database setup, see [backend setup](../../backend/docs/quotations.md).

### Watch the actual API calls

1. Open browser developer tools, select **Network**, then **Fetch/XHR**.
2. Turn on **Preserve log** and filter for `quotations` or `quotation-options`.
3. Open a request and inspect its URL/method, Payload, Response and status.
4. Keep the latest returned `data.id`, `data.familyId`, `data.version` and `data.status` in your test notes.

Lookup data can be served from the TanStack cache for 60 seconds. Opening a tab or choosing an already loaded buyer/style does not necessarily send a request. `OPTIONS` requests are normal CORS preflights. After a successful action, a follow-up detail GET is normal. These are not duplicate writes.

## 2. Screen -> API -> displayed data

All API paths in this guide are relative to the selected API base above.

| Screen / area                              | Initial API call                                                                            | Returned data used by the screen                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Header and shared choices                  | `GET /reference-data/quotation-options`                                                     | `data.actor.displayName`, `role`; `company.businessDate`, `timezone`, `currencies`; `customers`, `teams`, `styles`     |
| List `/orders/quotations`                  | `GET /quotations?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&includeRevisions=false` | `data[]` is the row list; `meta.page`, `pageSize`, `total` control pagination                                          |
| Three list statistic cards                 | Three list GETs with `pageSize=1` and `status=Draft`, `PendingApproval`, `Issued`           | Each response's `meta.total`; these are workspace counts, not totals of the current visible page                       |
| New `/orders/quotations/new`               | Lookup GET, if not already cached                                                           | Buyer/team/owner/address/style/variant choices and current company date. No quotation POST until a save button is used |
| Edit `/orders/quotations/{id}/edit`        | `GET /quotations/{id}` plus cached/fetched lookups                                          | Editable fields, `lines[]`, `version`; master data supplies dropdown labels and choices                                |
| Detail `/orders/quotations/{id}`: Overview | `GET /quotations/{id}` plus cached/fetched lookups                                          | Quote number, revision, status, dates, terms, lines, totals, buyer response, team/owner labels                         |
| Detail: Revisions tab                      | No separate revisions GET                                                                   | Uses `data.revisions[]` from the detail response; opening another revision fetches that revision's detail              |
| Detail: Activity tab                       | No separate audit GET                                                                       | Uses `data.audit[]` from the detail response                                                                           |
| Detail: Journey sidebar                    | No separate journey GET                                                                     | Uses created/submitted/approved/issued/buyer-response timestamps, `salesOrderId`, `status`                             |
| Detail: linked order summary               | No separate sales-order GET                                                                 | Uses detail `data.linkedOrder`                                                                                         |

### Exactly where form choices come from

| Form control       | Source                                                    | When a choice changes                                                                          |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Buyer              | `customers[].id`, `name`, `code`                          | Copies the selected buyer's currency, team, owner, payment terms and default addresses locally |
| Sales team         | `teams[].id`, `name`                                      | Recalculates allowed owner choices locally                                                     |
| Quotation owner    | Selected team's `members[]`                               | Sends selected owner's ID when saved                                                           |
| Billing / shipping | Selected buyer's `addresses[]`, filtered by `addressType` | Saves address IDs, not the displayed address text                                              |
| Buyer contact hint | Selected buyer's `contacts[]`                             | Displayed locally; contact must be valid in master data before submission                      |
| Currency           | `company.currencies[]`                                    | Does not convert existing prices                                                               |
| Style              | `styles[].id`, `code`, `name`, `fabricDescription`, `gsm` | Resets dependent colour/size choices                                                           |
| Colour and size    | Selected style's `variants[]`                             | Only active combinations are offered; no extra variant API call                                |

Draft detail buyer/contact/address information comes from `draftBuyer`. Submitted offers display `customerSnapshot`, `billingAddressSnapshot` and `shippingAddressSnapshot`, preserving the submitted commercial details. Totals returned by the server are authoritative; the unsaved form shows a decimal-based preview.

## 3. Journey A: create -> submit -> approve -> issue -> accept -> convert

Use a fresh quotation so previous terminal states do not block the test.

### A1. Enter a complete offer as Sales

Open **New quotation**. Select:

| Field              | Test value                                      |
| ------------------ | ----------------------------------------------- |
| Buyer              | Ocean Apparel - OCEAN                           |
| Sales team         | Apparel Sales, selected from buyer defaults     |
| Owner              | Demo Sales                                      |
| Currency           | USD                                             |
| Quotation date     | Current date supplied by `company.businessDate` |
| Valid until        | Business date + 15 days                         |
| Requested delivery | Business date + 45 days                         |
| Billing / shipping | Ocean Apparel's corresponding default addresses |
| Payment terms      | 30% advance; 70% before shipment                |
| Internal notes     | QA test - internal packing instructions         |

Add these six garment lines, all using **TS-100 - Cotton T-shirt**, unit price **5.50**:

| Colour | Size | Quantity | Expected line total |
| ------ | ---- | -------: | ------------------: |
| Navy   | S    |      200 |            1,100.00 |
| Navy   | M    |      200 |            1,100.00 |
| Navy   | L    |      100 |              550.00 |
| White  | S    |      200 |            1,100.00 |
| White  | M    |      200 |            1,100.00 |
| White  | L    |      100 |              550.00 |

**Expected:** six distinct variants, **1,000 PCS**, **USD 5,500.00**. Selecting buyers/styles or typing lines changes local form state; it does not save to the API.

### A2. Save a Draft, inspect it, then submit

Click **Save draft**. Expect `POST /quotations`, **201**. The page navigates to the new quotation detail.

Example create body (one line shown; include all six rows to reproduce the totals above):

```json
{
  "customerId": "30000000-0000-4000-8000-000000000001",
  "salesTeamId": "20000000-0000-4000-8000-000000000001",
  "ownerId": "10000000-0000-4000-8000-000000000001",
  "currency": "USD",
  "quotationDate": "2026-10-16",
  "validUntil": "2026-10-31",
  "requestedDeliveryDate": "2026-11-30",
  "billingAddressId": "40000000-0000-4000-8000-000000000001",
  "shippingAddressId": "40000000-0000-4000-8000-000000000002",
  "paymentTerms": "30% advance; 70% before shipment",
  "notes": "QA test - internal packing instructions",
  "lines": [
    {
      "styleId": "50000000-0000-4000-8000-000000000001",
      "colour": "Navy",
      "size": "S",
      "qty": 200,
      "unitPrice": "5.50"
    }
  ]
}
```

Replace example dates with current valid dates and take IDs from your own lookup response if master data differs. Prices are decimal **strings**; quantities are whole **numbers**. Do not send computed totals, status, quote number, actor fields or line IDs in editable payloads.

The response is `{ "data": { ...quotationDetail } }`. Check `id`, generated `quoteNumber`, `revision`, `status: "Draft"`, `version`, six `lines`, `totalQty: 1000` and `total: "5500.00"`.

Click **Submit for approval**, then confirm. The page sends:

```http
POST /quotations/{id}/submit
Content-Type: application/json

{"version": 1}
```

Use the actual latest version, not always `1`. Expect **200**, `status: "PendingApproval"`, updated `version`, submission timestamps, frozen snapshots and an audit entry. The status badge reads **Pending approval** and editing is unavailable during review.

**Alternative:** **Save & submit** on the form performs the create/update first, then `/submit` with the returned version. A new quote therefore sends **two POSTs to different endpoints**. If submission fails after a successful save, the existing Draft remains available for correction; retry must not create a second quote.

### A3. Approve as Manager

Switch to **Manager workspace** while viewing the same quotation ID. The server URL changes to port 4101; detail is refreshed for that actor.

Click **Approve quotation**. Optionally enter review comment `Pricing checked`, then confirm:

```http
POST /quotations/{id}/approve

{"version": 2, "comment": "Pricing checked"}
```

Expect **200**, `status: "Approved"`, updated version, `approvedAt`, `approvedBy` and an Activity entry. The approve button is available only when the backend includes `approve` in `allowedActions`. The submitting actor must not approve their own submission.

### A4. Issue as Sales and download the PDF

Switch back to **Sales workspace**. Click **Issue quotation**, then confirm:

```http
POST /quotations/{id}/issue

{"version": 3, "channel": "manual"}
```

Expect **200**, `status: "Issued"`, updated version and `issuedAt`. This records manual issuance; it does not send an email.

Click **Download PDF**. Expect `GET /quotations/{id}/pdf`, **200**, `Content-Type: application/pdf`, and a downloaded file such as `QT-2026-0002-R1.pdf`.

Open the PDF: confirm buyer, garments, quantities, prices, totals, terms and offer status. Internal notes must be absent. PDF download does not change the quotation version or status.

### A5. Record the buyer's acceptance

Click **Record buyer response**. Select **Accepted**, enter reference `Buyer email - acceptance confirmed`, then **Record acceptance**:

```http
POST /quotations/{id}/buyer-response

{"version": 4, "decision": "Accepted", "reference": "Buyer email - acceptance confirmed"}
```

Expect **200**, `status: "Accepted"`, `buyerDecision`, `buyerResponseReference`, `buyerResponseAt`, updated version and an Activity entry. Other competing Drafts in the family become locked. The UI records evidence of the buyer response; it does not provide a buyer login or send the buyer a message.

### A6. Convert the accepted quote

Click **Convert to sales order**, then **Create Draft order**:

```http
POST /quotations/{id}/convert
Idempotency-Key: <generated unique key>
Content-Type: application/json

{"version": 5}
```

Expect **201** for initial creation. The response is `{ "data": { ...orderSummary } }`, **not quotation detail**. It includes order `id`, `salesOrderId`, `orderNumber`, `status: "Draft"`, source quotation fields, currency and totals. A same-key replay returns the stored original status/body; retrieving an already linked order through a new valid key can return **200**.

The page subsequently refreshes quotation detail. Check `status: "Converted"`, `salesOrderId` and `linkedOrder.orderNumber`, with `linkedOrder.status: "Draft"`, `totalQty: 1000`, `total: "5500.00"`. There is one linked Draft order. The sidebar is a summary; a full Sales Orders screen is not implemented.

## 4. Journey B: edit -> conflict -> reload -> delete

Use a different Draft; a converted offer cannot be edited or deleted as a Draft.

1. Open the Draft and click **Edit draft**. Expect detail GET plus lookups if uncached. Existing fields and `version` populate the form.
2. Change notes or a quantity and click **Save draft**. Expect `PATCH /quotations/{id}` with editable data and the latest `version`. Expect **200**, recalculated totals and an increased version. If lines are supplied, they replace the line collection; include the complete desired set.
3. To test a conflict, open the same Draft in two tabs. Load both before editing. Save a change in tab A, then enter different unsaved notes and save in tab B without reloading.
4. Tab B should receive **409**, error code `STALE_VERSION`. Its unsaved notes remain visible. Click **Reload latest version**, then confirm **Reload latest**. Expect a detail GET; tab B now displays the saved tab A data.
5. Save another edit if desired. On detail, use **More quotation actions -> Delete draft -> Delete draft**.
6. Expect `DELETE /quotations/{id}` with header `If-Match: "<latest version>"`, no JSON body, and **204** with no response body. The list opens; the deleted item is absent, and a direct detail GET returns **404**.

Only use a disposable Draft for deletion. Leaving an edited form through its Cancel/Back or workspace navigation shows an unsaved-change confirmation; **Keep editing** should retain the entered values.

## 5. Journey C: revision -> replacement issue -> decline -> revise -> void

Prepare a fresh quotation through **Issued**, using A1-A4. Do not accept it.

1. On the Issued detail, choose **More quotation actions -> Create revision**. Enter reason `Buyer requested a quantity change`, then **Create new Draft**.
2. Expect `POST /quotations/{originalId}/revisions` with `{ "version": <current>, "reason": "Buyer requested a quantity change" }`, **201**. The response is the **new Draft detail**. It has a **new id**, the **same familyId and quoteNumber**, a higher `revision`, and `priorRevisionId` pointing to its predecessor. The editor opens for the new ID.
3. Check the original detail: it is still **Issued**. Creating a replacement Draft alone must not supersede the original.
4. Edit the replacement if desired. **Save & submit** sends PATCH then submit POST using the returned version. Approve as Manager; issue as Sales.
5. After replacement issuance, its status is **Issued** and the old offer becomes **Superseded**. Open **Revisions** to inspect both. This tab reads the detail response's `revisions[]`; it has no dedicated GET endpoint.
6. On the new Issued quote, click **Record buyer response -> Declined**. Enter reference `Buyer email` and reason `Requested delivery is too late`; click **Record decline**.
7. Expect `POST /quotations/{newId}/buyer-response` with `version`, `decision: "Declined"`, `reference` and `reason`; **200**, status **Declined**. Overview displays decision/reference/reason; Activity records it.
8. Create another revision from the Declined offer, submit it and approve as Manager. While it is **Approved**, choose **More quotation actions -> Void quotation**, enter reason `Offer withdrawn`, and confirm.
9. Expect `POST /quotations/{latestId}/void` with `version` and `reason`; **200**, status **Cancelled**. No sales order should have been created by this journey.

Record each revision ID separately. A revision number identifies an offer within the family; `version` is the concurrency counter for changes to that individual offer.

## 6. Journey D: withdraw / reject -> correct -> resubmit

Start with another **Pending approval** quote.

| Actor / UI action                          | API body                                                                                           | Expected result                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Sales: More actions -> Withdraw submission | `POST /quotations/{id}/withdraw`, `{ "version": <current>, "reason": "Buyer changed quantities" }` | **200**, Draft; Edit draft becomes available |
| Sales: correct Draft and save              | `PATCH /quotations/{id}`, edited fields plus version                                               | **200**, saved Draft with updated version    |
| Sales: Submit for approval                 | `POST /quotations/{id}/submit`, `{ "version": <current> }`                                         | **200**, PendingApproval                     |
| Manager: More actions -> Reject submission | `POST /quotations/{id}/reject`, `{ "version": <current>, "reason": "Please review prices" }`       | **200**, Draft; rejection reason in Activity |
| Sales: correct and resubmit                | PATCH, then submit POST                                                                            | Same revision follows another review cycle   |

Withdrawal and rejection return the same revision to Draft. They do not create a new revision or a sales order.

## 7. List, validation and recovery checks

| Test                                | How to trigger it                                             | Expected API / screen behavior                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Search                              | Enter quotation number or `Ocean`; press Enter or search icon | List GET adds `q`; typing alone does not submit the search                                                                              |
| Filter by status                    | Click Drafts / Pending approval / Issued, or advanced Status  | List GET adds `status`; page resets to 1                                                                                                |
| Buyer / team / owner / date filters | Use dropdowns and Filters panel                               | List GET adds `customerId`, `salesTeamId`, `ownerId`, `fromDate`, `toDate` as selected                                                  |
| Sort / pagination                   | Change sort or page controls                                  | List GET changes `sortBy`, `sortOrder`, `page`, `pageSize`                                                                              |
| Show revisions                      | Enable checkbox                                               | List GET has `includeRevisions=true`; historic rows become eligible                                                                     |
| Latest-family filtering             | Leave Show revisions off                                      | Selects latest visible revision per family before applying status filters; original Issued rows can disappear when a newer Draft exists |
| Invalid quantity                    | Enter 0 or 1.5                                                | Field error; invalid form is blocked before a write request                                                                             |
| Invalid price                       | Enter negative price or more than 2 decimal places            | Field error; no save request                                                                                                            |
| Duplicate garment                   | Add same style/colour/size twice                              | Duplicate variant error; combine quantities into one line                                                                               |
| Incomplete commercial terms         | Clear payment terms/dates/addresses or set price 0            | Save draft can succeed; Save & submit requires complete valid commercial data                                                           |
| Expired validity                    | Set validity before current business date                     | Submit is blocked. An expired Issued offer cannot accept a new buyer response; backend rules remain authoritative                       |
| Missing reason / reference          | Leave required action-dialog fields empty                     | Dialog field errors; no action request                                                                                                  |
| Role restrictions                   | View Pending approval as its submitting Sales actor           | No Approve action; server checks still apply to direct API requests                                                                     |
| API unavailable                     | Stop a test backend or block its URL in DevTools              | Error with retry path; unsaved form input remains available on failed save                                                              |
| Mobile                              | Use 390px-wide device view                                    | Sidebar opens/closes; table scroll stays inside table container; page itself has no horizontal overflow                                 |

The list statistic cards count Draft, PendingApproval and Issued items across the actor's workspace, not just matching rows in the current filter. Lookup data contains active records only; old snapshots can still display names/addresses that no longer appear among editable choices.

### Response shapes to recognize

```json
{
  "data": [
    {
      "id": "<revision UUID>",
      "familyId": "<family UUID>",
      "quoteNumber": "QT-2026-0002",
      "revision": 1,
      "status": "Draft",
      "customerName": "Ocean Apparel",
      "currency": "USD",
      "totalQty": 1000,
      "subtotal": "5500.00",
      "total": "5500.00",
      "version": 1
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

This list example shows selected fields only. Detail/create/PATCH/most action responses use a single object under `data`. Detail additionally includes editable fields, `lines[]`, snapshots, `draftBuyer`, `revisions[]`, `audit[]`, `allowedActions[]`, timestamps, `familyLocked` and `linkedOrder`.

A detail line includes `styleId`, `styleCode`, `styleName`, `fabric`, `gsm`, `colour`, `size`, `qty`, decimal-string `unitPrice` and `lineTotal`. Displayed money comes from these decimal strings, not floating-point API values.

The important exceptions are **conversion** (order summary), **PDF** (binary), and **DELETE** (204 empty).

Errors use an `error` object with `code`, `message`, `fields` and `requestId`. **422** commonly means invalid form/commercial data, **409** a stale version or lifecycle/family conflict, **401** missing/invalid principal, **403** authorization failure, and **404** unavailable resource. Exact codes depend on the rule violated. Use the returned field messages and request ID when reporting a failure.

### Conversion retry after a lost response

This is covered by the automated browser journey: the test lets the backend commit the order, then replaces the first successful response with a simulated 503. The UI keeps the dialog open with an error. Retrying must send the **same Idempotency-Key and original accepted version**, even if a later detail refresh shows Converted. The replay returns the same order, and no second order is created. Simply taking the browser offline before clicking does not reproduce a committed-but-lost response.

## 8. Run the automated checks

From the repository root:

```sh
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
TEST_DB_NAME=erp_quotation_test npm --prefix frontend run test:e2e
TEST_DB_NAME=erp_quotation_test npm --prefix backend test
```

The test database must already be separately provisioned, migrated and seeded; follow [test setup](../README.md#verification). The Playwright configuration starts fixed Sales/Manager test APIs on ports **4310/4311** and routes browser traffic there. It creates fixtures in the `_test` database, not in the normal development database. If a Next server on port 3000 is reused, it must have the demo selector variables shown in section 1. Install Chromium once with `npx playwright install chromium` from `frontend/`.

The four browser tests correspond to journeys A-D: full happy path including lost-response conversion retry; stale edit/reload/deletion; revision/supersession/decline/void; and withdrawal/rejection. The first also verifies PDF bytes and mobile navigation. Screenshots and failure traces are under ignored `frontend/test-results/`.

## 9. Record a test result

For each journey, record: date, actor, quotation number, family ID, each revision ID, starting/ending status, latest version, HTTP statuses, order number if converted, and pass/fail. For failures, attach the observed screen, request method/URL, sanitized payload/response and `requestId`. Expected totals for the six-line example are 1,000 PCS and USD 5,500.00; if you change quantities during a revision, recompute your expected total.
