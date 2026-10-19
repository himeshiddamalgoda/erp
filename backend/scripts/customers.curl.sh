#!/usr/bin/env bash
# Creates one intentional demo customer. Requires Node 22, curl and jq.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v jq >/dev/null || { echo 'Install jq or use npm run demo:customers instead.' >&2; exit 1; }
api_base="${ADMIN_API_URL:-http://127.0.0.1:4102/api/v1}"
create_key="${CUSTOMER_CREATE_KEY:-$(node -e 'console.log(require("node:crypto").randomUUID())')}"
customer_body="$(node --input-type=module -e 'import {customerDemoInput} from "./src/db/seeders/customers-demo.js"; console.log(JSON.stringify(customerDemoInput()));')"
result="$(curl --fail-with-body -sS -X POST "$api_base/customers" -H 'Content-Type: application/json' -H "Idempotency-Key: $create_key" --data "$customer_body")"
customer_id="$(jq -r '.data.id' <<<"$result")"
version="$(jq -r '.data.version' <<<"$result")"
warehouse_a="$(jq -r '.data.addresses[]|select(.label=="Warehouse A")|.id' <<<"$result")"
warehouse_b="$(jq -r '.data.addresses[]|select(.label=="Warehouse B")|.id' <<<"$result")"
# Reuse create_key/customer_body verbatim if the POST outcome is unknown.
curl --fail-with-body -sS "$api_base/customers?status=Active&page=1&pageSize=20" | jq '.meta'
result="$(curl --fail-with-body -sS "$api_base/customers/$customer_id?includeInactiveChildren=true")"
version="$(jq -r '.data.version' <<<"$result")"
changes="$(jq -n --argjson version "$version" --arg a "$warehouse_a" --arg b "$warehouse_b" '{version:$version,addresses:[{id:$a,isDefault:false},{id:$b,isDefault:true}]}')"
result="$(curl --fail-with-body -sS -X PATCH "$api_base/customers/$customer_id" -H 'Content-Type: application/json' --data "$changes")"
version="$(jq -r '.data.version' <<<"$result")"
archive_body="$(jq -n --argjson version "$version" '{version:$version,reason:"cURL demo buyer inactive"}')"
result="$(curl --fail-with-body -sS -X POST "$api_base/customers/$customer_id/archive" -H 'Content-Type: application/json' --data "$archive_body")"
version="$(jq -r '.data.version' <<<"$result")"
reactivate_body="$(jq -n --argjson version "$version" '{version:$version,reason:"cURL demo buyer resumed"}')"
curl --fail-with-body -sS -X POST "$api_base/customers/$customer_id/reactivate" -H 'Content-Type: application/json' --data "$reactivate_body" | jq '{id:.data.id,status:.data.status,version:.data.version}'
