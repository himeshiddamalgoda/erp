#!/usr/bin/env bash
set -euo pipefail
# Start fixed sales/manager development servers first; see docs/quotations.md.
SALES_URL="${SALES_URL:-http://127.0.0.1:4100}"
MANAGER_URL="${MANAGER_URL:-http://127.0.0.1:4101}"
extract() { node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>console.log(JSON.parse(s).data[process.argv[1]]))' "$1"; }
input=$(node --input-type=module -e 'import {demoInput} from "./src/db/seeders/demo.js"; console.log(JSON.stringify(demoInput()))')
quote=$(curl --fail-with-body -sS "$SALES_URL/api/v1/quotations" -H 'Content-Type: application/json' --data-binary "$input")
id=$(printf '%s' "$quote" | extract id)
for action in submit approve issue buyer-response; do
  version=$(printf '%s' "$quote" | extract version)
  url="$SALES_URL"
  case "$action" in
    submit) body="{\"version\":$version}" ;;
    approve) url="$MANAGER_URL"; body="{\"version\":$version,\"comment\":\"Pricing reviewed\"}" ;;
    issue) body="{\"version\":$version,\"channel\":\"manual\"}" ;;
    buyer-response) body="{\"version\":$version,\"decision\":\"Accepted\",\"reference\":\"Development buyer email\"}" ;;
  esac
  quote=$(curl --fail-with-body -sS "$url/api/v1/quotations/$id/$action" -H 'Content-Type: application/json' --data-binary "$body")
done
version=$(printf '%s' "$quote" | extract version)
key=$(node -e 'console.log(require("node:crypto").randomUUID())')
for attempt in 1 2; do
  curl --fail-with-body -sS "$SALES_URL/api/v1/quotations/$id/convert" -H 'Content-Type: application/json' -H "Idempotency-Key: $key" --data-binary "{\"version\":$version}"
  printf '\n'
done
