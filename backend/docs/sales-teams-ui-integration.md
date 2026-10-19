# Sales Teams screen/API reference

Sales Teams frontend screens are implemented. Routes are `/orders/sales-teams`, `/new`, `/:id`, and `/:id/edit` under that base. The frontend uses Next.js/React with MUI, feature Axios services, page-level TanStack Query hooks, React Hook Form/Zod and Redux UI state. See the [implemented screens and testing journeys](../../frontend/docs/sales-teams-journeys.md).

| UI event / screen | Request under `/api/v1` | Data and behavior |
| --- | --- | --- |
| Expand Orders | None | Local sidebar state |
| Team list | GET `/sales-teams?status=Active&page=1&pageSize=20` | Summary rows; code/name/status/manager, active vs eligible member counts, version; `meta.total` |
| Search/filter/sort/page | Same GET with `q,status,managerId,memberId,page,pageSize,sortBy,sortOrder` | Reset page on filters; literal substring search, pageSize max100; name/code/createdAt + ID tie-breaker |
| Create staff lookup | Supporting GET `/users?status=Active&q=...&page=1&pageSize=20` | Existing authorized staff only; id/displayName/role/managerEligible |
| Manager lookup | Same GET with `managerEligible=true` | Active SalesManager/Admin; manager title does not promote role |
| Add/remove member row before Save | None | Local complete desired active membership set |
| Save create | POST `/sales-teams`, `Idempotency-Key` |201 full profile, generated code/ID/version. Persist same submitted body/key until outcome known |
| Profile/edit open | GET `/sales-teams/:id?includeInactiveMembers=true` for edit/history | Profile, stable team-user pairs, current version, integrity warnings, allowedActions, bounded assignment summary |
| Save edit | PATCH `/sales-teams/:id` | `version`, changed profile/manager fields, COMPLETE memberIds if changed, reason for manager/member changes |
| Customers tab | Existing GET `/customers?salesTeamId=:id&status=All&page=1&pageSize=20` | Paginated independently scoped customer assignments/history |
| Quotations tab | Existing GET `/quotations?salesTeamId=:id&includeRevisions=true&page=1&pageSize=20` | Include all revisions; do not infer blockers from latest rows only |
| Orders tab | Existing GET `/sales-orders?salesTeamId=:id&page=1&pageSize=20` | Delivered still active for team archive/removal until closed/transferred |
| Reassign dialog | Supporting POST `/assignments/reassign` | One entity and its own version, explicit target team/owner/reason; no bulk cascade |
| Archive reason dialog | POST `/sales-teams/:id/archive` | `version,reason`;409 explains active assignments, authorized links only |
| Archived repair | PATCH team | Status remains Archived; final active manager/member invariants apply |
| Reactivate reason dialog | POST `/sales-teams/:id/reactivate` | Current version/reason;422 requires repair;200 clears current archive metadata |

## Form payloads

```json
{
  "name":"Export Sales",
  "description":"Overseas garment buyers",
  "managerId":"<existing-active-manager>",
  "memberIds":["<manager>","<merchandiser-a>","<merchandiser-b>"]
}
```

Manager must be included, regardless of the UI manager picker. Duplicate IDs are invalid. Membership is independent of global permissions. Same-name teams are allowed; show code to distinguish them. No invitation or staff creation action exists here.

Unlike Customer contact/address changes, team PATCH `memberIds` is a complete replacement of the **active set**. Omitted preserves all current members; `[]` is invalid. To remove A after transfer:

```json
{"version":3,"managerId":"<manager>","memberIds":["<manager>","<merchandiser-b>"],"reason":"Merchandiser A moved teams"}
```

Display a removal confirmation listing the omitted current active IDs. Do not send only newly added IDs. Keep inactive pair history separate from the active selection. Re-adding uses the same team/user pair; no caller-generated membership ID exists. Preserve existing null legacy dates as unknown rather than inventing a display date. Group reasons, user errors and manager-membership issues onto their fields.

## Assignment transfer payload

```json
{
  "entityType":"quotation",
  "entityId":"<quotation-id>",
  "salesTeamId":"<target-team>",
  "ownerId":"<target-active-member>",
  "version":6,
  "reason":"Reassigned before member removal"
}
```

The version is the **entity** version, not team.version. Allowed types: `customer`, `quotation`, `salesOrder`. Use the updated entity returned by the route. New assignments require active targets and eligible ownership; explicit repair transfers can resolve stale ordinary members before team removal. A terminal document cannot be transferred. Source and target permission are both checked. Team-manager title alone grants neither transfer capability nor cross-team scope.

After a transfer, invalidate team profile/assignment tabs and the changed entity's query keys. Customer transfer does not change any quote/order; each open document needs explicit transfer. Never automatically loop over records or silently transfer them when someone changes manager/members. Warn that responsibility changes do not alter commercial content or old approvals.

## Journeys

**A — Create and assign.** Admin/team-management capability reads eligible staff, selects manager plus merchandisers, saves once. POST returns Active/version1. Explicitly assign a buyer through customer create/edit or reassignment, then create a quotation with an active team/member using the existing quotation Save. Adding membership grants no global role. Existing narrow token claims need the upstream adapter to refresh newly granted team IDs.

**B — Remove a merchandiser.** Submit complete final member set + reason.409 MEMBER_HAS_ACTIVE_ASSIGNMENTS preserves all edits and membership. Show up to20 authorized examples and per-member visible counts/restricted flags. Open each entity, explicitly reassign using that entity's current version, refresh tabs/profile and retry the desired set with current team.version. Removed membership revokes subsequent team-derived list/detail/PDF/history access despite stale claims.

**C — Change manager.** Select eligible active manager and explicitly retain/remove old manager in the final set. Removing old manager runs the same active ownership checks. Save atomically; old user's global role/approvals remain unchanged. Pending approvals continue existing role/scope and self-approval policy.

**D — Archive.** Active customers, open quote revisions and Draft/Confirmed/InProgress/PartiallyDelivered/Delivered orders block. Resolve/transfer one record at a time or finish it through its lifecycle. Delivered does not mean Closed. Stale Issued expiry must be resolved through quotations; archive never modifies it. Archive with current version/reason once eligible. Members/history remain; active selectors omit archived team.

**E — Reactivate.** Detail shows inactive manager/member warnings. Repair archived profile with a valid active manager/final membership and required reason, then reactivate using returned version. No cancelled/closed documents reopen. Unknown old provenance stays unknown; newly performed actions have real audit metadata.

## State, caching and failures

Page components own queries/mutations; reusable table/form/member/reason components receive data/callbacks only. Server data stays in TanStack Query; URL owns list filters; Redux owns navigation/dialog/dirty state. Suggested keys: `['sales-teams',base,'list',filters]`, `['sales-teams',base,'detail',id,includeInactive]`, `['users',base,filters]`. Invalidate team/list/reference options after mutation and relevant customer/quote/order caches after transfer. No server scope cache exists here; do not assume long-lived JWT team IDs prove current membership.

Show separate active-member versus eligible-user counts. `integrityWarnings` can indicate stale accounts or unknown legacy provenance; the latter is informative, not a made-up historical fact. `eligibleForAssignment` reflects current master integrity; repair-path ownership transfers are explained separately. `allowedActions` is informational; every write rechecks.

For restricted readers, all assignment counts/examples are visible-only; `canArchive` still checks all records. **`restrictedBlockers:true` with `blockerCount:0` does not mean no blockers.** Show generic “Additional assignments must be resolved by their authorized team” without a hidden global count or identity. Do not derive a complete history from examples.

Loading/empty/retry/error states should retain form input.422 maps `error.fields`;409 STALE_VERSION offers explicit reload/review, never silent overwrite.409 blocker errors retain edits/reasons and show safe links, preferably opening another tab so edits survive. Create timeouts keep original key/body; unknown outcome never silently creates another team. A fresh key intentionally creates a distinct same-name team. Reordered memberIds represent the same canonical create set. 400 covers malformed query/header/JSON;401 stale/invalid principal;403 missing permission;404 outside scope/missing;413 body exceeds1MB;500 is sanitized. Retain requestId for support.
