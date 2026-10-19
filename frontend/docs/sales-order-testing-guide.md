# Sales Orders frontend guide

Open **Orders -> Sales orders** at http://localhost:3000/orders/sales-orders. The frontend integrates all 15 Sales Orders operations and retains the existing quotation screens. Expand Orders to move between the two workspaces. A quotation's linked order number now opens its Sales Order detail, and the order links back to its source quotation.

## Local setup

Follow [single-backend setup](single-backend-setup.md). Sales, Manager and Admin use one backend on port4000 and the header selector changes the development session. No Manager/Admin API URL variables or extra backend processes are required. Production uses trusted authentication.

## Screens and API requests

Paths below are relative to `/api/v1` on the selected backend.

| Screen / control                  | Request                                                                                         | Data used / result                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sales orders list                 | GET `/sales-orders`                                                                             | Rows from `data[]`, pagination from `meta`; number, buyer/PO, source, status/hold, delivery, quantity, amount |
| Statistic cards                   | List GETs with Confirmed / onHold=true / Delivered and pageSize=1                               | Workspace counts from `meta.total`, independent of current list filters                                       |
| Search and filters                | GET collection with q/status/source/onHold/buyer/team/owner/delivery range/sort/page parameters | Press Enter/search icon to apply text; other controls update the URL and fetch results                        |
| New direct order                  | Existing GET `/reference-data/quotation-options` (cached)                                       | Real buyer defaults, addresses, contacts, teams/owners, active styles/variants, currencies, business date     |
| Save new direct Draft             | POST `/sales-orders` + Idempotency-Key                                                          | Create once; returned ID opens detail                                                                         |
| Edit Draft                        | GET `/sales-orders/:id`, then PATCH with version                                                | Full direct Draft editing; converted Draft sends only six allowed operational fields                          |
| Delete Draft                      | DELETE detail + quoted If-Match version                                                         | Confirmation dialog; soft-delete, 204, return to list                                                         |
| Order Overview                    | GET detail plus cached lookups                                                                  | Snapshots, PO/dates, garments/totals, notes, source reference, handoff and per-line fulfilment summary        |
| Confirm order                     | POST `/:id/confirm` + version/comment + Idempotency-Key                                         | Manager confirmation, document R1, queued handoff                                                             |
| Hold / Resume handoff             | Corresponding POST + version/reason                                                             | Keeps Confirmed status; changes orthogonal hold flag                                                          |
| More order actions -> Amend order | POST `/:id/revisions` + Idempotency-Key                                                         | Reason, buyer reference and changed delivery/shipping/public notes; same order ID and new document revision   |
| Cancel order                      | POST `/:id/cancel` + version/reason                                                             | Eligible Draft or queued Confirmed -> Cancelled; preserves commercial history                                 |
| Close order                       | POST `/:id/close` + version/comment                                                             | Fully Delivered -> Closed; does not assert payment settlement                                                 |
| Delivery tab                      | GET `/:id/fulfilment`                                                                           | Ordered/delivered/remaining per line, latest events, clearly labeled demo/integration source                  |
| Revisions tab                     | GET `/:id/revisions` with pagination                                                            | Immutable documents; expand View snapshot to inspect buyer-visible contents                                   |
| Activity tab                      | GET `/:id/activity` with pagination/optional action filter                                      | Actor/system timeline, reasons and status transitions                                                         |
| Download PDF                      | GET `/:id/pdf` as blob                                                                          | Latest document; Draft watermark if unconfirmed                                                               |
| Download R1/R2 from Revisions     | GET `/:id/pdf?revision=n` as blob                                                               | Historical frozen snapshot with current hold/cancellation indicators                                          |

Only page controllers invoke API hooks. Reusable components receive props/callbacks. Axios lives in feature services; TanStack Query owns server data, Redux owns UI state, and React Hook Form/Zod own forms. Shared form controls and garment-line editing use shared styles; Sales Orders feature styles use the existing semantic CSS variables.

## Journey 1: direct order -> confirm -> hold -> amend -> resume

1. Select **Sales workspace**, open **New direct order** and select Ocean Apparel. Team, owner, currency, addresses and terms fill from real master data.
2. Enter a unique buyer PO such as OA-1045 (use another if already active), current company PO date, and a delivery date 45 days after the order date.
3. Add six TS-100 rows at 5.50: Navy S 200/M 200/L 100 and White S 200/M 200/L 100. Check **1,000 PCS / USD 5,500.00**. Buyer-visible notes appear on PDFs; internal notes do not.
4. **Save draft** opens detail. Saving incomplete commercial details or zero prices is allowed in a Draft; a manager must resolve them before confirmation.
5. Switch to **Manager workspace**, click **Confirm order**, add an optional review comment and confirm. Check Confirmed, Document R1, Queued handoff. Sales cannot confirm.
6. Click **Hold handoff**, enter a reason and confirm. Status remains Confirmed; the separate On hold badge and reason appear.
7. Under **More order actions**, choose **Amend order**. Enter a reason and buyer reference; change delivery date, shipping or buyer-visible notes. Check Document R2 and preserved hold. Commercial prices/quantities cannot be amended here.
8. Open **Revisions**, expand each snapshot and download R1/R2. Original content stays in R1. Open **Activity** to verify confirmation, hold and amendment entries.
9. **Resume handoff**, give a reason. Check the hold clears while the handoff stays Queued. It has not automatically started production.

## Journey 2: converted quotation -> restricted Draft editing

1. Follow the [quotation journey](quotation-testing-guide.md) through acceptance and conversion.
2. Click the linked sales order number on quotation detail. On Sales Order detail, click **Edit draft**.
3. Buyer, currency, billing, terms, garments, quantities and prices display read-only. Edit buyer PO/date, requested delivery, shipping address, buyer-visible notes or internal notes.
4. Save, switch to Manager, then confirm. Original accepted commercial terms remain preserved. The source quote link opens the original quotation.

## Journey 3: delivery and closure

1. Use a disposable Confirmed order with no hold. Open **Delivery**; every line initially has zero delivered and full remaining.
2. There is no public button/API for manufacturing delivery events. In a backend terminal, against the same development database, run:

```sh
npm run demo:fulfilment -- <order-id> partial
```

3. Click **Refresh workspace**. Check Partially delivered and the individual size's remaining quantity. Shipment events do not count as delivery. Close order is unavailable until all lines are complete.
4. Run `npm run demo:fulfilment -- <order-id> complete`, then refresh. Check Delivered and zero remaining for every line.
5. As Manager click **Close order**, optionally comment, and confirm. Check Closed and its Activity entry. The delivery feed is labeled Demo when supplied by these fixtures.

## Journey 4: conflict, cancellation and deletion

- Open the same disposable Draft in two tabs. Save an edit in A, then save different input in B without refreshing. B shows **This sales order has changed** and retains the input. **Reload latest version -> Reload latest** explicitly replaces it with saved server data.
- Leaving a dirty editor through Cancel/Back, sidebar navigation or workspace selection prompts before discarding changes.
- On a disposable Draft, **More order actions -> Delete draft** removes it from lists; its direct GET returns 404.
- A manager may **Cancel order** for a Draft or safely queued Confirmed order, with a reason. Existing source quotation links/revisions remain historical; conversion is not reversed.
- Once a handoff has been claimed or activity started, hold/amend/cancel options disappear; direct requests are still guarded by the server.

## Safe recovery after an uncertain write

Create, confirm and amendment attempts retain the original idempotency key **and complete body/version**, scoped by API backend, actor, order and operation. If a timeout/5xx occurs, a **Retry original request** control sends the exact same request. Pending create recovery also survives reload when session storage is available. Fields/actions are locked during that unresolved attempt so a changed payload cannot silently become a duplicate order or amendment. A definitive validation/conflict response releases the attempt for correction. Automatic mutation retries remain disabled.

To reproduce a committed-but-lost response reliably, use the browser test: it commits a real test order, substitutes a 503 response, reloads the page and checks that retry has the same key/body and returns the same order. Taking the browser offline before the request is sent does not prove this case.

## Automated verification

Use a separately provisioned, migrated and seeded MySQL database ending in `_test`; never use the normal development database for these tests.

```sh
cd frontend
npm run lint
npm test
npm run build
TEST_DB_NAME=erp_sales_orders_test npm run test:e2e
```

Playwright starts separate Sales/Manager test APIs on 4310/4311 and routes browser API requests there. Test fixtures accumulate in the isolated DB; the normal workspace is untouched. If a Next server is reused on port 3000, start it with the development selector values above. The suite exercises both quotation and Sales Orders journeys. Sales Orders browser tests cover all 15 API bindings across the journeys, actual PDF bytes, converted-field protection, delivery CLI fixtures, stale edits, dirty navigation, unknown-outcome retry and mobile layout. Screenshots/failure traces are written to ignored `test-results/`.
