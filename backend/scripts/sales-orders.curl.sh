#!/usr/bin/env bash
# Run from backend/, with separate Sales and Manager dev backends.
set -euo pipefail
sales_api="${SALES_API_URL:-http://localhost:4000/api/v1}"
manager_api="${MANAGER_API_URL:-http://localhost:4101/api/v1}"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
json_field() { node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{const j=JSON.parse(s);let v=j;for(const p of process.argv[1].split("."))v=v[p];process.stdout.write(String(v));});' "$1"; }
new_key() { node -e 'console.log(crypto.randomUUID())'; }
node --input-type=module > "$workdir/create.json" <<'JS'
import {directOrderInput} from './src/db/seeders/sales-orders-demo.js';
console.log(JSON.stringify(directOrderInput('CURL-'+crypto.randomUUID())));
JS
create_key="$(new_key)"
response="$(curl --fail-with-body --silent --show-error "$sales_api/sales-orders" -H 'Content-Type: application/json' -H "Idempotency-Key: $create_key" --data-binary @"$workdir/create.json")"
order_id="$(json_field data.id <<< "$response")"
order_version="$(json_field data.version <<< "$response")"
confirm_key="$(new_key)"
node -e 'console.log(JSON.stringify({version:Number(process.argv[1]),comment:"PO and delivery checked"}))' "$order_version" > "$workdir/confirm.json"
response="$(curl --fail-with-body --silent --show-error "$manager_api/sales-orders/$order_id/confirm" -H 'Content-Type: application/json' -H "Idempotency-Key: $confirm_key" --data-binary @"$workdir/confirm.json")"
order_version="$(json_field data.version <<< "$response")"
node -e 'console.log(JSON.stringify({version:Number(process.argv[1]),reason:"Review delivery"}))' "$order_version" > "$workdir/hold.json"
response="$(curl --fail-with-body --silent --show-error "$manager_api/sales-orders/$order_id/hold" -H 'Content-Type: application/json' --data-binary @"$workdir/hold.json")"
order_version="$(json_field data.version <<< "$response")"
revision_key="$(new_key)"
node -e 'console.log(JSON.stringify({version:Number(process.argv[1]),reason:"Buyer changed packing",buyerReference:"Buyer email",changes:{publicNotes:"Pack by colour; revised instruction"}}))' "$order_version" > "$workdir/revise.json"
response="$(curl --fail-with-body --silent --show-error "$manager_api/sales-orders/$order_id/revisions" -H 'Content-Type: application/json' -H "Idempotency-Key: $revision_key" --data-binary @"$workdir/revise.json")"
order_version="$(json_field data.order.version <<< "$response")"
node -e 'console.log(JSON.stringify({version:Number(process.argv[1]),reason:"Buyer confirmed"}))' "$order_version" > "$workdir/resume.json"
curl --fail-with-body --silent --show-error "$manager_api/sales-orders/$order_id/resume" -H 'Content-Type: application/json' --data-binary @"$workdir/resume.json"
printf '\nOrder ID: %s\n' "$order_id"
printf 'Run fixture: npm run demo:fulfilment -- %s partial\n' "$order_id"
printf 'Then fixture: npm run demo:fulfilment -- %s complete\n' "$order_id"
printf 'After fixtures, GET detail for latest version and POST /sales-orders/%s/close as Manager.\n' "$order_id"
# For transport retries inside a durable client: retain request JSON AND key together.
# Re-running this script starts a NEW order; it is not a retry of an interrupted run.
