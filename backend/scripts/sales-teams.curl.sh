#!/usr/bin/env bash
# Creates new demo teams/customer. Uses returned entity/team versions; never resets data.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v jq >/dev/null || { echo 'Requires jq; npm run demo:teams is the Node-only alternative.' >&2; exit 1; }
team_api="${ADMIN_API_URL:-http://127.0.0.1:4102/api/v1}"
team_tmp="$(mktemp -d)"
trap 'rm -rf "$team_tmp"' EXIT
team_manager='10000000-0000-4000-8000-000000000002'
team_sales='10000000-0000-4000-8000-000000000001'
team_b='10000000-0000-4000-8000-000000000005'
team_key="${TEAM_CREATE_KEY:-$(node -e 'console.log(require("node:crypto").randomUUID())')}"
request() {
  local method="$1" path="$2" expected="$3" body="${4:-}" key="${5:-}"
  local args=(--silent --show-error -X "$method" "$team_api$path" -H 'Content-Type: application/json' --output "$team_tmp/response.json" --write-out '%{http_code}')
  if [[ -n "$body" ]]; then args+=(--data "$body"); fi
  if [[ -n "$key" ]]; then args+=(-H "Idempotency-Key: $key"); fi
  local response_status
  response_status="$(curl "${args[@]}")"
  team_json="$(cat "$team_tmp/response.json")"
  if [[ "$response_status" != "$expected" ]]; then echo "Unexpected HTTP $response_status: $team_json" >&2; return 1; fi
}
request GET '/users?status=Active&pageSize=100' 200
jq -e --arg b "$team_b" '.data | any(.id == $b)' <<<"$team_json" >/dev/null
team_body="$(jq -n --arg m "$team_manager" --arg a "$team_sales" --arg b "$team_b" '{name:"Export Sales curl demo",managerId:$m,memberIds:[$m,$a,$b]}')"
request POST /sales-teams 201 "$team_body" "$team_key"
team_id="$(jq -r '.data.id' <<<"$team_json")"
team_code="$(jq -r '.data.code' <<<"$team_json")"
team_version="$(jq -r '.data.version' <<<"$team_json")"
# Timeout retries must reuse team_key + team_body; never silently allocate another key.
edit_body="$(jq -n --argjson v "$team_version" '{version:$v,description:"Reviewed export responsibilities"}')"
request PATCH "/sales-teams/$team_id" 200 "$edit_body"
team_version="$(jq -r '.data.version' <<<"$team_json")"
customer_input="$(node --input-type=module -e 'import {customerDemoInput} from "./src/db/seeders/customers-demo.js"; console.log(JSON.stringify(customerDemoInput()));')"
customer_body="$(jq --arg t "$team_id" --arg a "$team_sales" '.salesTeamId=$t | .ownerId=$a | .name="Ocean Apparel curl teams demo"' <<<"$customer_input")"
request POST /customers 201 "$customer_body" "$(node -e 'console.log(require("node:crypto").randomUUID())')"
customer_id="$(jq -r '.data.id' <<<"$team_json")"
customer_version="$(jq -r '.data.version' <<<"$team_json")"
remove_body="$(jq -n --argjson v "$team_version" --arg m "$team_manager" --arg b "$team_b" '{version:$v,memberIds:[$m,$b],reason:"Merchandiser A moving teams"}')"
request PATCH "/sales-teams/$team_id" 409 "$remove_body"
jq -e '.error.code=="MEMBER_HAS_ACTIVE_ASSIGNMENTS"' <<<"$team_json" >/dev/null
transfer="$(jq -n --arg id "$customer_id" --arg t "$team_id" --arg b "$team_b" --argjson v "$customer_version" '{entityType:"customer",entityId:$id,salesTeamId:$t,ownerId:$b,version:$v,reason:"Resolve member ownership"}')"
request POST /assignments/reassign 200 "$transfer"
customer_version="$(jq -r '.data.version' <<<"$team_json")"
request PATCH "/sales-teams/$team_id" 200 "$remove_body"
team_version="$(jq -r '.data.version' <<<"$team_json")"
target_body="$(jq -n --arg m "$team_manager" --arg b "$team_b" '{name:"Regional Sales curl demo",managerId:$m,memberIds:[$m,$b]}')"
request POST /sales-teams 201 "$target_body" "$(node -e 'console.log(require("node:crypto").randomUUID())')"
target_id="$(jq -r '.data.id' <<<"$team_json")"
transfer="$(jq -n --arg id "$customer_id" --arg t "$target_id" --arg b "$team_b" --argjson v "$customer_version" '{entityType:"customer",entityId:$id,salesTeamId:$t,ownerId:$b,version:$v,reason:"Resolve team archive ownership"}')"
request POST /assignments/reassign 200 "$transfer"
archive="$(jq -n --argjson v "$team_version" '{version:$v,reason:"Merged into regional sales"}')"
request POST "/sales-teams/$team_id/archive" 200 "$archive"
team_version="$(jq -r '.data.version' <<<"$team_json")"
repair="$(jq -n --argjson v "$team_version" '{version:$v,description:"Repaired archived profile"}')"
request PATCH "/sales-teams/$team_id" 200 "$repair"
team_version="$(jq -r '.data.version' <<<"$team_json")"
reactivate="$(jq -n --argjson v "$team_version" '{version:$v,reason:"Export operation resumed"}')"
request POST "/sales-teams/$team_id/reactivate" 200 "$reactivate"
request GET "/sales-teams?q=$team_code" 200
jq -e --arg id "$team_id" '.data | any(.id == $id)' <<<"$team_json" >/dev/null
request GET "/sales-teams/$team_id?includeInactiveMembers=true" 200
jq '{id:.data.id,status:.data.status,version:.data.version,members:.data.members}' <<<"$team_json"
