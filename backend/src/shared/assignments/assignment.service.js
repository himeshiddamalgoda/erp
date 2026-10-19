import { randomUUID } from "node:crypto";
import { AppError, conflict } from "../errors.js";
import { resolveActor, lockTeams, teamGuard } from "../team-guard.js";
import { assignmentPolicy } from "../../modules/sales-teams/sales-team.policy.js";
import {
  openQuotationStatuses,
  openOrderStatuses,
} from "../../modules/sales-teams/sales-team.repository.js";
export class AssignmentService {
  constructor(repository, customers, quotations, orders) {
    this.r = repository;
    this.customers = customers;
    this.quotations = quotations;
    this.orders = orders;
  }
  async reassign(actor, input, requestId) {
    // Customer PATCH is the existing aggregate ownership service; use its same guard/version/audit rules.
    if (input.entityType === "customer") {
      const current = await this.r.findById("customers", input.entityId);
      if (!current) throw new AppError(404, "NOT_FOUND", "Customer not found");
      assignmentPolicy(
        actor,
        "customer",
        current.salesTeamId,
        input.salesTeamId,
      );
      return this.customers.patch(
        actor,
        input.entityId,
        {
          version: input.version,
          salesTeamId: input.salesTeamId,
          ownerId: input.ownerId,
          reason: input.reason,
        },
        requestId,
      );
    }
    return this.r.transaction(async (t) => {
      const quote = input.entityType === "quotation";
      const entity = quote
        ? (await this.r.locked(input.entityId, t)).quote
        : await this.orders.r.lockedOrder(input.entityId, t);
      assignmentPolicy(
        actor,
        input.entityType,
        entity.salesTeamId,
        input.salesTeamId,
      );
      if (entity.version !== input.version)
        conflict("STALE_VERSION", "Entity changed; reload before reassigning");
      if (
        !(quote ? openQuotationStatuses : openOrderStatuses).includes(
          entity.status,
        )
      )
        conflict(
          "INVALID_TRANSITION",
          "Terminal documents remain historical and cannot be reassigned",
        );
      if (entity.version >= 4294967295) conflict("VERSION_EXHAUSTED");
      // Preserve family/order -> customer -> sorted teams ordering shared with document masters.
      await this.r.findById("customers", entity.customerId, {
        transaction: t,
        lock: t.LOCK.SHARE,
      });
      const teams = await lockTeams(
        this.r,
        [entity.salesTeamId, input.salesTeamId],
        t,
      );
      assignmentPolicy(
        await resolveActor(this.r, actor, t),
        input.entityType,
        entity.salesTeamId,
        input.salesTeamId,
      );
      await teamGuard(this.r, input.salesTeamId, input.ownerId, t, {
        lockedTeams: teams,
        allowStaleMembers: true,
      });
      if (
        entity.salesTeamId === input.salesTeamId &&
        entity.ownerId === input.ownerId
      )
        return quote
          ? this.quotations.detail(actor, entity.id, t)
          : this.orders.detail(actor, entity.id, t);
      const previous = {
        salesTeamId: entity.salesTeamId,
        ownerId: entity.ownerId,
      };
      await entity.update(
        {
          salesTeamId: input.salesTeamId,
          ownerId: input.ownerId,
          version: entity.version + 1,
          updatedAt: new Date(),
          ...(quote ? {} : { updatedBy: actor.id }),
        },
        { transaction: t },
      );
      await this.r.insert(
        "audit_events",
        {
          id: randomUUID(),
          entityType: quote ? "quotation" : "sales_order",
          entityId: entity.id,
          actorId: actor.id,
          action: "AssignmentReassigned",
          fromStatus: entity.status,
          toStatus: entity.status,
          reason: input.reason,
          requestId: requestId || null,
          metadata: {
            from: previous,
            to: { salesTeamId: entity.salesTeamId, ownerId: entity.ownerId },
          },
          createdAt: new Date(),
        },
        { transaction: t },
      );
      return quote
        ? this.quotations.detail(actor, entity.id, t)
        : this.orders.detail(actor, entity.id, t);
    });
  }
}
