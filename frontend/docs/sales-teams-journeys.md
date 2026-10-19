# Sales Teams: screens, APIs and testing journeys

Open **Orders → Sales teams** at `http://localhost:3000/orders/sales-teams`.
Use the development **Admin workspace** for management and cross-team transfers. Sales and Manager demo principals can read only their current scope; a manager title does not grant team-management permission. Production permissions come from the authenticated principal. The frontend sends no identity override headers.

## Screen/API map

Requests below are relative to the selected backend’s `/api/v1` base.

| Screen / interaction | API | Data displayed or submitted |
| --- | --- | --- |
| All team pages | `GET /reference-data/quotation-options` | Current actor, role/capabilities, authorized reference options |
| List / search / filters / sorting / paging | `GET /sales-teams` | `q,status,managerId,memberId,page,pageSize,sortBy,sortOrder`; rows show generated code, name, status, manager, active and eligible member counts; `meta.total` drives pagination |
| Create / edit: staff search and pagination | `GET /users?status=Active` | Existing staff ID, display name, role; separate manager lookup adds `managerEligible=true`; selected members are retained across search pages |
| Create: Save | `POST /sales-teams` | `name,description,managerId,memberIds`; one persistent `Idempotency-Key`; response supplies generated code/ID, version and full profile |
| Profile / edit | `GET /sales-teams/:id?includeInactiveMembers=true` | Profile, active and removed membership history, audit dates, integrity warnings, assignment summary and allowed actions |
| Edit: Save | `PATCH /sales-teams/:id` | Original version plus changed fields. Membership changes send the complete desired active `memberIds` set. Manager/member changes require a reason |
| Customers tab | `GET /customers?salesTeamId=:id&status=All` | Independently paginated authorized buyers, including archived buyers |
| Quotations tab | `GET /quotations?salesTeamId=:id&includeRevisions=true` | Authorized quotation revisions, including older open revisions |
| Sales orders tab | `GET /sales-orders?salesTeamId=:id` | Authorized orders; Delivered still counts as open for archive/removal |
| Reassign dialog opens | `GET /customers/:id`, `/quotations/:id` or `/sales-orders/:id` | Fresh selected entity version; unrelated detail APIs are not called |
| Reassign: target team/member search | `GET /sales-teams?status=Active`, then `GET /sales-teams/:targetId?includeInactiveMembers=true` | Searchable, paginated targets and their currently active staff. Invalid target managers are blocked |
| Reassign: Submit | `POST /assignments/reassign` | `entityType,entityId,salesTeamId,ownerId,version,reason`; version belongs to the record, not the team |
| Archive / reactivate dialog | `POST /sales-teams/:id/archive` or `/reactivate` | Current reviewed team version and mandatory reason |

Only page controllers invoke API hooks. Feature Axios services perform HTTP requests; TanStack Query holds server state and invalidates team, reference and affected commercial queries after transfers. Redux Toolkit retains navigation/workspace/dirty state. Forms use React Hook Form and Zod. CSS Modules use the shared variable tokens.

## 1. Create, edit and membership history

1. Switch to Admin and select **New team**.
2. Enter `Export Sales QA` and a description. Select `Demo SalesManager` as manager; it is visibly added to the active membership selection.
3. Select `Demo Sales` and `Demo Merchandiser B` as members. Save. Expect an Active profile, generated `TEAM-…` code and version 1.
4. Open **Edit team**, remove a member with no active assignments, and enter a change reason.
5. Save and review the named member-removal confirmation. Confirm to send the complete remaining active set.
6. On Profile & members choose **Show membership history**. The removed row remains in history with real removal metadata. Re-adding that user reactivates the durable membership pair.
7. Changing manager retains the old manager unless you explicitly remove them. It does not promote or demote a global role.

## 2. Blocked removal and explicit reassignment

1. Create a source team and a target team with an eligible manager and members.
2. Create an Active customer assigned to a source member through Customers. Add quotations/orders if desired.
3. Remove that member in Edit team, supply a reason and confirm. Expect `MEMBER_HAS_ACTIVE_ASSIGNMENTS`; edits and reason remain. The response shows authorized examples and per-member visible counts.
4. Open the source team profile in a separate tab to preserve the form. On **Customers**, choose **Reassign** for the buyer.
5. Search the target team by code/name, select an active owner and provide a reason. Submit. The dialog uses the freshly fetched customer version. Expect the row to disappear from the source tab.
6. Transfer each open quotation revision and sales order separately through its matching tab. Customer transfers never cascade to documents; commercial values, statuses and approvals remain unchanged.
7. Return to the original form and retry removal. Assignment transfers do not change team membership/version. If someone also edited the team, use the explicit stale-version recovery below.

Only Admin or principals with the relevant customer/document assignment capability and both source/target scope can transfer. A generic restricted-blocker notice can appear even when there are **zero visible blockers**; ask an authorized team to resolve those records. No hidden count or identity is shown.

## 3. Archive and reactivate

1. On an Active profile choose **Archive team**, enter a reason and submit.
2. If blocked, review the safe links and assignment tabs. Active customers, open quotation revisions and Draft/Confirmed/InProgress/PartiallyDelivered/Delivered orders must be transferred or resolved through their own workflows.
3. Retry after resolution. Expect Archived status; active selectors omit the team, but historical membership and documents remain readable within scope.
4. Select **Reactivate team** and give a reason. If staff/manager integrity is invalid, repair it through Edit team first; archived edits do not reactivate automatically.
5. Legacy null audit dates display as unknown. They are never synthesized.

## 4. Conflicts and retry safety

- **Stale edit:** open Edit team, change a field, then update the team from another session. Save sends the original reviewed version and returns `STALE_VERSION`. Your input remains; **Reload and review server data → Discard edits and reload** explicitly replaces it. A failed reload retains the original form.
- **Lost create response:** if a create times out after commit, the form is locked and **Retry original create** retains the exact original body/key, even across reload in that tab. A successful replay returns the original team. Switching workspaces does not mix attempts.
- **Stale transfer:** the dialog retains its target, owner and reason. Reload the record explicitly, review its current version and retry. No automatic version bump or retry hides a concurrent edit.
- **Validation/access failures:** field errors and request reference are displayed. Leave/cancel and workspace changes guard dirty forms. Sales/Manager views hide management controls and direct edit URLs show a read-only explanation.

## Automated checks

Use an already provisioned, migrated and seeded **isolated** database ending in `_test`:

```sh
cd frontend
npm run lint
npm test
npm run build
TEST_DB_NAME=erp_sales_teams_test npm run test:e2e
```

Playwright starts isolated Sales/Manager/Admin API processes on 4310–4312 and redirects browser requests there. It does not reset the development database. Team tests create unique records and cover create/edit/history, archive/reactivate, lost-response replay, stale edits, blocked removal → customer transfer → successful removal, scoped read-only UI and mobile layout. Unit checks cover full-set semantics, permission separation, hidden blockers, filter normalization and service request contracts.
