# Sales Orders: screen/API and journey testing guide

The Sales Orders frontend is now implemented. Open Orders -> Sales orders at http://localhost:3000/orders/sales-orders. See the [frontend testing guide](../../frontend/docs/sales-order-testing-guide.md) for actual controls, recovery behavior and browser tests. HTTP demos and Postman remain available.

## Prepare the actors

- Sales: backend port 4000 with `DEV_AUTH_ENABLED=true`, `DEV_ACTOR=sales` in its backend environment.
- Manager: another local backend against the same DB, `PORT=4101 DEV_AUTH_ENABLED=true DEV_ACTOR=manager npm start`.
- No acting-user headers are accepted. In production trusted middleware supplies the actor.
- Apply migrations, seed the existing masters, optionally `npm run seed:orders`. See [backend setup](sales-orders.md).
- Base path is `/api/v1`. Opening that prefix alone is not a resource URL.

The frontend follows the quotation structure: feature Axios services, separate TanStack hooks called by page controllers, RHF/Zod forms, Redux for UI state, shared theme tokens/CSS Modules. Use the existing Next.js routes, not a second Vite application. An operational revision is a document amendment of the **same order**, unlike quotation revisions that receive separate quote revision IDs.

## Screen -> request -> response fields

| Screen or interaction           | API call                                                        | Data displayed / submitted                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders sidebar expand           | None                                                            | Navigation state only                                                                                                                        |
| `/orders/sales-orders`          | GET `/sales-orders`                                             | `data[]` row summaries, `meta` pagination; order number, buyer, PO, source, delivery, status, hold, amount, version, allowedActions          |
| Search/filter/paginate          | GET collection with changed query                               | q searches number/buyer snapshot/PO; source, onHold, status, buyer/team/owner, delivery range, page/pageSize and sorting                     |
| `/orders/sales-orders/new`      | GET existing `/reference-data/quotation-options`, if not cached | Real buyer defaults, contacts, typed addresses, teams/members, active styles/variants, currencies and business date                          |
| Save new direct Draft           | POST `/sales-orders` + Idempotency-Key                          | Editable header and full line inputs; 201 `data:OrderDetail`                                                                                 |
| `/orders/sales-orders/:id`      | GET `/sales-orders/:id`                                         | Header, source quote reference, frozen snapshots, line IDs/specifications, totals, documentRevision, version, hold, handoff and fulfilment   |
| `/orders/sales-orders/:id/edit` | GET detail + lookups                                            | Direct Draft shows editable commercial fields; converted Draft displays frozen commercial fields and edits only permitted operational fields |
| Save Draft edit                 | PATCH detail                                                    | `{version,...editableFields}`; complete lines replace collection only for direct Drafts                                                      |
| Delete Draft                    | DELETE detail + `If-Match: "<version>"`                         | Confirmation first; 204 empty; return to list                                                                                                |
| Confirm                         | POST `/:id/confirm` + Idempotency-Key                           | `{version,comment?}`; 200 detail, revision 1 and Queued handoff                                                                              |
| Cancel / Close                  | POST `/:id/cancel` or `/:id/close`                              | Version and required cancellation reason / optional closure comment                                                                          |
| Hold / Resume                   | Corresponding POST action                                       | Version and required reason; Confirmed status remains unchanged                                                                              |
| Operational amendment modal     | POST `/:id/revisions` + Idempotency-Key                         | Version, reason, buyerReference, nonempty changes limited to delivery/shipping/publicNotes; 201 `{data:{order,revision}}`                    |
| Revisions tab                   | GET `/:id/revisions?page=1&pageSize=20`                         | Immutable `snapshot`, revision, reason, buyerReference, creator/time; separate paginated endpoint                                            |
| Activity tab                    | GET `/:id/activity?page=1&pageSize=20`                          | Action, actor, time, reason, from/to status, safe metadata; optional action filter                                                           |
| Delivery tab                    | GET `/:id/fulfilment`                                           | Each line's ordered/delivered/remaining; aggregate totals, handoff, latestEvents, source demo/integration                                    |
| Download latest                 | GET `/:id/pdf` as blob                                          | Current Draft or latest immutable document; safe attachment filename                                                                         |
| Download old revision           | GET `/:id/pdf?revision=1` as blob                               | Revision-1 snapshot with current hold/cancellation and superseded indicator                                                                  |

The Revisions/Activity/Delivery tabs use dedicated endpoints. Do not assume they are included as full histories in detail. Master lookups do not save anything; changing form selections is local until Save. Opening a PDF does not mutate the order.

## Sample input and returned data

Use Ocean Apparel, team Apparel Sales, owner Demo Sales, USD, default billing/shipping, current company order date and PO date, a future delivery date, and PO `OA-1045` (choose a different PO if already active for that buyer).

| Style  | Colour | Size | PCS | Unit price | Line total |
| ------ | ------ | ---- | --: | ---------: | ---------: |
| TS-100 | Navy   | S    | 200 |       5.50 |    1100.00 |
| TS-100 | Navy   | M    | 200 |       5.50 |    1100.00 |
| TS-100 | Navy   | L    | 100 |       5.50 |     550.00 |
| TS-100 | White  | S    | 200 |       5.50 |    1100.00 |
| TS-100 | White  | M    | 200 |       5.50 |    1100.00 |
| TS-100 | White  | L    | 100 |       5.50 |     550.00 |

Expected **1,000 PCS / USD 5,500.00**. Prices/totals are strings; quantities are whole numbers. Do not send totals, order numbers, acting identities, document revisions, statuses or sourceQuotationId in direct create.

A detail line exposes `id`, `lineNo`, `variantId`, `styleId`, `styleCode`, `styleName`, `fabric`, `gsm`, `colour`, `size`, `uom`, `qty`, `unitPrice`, `lineTotal`. Use the order line ID for fulfilment fixtures; a variant ID is not an order line ID.

A Draft starts with `version:1`, `documentRevision:0`, `status:"Draft"`, `isOnHold:false`. Confirmation makes documentRevision 1; holds/resumes/delivery change `version` but do not create document revisions. An amendment increases both counters. Always take the next mutation's version from the latest relevant response/GET, not from an assumed sequence.

## Journey A: accepted quotation -> converted order -> delivery -> closure

1. Use the existing quotation journey to create, submit, approve, issue and record acceptance. Convert with the existing `POST /quotations/:id/convert` plus its version and Idempotency-Key.
2. The response remains an order summary. Record its returned order ID and GET `/sales-orders/{id}` to inspect the full order.
3. As Sales, PATCH the Draft with buyerPoNumber, buyerPoDate, requestedDeliveryDate, optional shippingAddressId/publicNotes/internalNotes and current version. Do not send buyer, currency, billing, terms, garment/price/qty, ownership or other frozen fields, even unchanged.
4. Manager POST `/confirm` with returned version, optional comment and a new stable attempt key. Expect Confirmed, documentRevision 1, exactly one Queued handoff. Accepted quote snapshots remain unchanged.
5. Run `npm run demo:fulfilment -- <order-id> partial`. GET fulfilment: PartiallyDelivered, first line partially delivered, others still remaining, source demo.
6. Run `npm run demo:fulfilment -- <order-id> complete`. GET detail/fulfilment: Delivered, every remainingQty 0.
7. Manager POST `/close` using latest version. Expect Closed. This confirms operational completion only; no invoice/payment settlement is asserted.
8. Confirm the quotation remains Converted throughout and its historical order link is unchanged.

## Journey B: direct Draft -> manager review -> confirmation

1. Sales creates the six-line direct order with a unique active PO. Retain the create key and body. Expect 201, sourceQuotationId null, 5500.00, 1000 PCS.
2. Edit PO, dates, notes, terms or full lines with PATCH/version. Omitted fields stay unchanged. All supplied lines replace the entire Draft collection atomically.
3. Manager reviews buyer PO, primary contact, addresses, delivery, price and terms. POST confirm with version and its own persisted attempt key. There is no PendingApproval status or submit/approve pair.
4. Inspect revision 1 and the queued handoff. PATCH commercial content now returns 409. Follow A5-A7 for delivery/closure.

Current runnable entry point: `npm run demo:orders` or `bash scripts/sales-orders.curl.sh` creates and confirms a direct order and also performs Journey C. These run real writes against the configured development database. Test fixtures should use a separate `_test` database.

## Journey C: hold -> amend -> resume

1. Start from a Confirmed order, Queued/unclaimed handoff, no fulfilment events.
2. Manager POST hold `{version,reason}`. Expect status still Confirmed, isOnHold true. Worker cannot claim it.
3. POST revisions with Idempotency-Key and this shape (replace version/date/address as needed):

```json
{
  "version": 3,
  "reason": "Buyer changed delivery instructions",
  "buyerReference": "Buyer email reference",
  "changes": {
    "requestedDeliveryDate": "2026-12-05",
    "publicNotes": "Deliver grouped by colour"
  }
}
```

4. Expect 201, same order ID/number/status, documentRevision 2, incremented version, unchanged prices/quantities/buyer, preserved hold flag, queued payload revision 2.
5. GET revisions: both immutable documents exist. Download `pdf?revision=1`: original content, marked superseded; PDF excludes internal notes.
6. Manager POST resume with the returned `data.order.version` and reason. Expect isOnHold false, hold metadata cleared from active detail but retained in activity. Handoff becomes eligible for dispatch; production has not automatically started.
7. If worker claimed first, amendment/hold/cancel returns 409; do not reset the handoff or silently retry with different commercial data.

## Journey D: cancel safely and preserve history

1. Create a separate disposable Draft; Manager POST cancel with version/reason. Expect Cancelled.
2. Repeat on a queued Confirmed order (held or unheld). Expect Cancelled order and Cancelled handoff, hold cleared, revision history retained.
3. The cancelled/deleted order's PO may now be reused for that buyer. The source quotation link remains unique forever; cancellation/deletion does not allow reconversion or restore quotation editability.
4. On an order with ProductionStarted/ShipmentPosted/DeliveryConfirmed activity or a Claimed/Dispatched/Failed handoff, cancellation must fail with CANCELLATION_BLOCKED. No partial cancellation should occur. A wider external change-control process is outside these APIs.

## Journey E: per-line completion and guarded close

1. Confirm a fresh order. GET fulfilment: deliveredQty 0, remainingQty 1000, all six lines incomplete.
2. Post a shipment fixture with CLI: delivered quantities remain zero. Shipment is not delivery.
3. Apply a partial delivery fixture. One size's progress must not satisfy another size. Check each line's own remainingQty.
4. Before every line is complete, Manager close returns 409 DELIVERY_INCOMPLETE. Attempting to overdeliver one line is 422 and changes nothing.
5. Apply the complete fixture, which submits only each line's remaining quantity. Status becomes Delivered even if no artificial InProgress event was posted first.
6. Close with the latest GET detail version. Expect Closed and one closure audit event. New fulfilment after Closed is rejected; exact repeated external event identities are deduplicated.

## Frontend failure/retry behavior

- Render actions using allowedActions, with server authorization on every request.
- Disable duplicate action clicks while a request is pending.
- For create/confirm/amend: persist key and original body/version together; unknown-outcome retries reuse both. An old confirmed replay returns its saved response, so refresh detail to display current state afterward.
- For `409 STALE_VERSION`, preserve entered form values and show explicit Reload/review. Do not silently fetch a new version and overwrite the server.
- For 422, map `error.fields` to RHF fields and retain user entries. For action conflicts, show error.code/message and requestId.
- Use a blob for PDF success; parse JSON errors rather than saving them as .pdf.
- Full commercial revisions, public integration event endpoints, shipment CRUD, invoice/payment operations and live production stopping are outside this POC.

## Test result checklist

Record actor/API base, order ID/number, source quote ID if any, start/end status, version, documentRevision, handoff status, hold state, six line totals and delivered/remaining values, HTTP status/error codes, requestId for failures, PDF revision and pass/fail. Use a distinct PO for independent active orders.
