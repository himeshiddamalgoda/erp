# Sales Orders verification - 19 October 2026

Environment: Node.js 22.20.0, MySQL 8.4 in the existing Docker service.

- `npm run check`: 50 JavaScript files passed syntax checking.
- `TEST_DB_NAME=erp_sales_orders_test npm test`: **49 tests passed, zero failed or skipped**, including the existing quotation suite and 20 Sales Orders integration scenarios.
- OpenAPI validation passed; the document and router each contain exactly 15 Sales Orders operations.
- Fresh isolated-database migrations, migration resume, deterministic master seed and order demo seed succeeded. The additive migration was also applied to the normal development database, which had zero existing sales orders; no quotation/master data was reset.
- `npm run demo:orders` and `bash scripts/sales-orders.curl.sh` succeeded against separate fixed Sales/Manager servers using the isolated test database.
- CLI partial/full delivery fixtures produced PartiallyDelivered then Delivered; HTTP manager close returned 200/Closed with all 1,000 PCS delivered and total 5500.00.
- Postman folders 1 and 2 executed against those isolated servers through a local script sandbox: 14 requests / 16 assertions passed. The saved-attempt script separately retained the exact key and body after a simulated missing response. Terminal-action and closure behavior are covered by the integration suite and fixture/HTTP demo.
- Production dependency audit reported zero vulnerabilities.
- `git diff --check` passed.

The standard Docker rebuild hit an npm registry ETIMEDOUT fetching an unchanged dependency. A local source rebuild reused the existing production image **only after verifying its package-lock.json SHA-256 exactly matched the repository lockfile**, then refreshed the API container. No dependency versions or MySQL security settings were changed to bypass the network failure. The normal Dockerfile remains the standard install/build path when registry connectivity is available.

The Sales API on port 4000 and Manager API on 4101 use the development database. Test/sample journey writes were confined to erp_sales_orders_test. Real production dispatch, integration authentication/transport, reconciliation and a scheduling host are not configured. The private integration seams and their race/guard behavior were tested; no claim of external delivery is made. Frontend application screens are excluded by the pasted scope; their routes/actions/data and five journeys are documented separately.
