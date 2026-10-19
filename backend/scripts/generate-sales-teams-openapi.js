import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const text = (maxLength, extra = {}) => ({
  type: "string",
  ...(maxLength ? { maxLength } : {}),
  ...extra,
});
const uuid = text(undefined, { format: "uuid" }),
  date = text(undefined, { format: "date-time" }),
  nullableDate = { ...date, nullable: true },
  nullableActor = { ...uuid, nullable: true },
  boolean = { type: "boolean" },
  count = { type: "integer", minimum: 0 },
  version = { type: "integer", minimum: 1, maximum: 4294967295 };
const object = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const array = (items, maxItems, minItems) => ({
  type: "array",
  items,
  ...(maxItems ? { maxItems } : {}),
  ...(minItems ? { minItems } : {}),
});
const manager = object({ id: uuid, displayName: text(150) }, [
  "id",
  "displayName",
]);
const members = array(uuid, 100, 1);
members.uniqueItems = true;
const reason = text(1000, { minLength: 1 });
const input = {
  name: text(150, { minLength: 2 }),
  description: text(1000, { nullable: true }),
  managerId: uuid,
  memberIds: members,
};
const summary = {
  id: uuid,
  code: text(30),
  name: input.name,
  status: { type: "string", enum: ["Active", "Archived"] },
  manager,
  activeMemberCount: count,
  eligibleMemberCount: count,
  version,
};
const blocker = object(
  {
    entityType: {
      type: "string",
      enum: ["customer", "quotation", "salesOrder"],
    },
    id: uuid,
    number: text(50),
    status: text(32),
    ownerId: uuid,
    validityEnded: boolean,
    href: text(200),
  },
  ["entityType", "id", "number", "status", "ownerId", "validityEnded", "href"],
);
const assignmentProperties = {
  activeCustomerCount: count,
  openQuotationCount: count,
  openSalesOrderCount: count,
  canArchive: boolean,
  blockerCount: count,
  restrictedBlockers: boolean,
  countsScope: { type: "string", enum: ["all-company", "actor-visible-teams"] },
  blockerCountScope: {
    type: "string",
    enum: ["all-company", "actor-visible-teams"],
  },
  blockers: array(ref("Blocker"), 20),
};
const schemas = {
  TeamCreateInput: {
    ...object(input, ["name", "managerId", "memberIds"]),
    description:
      "Creates an Active team. Existing users only; every member eligible/active; manager must be active SalesManager/Admin and in the final membership. Members do not gain global roles.",
  },
  TeamPatchInput: {
    ...object({ version, ...input, reason }, ["version"]),
    description:
      "memberIds, if supplied, is the COMPLETE desired active set, not additions. Omitted preserves; empty/duplicate invalid. Manager/member changes require reason. Removal checks all owned active assignments before any write. Same-pair reactivation retains first metadata. No-op leaves version/audit unchanged after stale-version checking. Archived edits preserve Archived status.",
  },
  LifecycleInput: object({ version, reason }, ["version", "reason"]),
  TeamSummary: object(summary, Object.keys(summary)),
  Member: object(
    {
      userId: uuid,
      displayName: text(150),
      teamRole: { type: "string", enum: ["Manager", "Member"] },
      membershipActive: boolean,
      userActive: boolean,
      joinedAt: nullableDate,
      lastActivatedAt: nullableDate,
      removedAt: nullableDate,
      removedBy: nullableActor,
    },
    [
      "userId",
      "displayName",
      "teamRole",
      "membershipActive",
      "userActive",
      "joinedAt",
      "lastActivatedAt",
    ],
  ),
  IntegrityWarning: object(
    {
      code: {
        type: "string",
        enum: [
          "INVALID_MANAGER",
          "INVALID_MEMBER",
          "LEGACY_PROVENANCE_UNKNOWN",
          "LEGACY_MEMBERSHIP_PROVENANCE_UNKNOWN",
          "LEGACY_ARCHIVE_PROVENANCE_UNKNOWN",
        ],
      },
      message: text(),
      userId: uuid,
    },
    ["code", "message"],
  ),
  Blocker: blocker,
  AssignmentSummary: {
    ...object(assignmentProperties, Object.keys(assignmentProperties)),
    description:
      "All count fields/examples are visibility filtered for non-Admins. canArchive checks ALL assignments; restrictedBlockers=true can accompany blockerCount=0. No hidden global totals or examples are exposed.",
  },
  TeamDetail: object(
    {
      ...summary,
      description: input.description,
      managerId: uuid,
      members: array(ref("Member"), 500),
      createdAt: date,
      updatedAt: date,
      createdBy: nullableActor,
      updatedBy: nullableActor,
      archivedAt: nullableDate,
      archivedBy: nullableActor,
      archiveReason: text(1000, { nullable: true }),
      assignmentSummary: ref("AssignmentSummary"),
      integrityWarnings: array(ref("IntegrityWarning"), 503),
      eligibleForAssignment: boolean,
      allowedActions: array(
        { type: "string", enum: ["edit", "archive", "reactivate"] },
        3,
      ),
    },
    [
      ...Object.keys(summary),
      "description",
      "managerId",
      "members",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
      "archivedAt",
      "archivedBy",
      "archiveReason",
      "assignmentSummary",
      "integrityWarnings",
      "eligibleForAssignment",
      "allowedActions",
    ],
  ),
  TeamResponse: object({ data: ref("TeamDetail") }, ["data"]),
  TeamList: object(
    {
      data: array(ref("TeamSummary"), 100),
      meta: object(
        {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          total: count,
        },
        ["page", "pageSize", "total"],
      ),
    },
    ["data", "meta"],
  ),
  BlockerDetails: object(
    {
      ...assignmentProperties,
      members: array(
        object(
          { memberId: uuid, blockerCount: count, restrictedBlockers: boolean },
          ["memberId", "blockerCount", "restrictedBlockers"],
        ),
        100,
      ),
    },
    Object.keys(assignmentProperties),
  ),
  Error: object(
    {
      error: object(
        {
          code: {
            type: "string",
            enum: [
              "INVALID_REQUEST",
              "MALFORMED_JSON",
              "INVALID_IDEMPOTENCY_KEY",
              "UNAUTHENTICATED",
              "INVALID_PRINCIPAL",
              "FORBIDDEN",
              "NOT_FOUND",
              "STALE_VERSION",
              "INVALID_TRANSITION",
              "MANAGER_MUST_BE_MEMBER",
              "INVALID_MANAGER",
              "INVALID_MEMBER",
              "INVALID_TEAM_OWNER",
              "MEMBER_HAS_ACTIVE_ASSIGNMENTS",
              "TEAM_HAS_ACTIVE_ASSIGNMENTS",
              "IDEMPOTENCY_KEY_REUSED",
              "VERSION_EXHAUSTED",
              "SEQUENCE_EXHAUSTED",
              "VALIDATION_ERROR",
              "CONSTRAINT_CONFLICT",
              "REFERENCED_RECORD_CONFLICT",
              "PAYLOAD_TOO_LARGE",
              "INTERNAL_ERROR",
            ],
          },
          message: text(),
          fields: { type: "object", additionalProperties: { type: "string" } },
          details: ref("BlockerDetails"),
          requestId: uuid,
        },
        ["code", "message", "requestId"],
      ),
    },
    ["error"],
  ),
};
const demo = {
  name: "Export Sales",
  description: "Manages overseas garment buyers and orders",
  managerId: "10000000-0000-4000-8000-000000000002",
  memberIds: [
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000005",
  ],
};
const example = {
  id: "20000000-0000-4000-8000-000000000002",
  code: "TEAM-000001",
  name: demo.name,
  description: demo.description,
  status: "Active",
  manager: { id: demo.managerId, displayName: "Demo SalesManager" },
  managerId: demo.managerId,
  activeMemberCount: 3,
  eligibleMemberCount: 3,
  version: 1,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  createdBy: "10000000-0000-4000-8000-000000000003",
  updatedBy: "10000000-0000-4000-8000-000000000003",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  members: demo.memberIds.map((userId) => ({
    userId,
    displayName:
      userId === demo.managerId ? "Demo SalesManager" : "Demo merchandiser",
    teamRole: userId === demo.managerId ? "Manager" : "Member",
    membershipActive: true,
    userActive: true,
    joinedAt: "2026-10-19T00:00:00.000Z",
    lastActivatedAt: "2026-10-19T00:00:00.000Z",
  })),
  assignmentSummary: {
    activeCustomerCount: 0,
    openQuotationCount: 0,
    openSalesOrderCount: 0,
    canArchive: true,
    blockerCount: 0,
    restrictedBlockers: false,
    countsScope: "all-company",
    blockerCountScope: "all-company",
    blockers: [],
  },
  integrityWarnings: [],
  eligibleForAssignment: true,
  allowedActions: ["edit", "archive"],
};
const response = (description, schema, example) => ({
  description,
  headers: { "X-Request-Id": { schema: uuid } },
  content: {
    "application/json": {
      schema: ref(schema),
      ...(example ? { example } : {}),
    },
  },
});
const errors = {
  400: response(
    "Malformed query/path/header, JSON or invalid Idempotency-Key",
    "Error",
  ),
  401: response("Invalid/inactive principal or stale role claim", "Error"),
  403: response("Missing management/assignment capability", "Error"),
  404: response("Missing or outside current live scope", "Error"),
  409: response(
    "STALE_VERSION, INVALID_TRANSITION, ownership blockers, key reuse or constraint conflict",
    "Error",
  ),
  413: response("JSON body exceeds1MB", "Error"),
  422: response(
    "VALIDATION_ERROR, INVALID_MANAGER, INVALID_MEMBER or MANAGER_MUST_BE_MEMBER",
    "Error",
  ),
  500: response("Sanitized unexpected failure", "Error"),
};
const parameter = (
  name,
  schema,
  description,
  location = "query",
  required = false,
) => ({ name, in: location, required, schema, description });
const id = parameter("id", uuid, "Team UUID", "path", true);
const body = (schema, example) => ({
  required: true,
  content: { "application/json": { schema: ref(schema), example } },
});
const op = (operationId, summary, description, extra) => ({
  operationId,
  summary,
  description,
  tags: ["Sales Teams"],
  "x-authentication":
    "Trusted req.user only. Admin or sales-teams:write manages team masters globally; other readers need both a claimed team scope and live active membership. Management capability alone does not expand commercial-record visibility.",
  ...extra,
});
const teamPaths = {
  "/sales-teams": {
    get: op(
      "listSalesTeams",
      "Search teams",
      "Scope before count/pagination; q matches literal code/name substring with escaped backslash/%/_. Fixed two list SQL queries use joined aggregate member counts; no N+1. Active membership and active user counts differ.",
      {
        parameters: [
          parameter("q", text(100, { minLength: 1 }), "Literal substring"),
          parameter(
            "status",
            {
              type: "string",
              enum: ["Active", "Archived", "All"],
              default: "Active",
            },
            "Derived is_active filter",
          ),
          parameter("managerId", uuid, "Exact manager"),
          parameter(
            "memberId",
            uuid,
            "Active membership pair, even if staff account became inactive",
          ),
          parameter(
            "page",
            { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
            "Page",
          ),
          parameter(
            "pageSize",
            { type: "integer", minimum: 1, maximum: 100, default: 20 },
            "Page size",
          ),
          parameter(
            "sortBy",
            {
              type: "string",
              enum: ["name", "code", "createdAt"],
              default: "name",
            },
            "Stable ID tie-breaker",
          ),
          parameter(
            "sortOrder",
            { type: "string", enum: ["asc", "desc"], default: "asc" },
            "Direction",
          ),
        ],
        responses: {
          200: response("Team summaries", "TeamList", {
            data: [
              Object.fromEntries(
                Object.keys(summary).map((k) => [k, example[k]]),
              ),
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          }),
          400: errors[400],
          401: errors[401],
          500: errors[500],
        },
      },
    ),
    post: op(
      "createSalesTeam",
      "Create team with existing staff",
      "Idempotent transaction includes sequence, memberships, audit and saved201 result. Canonical hash binds POST /api/v1/sales-teams and parsed body with sorted object keys and sorted member ID set. Replay checks current permission. Different keys allow same-name teams. No user creation or permission promotion.",
      {
        parameters: [
          parameter(
            "Idempotency-Key",
            text(128, { minLength: 1, pattern: "^[!-~]+$" }),
            "Retain for unknown-outcome retry",
            "header",
            true,
          ),
        ],
        requestBody: body("TeamCreateInput", demo),
        responses: {
          201: response("Created or authorized exact replay", "TeamResponse", {
            data: example,
          }),
          ...errors,
        },
      },
    ),
  },
  "/sales-teams/{id}": {
    get: op(
      "getSalesTeam",
      "Read team profile and assignment summary",
      "Archived team historical reads retain active membership access. Removed users lose team-derived access despite stale claims. Default hides inactive members; includeInactiveMembers includes removal metadata. Unknown legacy creator/activation metadata remains nullable and is warned; no historical facts are inferred. Examples max20 and visibility filtered; no unbounded history.",
      {
        parameters: [
          id,
          parameter(
            "includeInactiveMembers",
            { type: "boolean", default: false },
            "Include inactive rows/removal metadata",
          ),
        ],
        responses: {
          200: response("Team profile", "TeamResponse", { data: example }),
          400: errors[400],
          401: errors[401],
          404: errors[404],
          500: errors[500],
        },
      },
    ),
    patch: op(
      "patchSalesTeam",
      "Edit profile, manager and complete member set atomically",
      "Version under parent UPDATE lock. Supplied memberIds replaces active set; omission preserves. Every final member eligible/active; manager included. All manager/member changes need reason. Removals check all active owned records in this team only; any blocker rolls back entire request. Deactivate durable pairs; re-add updates last activation while preserving first activation/actor. New version once; no-op has no audit/version increment. Archived repairs remain Archived.",
      {
        parameters: [id],
        requestBody: body("TeamPatchInput", {
          version: 3,
          managerId: demo.managerId,
          memberIds: [demo.managerId, demo.memberIds[2]],
          reason: "Merchandiser A moved to another team",
        }),
        responses: {
          200: response(
            "Updated detail including inactive memberships",
            "TeamResponse",
            { data: { ...example, version: 4 } },
          ),
          ...errors,
        },
      },
    ),
  },
  "/sales-teams/{id}/archive": {
    post: op(
      "archiveSalesTeam",
      "Archive after resolving active assignments",
      "Blocks Active customers; every nondeleted Draft/PendingApproval/Approved/Issued/Accepted quotation revision; Draft/Confirmed/InProgress/PartiallyDelivered/Delivered orders. Delivered still blocks. Stale expired Issued status blocks without hidden mutation. Other terminal/deleted documents and archived customers do not block. Preserves membership/users/history/snapshots. Team UPDATE + fresh READ COMMITTED blocker reads never takes reverse entity locks.",
      {
        parameters: [id],
        requestBody: body("LifecycleInput", {
          version: 4,
          reason: "Team merged into regional sales",
        }),
        responses: {
          200: response("Archived team", "TeamResponse", {
            data: {
              ...example,
              status: "Archived",
              version: 5,
              archivedAt: "2026-10-19T01:00:00.000Z",
              archivedBy: example.createdBy,
              archiveReason: "Team merged into regional sales",
              eligibleForAssignment: false,
              allowedActions: ["edit", "reactivate"],
            },
          }),
          ...errors,
        },
      },
    ),
  },
  "/sales-teams/{id}/reactivate": {
    post: op(
      "reactivateSalesTeam",
      "Reactivate an eligible archived team",
      "Revalidates active staff, manager approval role and final manager membership. Repair via PATCH first. Clears current archive metadata, preserves append-only history and opens no commercial documents.",
      {
        parameters: [id],
        requestBody: body("LifecycleInput", {
          version: 5,
          reason: "Export sales operation resumed",
        }),
        responses: {
          200: response("Active team", "TeamResponse", {
            data: { ...example, version: 6 },
          }),
          ...errors,
        },
      },
    ),
  },
};
const doc = {
  openapi: "3.0.3",
  info: {
    title: "Garment ERP Sales Teams",
    version: "1.0.0",
    description:
      "Exactly six Sales Teams endpoints. Staff directory and one-record reassignment are separately documented supporting dependencies. Single company; no login/invitation/messaging, payroll, targets or commission APIs. Legacy metadata remains NULL, with warnings, instead of invented actors/timestamps.",
  },
  servers: [
    {
      url: "http://127.0.0.1:4102/api/v1",
      description:
        "Local Admin development instance; fixed actor configured server-side, prohibited in production",
    },
  ],
  paths: teamPaths,
  components: { schemas },
};
writeFileSync(
  fileURLToPath(new URL("../docs/sales-teams.openapi.yaml", import.meta.url)),
  YAML.stringify(doc, { lineWidth: 100 }),
);
const supportSchemas = {
  ...schemas,
  Staff: object(
    {
      id: uuid,
      displayName: text(150),
      role: {
        type: "string",
        enum: ["Sales", "SalesManager", "Admin", "Viewer"],
      },
      managerEligible: boolean,
    },
    ["id", "displayName", "role", "managerEligible"],
  ),
  StaffList: object(
    {
      data: array(ref("Staff"), 100),
      meta: object({ page: count, pageSize: count, total: count }, [
        "page",
        "pageSize",
        "total",
      ]),
    },
    ["data", "meta"],
  ),
  ReassignmentInput: object(
    {
      entityType: {
        type: "string",
        enum: ["customer", "quotation", "salesOrder"],
      },
      entityId: uuid,
      salesTeamId: uuid,
      ownerId: uuid,
      version,
      reason,
    },
    ["entityType", "entityId", "salesTeamId", "ownerId", "version", "reason"],
  ),
  ReassignmentResult: object(
    {
      data: {
        oneOf: [
          {
            $ref: "./customers.openapi.yaml#/components/schemas/CustomerDetail",
          },
          {
            $ref: "./quotations.openapi.yaml#/components/schemas/QuotationDetail",
          },
          {
            $ref: "./sales-orders.openapi.yaml#/components/schemas/OrderDetail",
          },
        ],
      },
    },
    ["data"],
  ),
};
const support = {
  openapi: "3.0.3",
  info: {
    title: "Garment ERP Team Supporting Dependencies",
    version: "1.0.0",
    description:
      "Separate from the six team routes. Existing staff lookup and one-record operational reassignment; no account administration.",
  },
  servers: doc.servers,
  paths: {
    "/users": {
      get: {
        operationId: "listAssignableStaff",
        summary: "Minimal eligible active staff lookup",
        description:
          "Requires Admin/team-management capability or assignment capability. Principals with team-management capability see all eligible staff; assignment-only principals see active membership users within their current scopes. No email, secrets or login fields. Supports display-name literal search; pageSize max100.",
        parameters: [
          parameter(
            "status",
            { type: "string", enum: ["Active"], default: "Active" },
            "Active only",
          ),
          parameter(
            "q",
            text(100, { minLength: 1 }),
            "Literal display-name substring",
          ),
          parameter(
            "managerEligible",
            { type: "boolean" },
            "Filter manager-role eligibility",
          ),
          parameter(
            "page",
            { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
            "Page",
          ),
          parameter(
            "pageSize",
            { type: "integer", minimum: 1, maximum: 100, default: 20 },
            "Page size",
          ),
        ],
        responses: {
          200: response("Eligible directory", "StaffList", {
            data: [
              {
                id: demo.managerId,
                displayName: "Demo SalesManager",
                role: "SalesManager",
                managerEligible: true,
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1 },
          }),
          ...errors,
        },
      },
    },
    "/assignments/reassign": {
      post: {
        operationId: "reassignCommercialRecord",
        summary: "Reassign one existing customer/open document",
        description:
          "Entity version, reason, active target team/member required. Admin global; customer transfer needs customers:write + customers:assign; document transfer needs assignments:write. Non-Admins need live source AND target scopes. Customer delegates to the existing aggregate PATCH ownership service. Open quotes/orders update operational ownership/version/audit only. Terminal documents reject. Sorted team locks after entity/family and customer guards. Existing-ownership repair permits unrelated stale ordinary members while still validating target manager/owner; new commercial creation stays blocked until team repair.",
        requestBody: body("ReassignmentInput", {
          entityType: "quotation",
          entityId: "80000000-0000-4000-8000-000000000001",
          salesTeamId: example.id,
          ownerId: demo.memberIds[2],
          version: 6,
          reason: "Reassigned before member removal",
        }),
        responses: {
          200: response(
            "Updated entity; no-op keeps entity version",
            "ReassignmentResult",
          ),
          ...errors,
        },
      },
    },
  },
  components: { schemas: supportSchemas },
};
writeFileSync(
  fileURLToPath(
    new URL("../docs/team-supporting-apis.openapi.yaml", import.meta.url),
  ),
  YAML.stringify(support, { lineWidth: 100 }),
);
console.log(
  "Generated six Sales Teams operations + two separately documented dependencies",
);
