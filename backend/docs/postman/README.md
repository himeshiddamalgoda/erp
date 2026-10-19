# Test quotations in Postman

Import both files with **Postman → Import → Files**:

- `quotations.postman_collection.json`
- `local.postman_environment.json`

Select **Garment ERP — Local development** in the environment selector. All values are development URLs and deterministic seed IDs; no credentials or tokens are included.

## Prepare the backend

From `backend/`, preserve your existing `.env` database settings:

```sh
npm run migrate
npm run seed
```

Start two terminals in `backend/`. Both processes use the same configured MySQL database. Explicit environment values override `.env` for each process:

```sh
# Terminal 1: Sales actor
NODE_ENV=development HOST=127.0.0.1 PORT=4100 DEV_AUTH_ENABLED=true DEV_ACTOR=sales npm start
```

```sh
# Terminal 2: Manager actor
NODE_ENV=development HOST=127.0.0.1 PORT=4101 DEV_AUTH_ENABLED=true DEV_ACTOR=manager npm start
```

Your existing `.env` may keep `DEV_ACTOR=sales`; the second command overrides it for the manager process. A separate actor is required because the submitter cannot approve their own quotation. Postman does not send actor IDs, roles or fake tokens. Development authentication must stay disabled in production.

Default environment variables:

| Variable                                                       | Value                               |
| -------------------------------------------------------------- | ----------------------------------- |
| `salesBaseUrl`                                                 | `http://127.0.0.1:4100/api/v1`      |
| `managerBaseUrl`                                               | `http://127.0.0.1:4101/api/v1`      |
| `companyUtcOffsetMinutes`                                      | `330` (Asia/Colombo, UTC+05:30)     |
| `customerId`, `salesTeamId`, `ownerId`, address IDs, `styleId` | Seeded Ocean Apparel/TS-100 records |

Dates use the configured UTC offset because Postman sandbox does not expose Intl. Colombo uses 330 minutes year-round; set the current company offset if testing another timezone. Change the URLs if you use other ports. Each base URL already includes `/api/v1`; do not append it again. Changing `managerBaseUrl` alone does not change identity: that server must run with `DEV_ACTOR=manager`. Changing `ownerId` changes business ownership, not the requesting actor.

## Run requests

Use **Run collection** or run a folder from top to bottom. Each folder starts by creating its own Draft, generates current company-local dates (+15-day validity and +45-day delivery), and saves returned IDs and versions automatically.

1. **Happy path**: list → create → detail → edit → submit → approve as manager → issue → PDF → accept → convert → replay → new-key retry → converted detail.
2. **Rejection/withdrawal**: create → submit → reject → edit → resubmit → withdraw.
3. **Revision/decline/void**: issue original → create replacement → submit/approve/issue replacement → verify supersession → decline → new revision → submit/approve/void.
4. **Soft deletion**: create Draft → delete with quoted If-Match → confirm 404.
5. **Error examples**: reject protected status patch (422), stale version (409), and Sales approval (403), then delete the Draft.

All 15 API operations are covered. Alternative examples intentionally repeat operations to provide valid lifecycle prerequisites. Expected 403/404/409/422 responses have passing assertions; they are not unexpected collection failures.

Running the collection writes commercial test records and Draft sales orders to the database used by these servers. Use your development database. It does not wipe tables or remove volumes. Each rerun creates new families; old converted orders and historical records remain.

Saved **collection variables** include `quoteId`, `quoteVersion`, `quoteNumber`, `originalQuoteId`, `salesOrderId`, `idempotencyKey`, and `conversionVersion`. Do not define environment variables with those names because environment scope would override the saved collection values. `quoteId` switches to the new revision when creating a replacement. The original is retained separately. Refresh detail before manually continuing an existing quotation after external edits.

For conversion retries, keep the same `idempotencyKey` and `conversionVersion`. The first conversion creates the key once, and replay sends the same payload even if a later detail request updates `quoteVersion`. The separate new-key example expects 200 with the same linked order. Conversion captures `salesOrderId` without overwriting the quotation version with the order version.

For PDF, use **Send and Download** to save the binary attachment. Tests check the PDF content type and attachment header. A JSON error should be displayed as an error, not saved as a PDF.

## Optional command-line runner

With both servers running:

```sh
npx --yes newman run docs/postman/quotations.postman_collection.json \
  -e docs/postman/local.postman_environment.json --bail
```

Regenerate the files after changing the generator:

```sh
node scripts/generate-postman.js
```

## Sales Orders collection

Import `sales-orders.postman_collection.json`. Start fixed Sales and Manager backends on ports 4000 and 4101, then run folder 1 in order: lookups, direct Draft, edit, confirm, hold, operational amendment, resume. Variables store the returned order ID/version and lookup business date. Folder 2 reads the list, delivery, history and PDFs. For folder 3, first run the private CLI partial/full delivery fixtures, refresh detail, then close. Folder 4 contains alternative cancel/delete actions for a separate disposable order; do not run both on the same terminal order. See [the Sales Orders guide](../sales-orders.md). No actor headers or public fixture endpoints are used. Unknown transport/5xx outcomes retain the original idempotency key and body in a collection variable; retry sends both unchanged. Definitive responses clear that attempt.

## Customers

Import [customers.postman_collection.json](customers.postman_collection.json). Exactly six requests cover list/create/detail/PATCH/archive/reactivate. Default `baseUrl` is `http://127.0.0.1:4102/api/v1`, an Admin development instance; the Sales4000 server cannot write Customers by default. See [setup and journeys](../customers-verification.md). Returned IDs, warehouse IDs and versions are captured automatically. Keep the same idempotency key on create retries; use a new key for an intentionally separate buyer.
