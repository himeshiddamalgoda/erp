import { AppError } from "../shared/errors.js";
// Disabled unless explicitly wired to a real, downstream-idempotent adapter.
export function createHandoffWorker(
  service,
  { enabled = false, adapter } = {},
) {
  const r = service.r;
  async function claim(orderId) {
    if (!enabled || !adapter)
      throw new AppError(
        503,
        "HANDOFF_DISABLED",
        "No production handoff adapter is configured",
      );
    return service.transaction(async (t) => {
      const o = await r.lockedOrder(orderId, t);
      const h = await r.handoff(orderId, t, true);
      if (
        o.status !== "Confirmed" ||
        o.isOnHold ||
        !h ||
        h.status !== "Queued" ||
        h.claimedAt ||
        (await r.hasActivity(orderId, t))
      )
        return null;
      await r.save(
        h,
        {
          status: "Claimed",
          claimedAt: new Date(),
          attemptCount: h.attemptCount + 1,
          version: h.version + 1,
          updatedAt: new Date(),
        },
        { transaction: t },
      );
      await service.save(o, {}, t);
      await r.audit(o, null, "handoff_claim", "Confirmed", null, null, t, {
        handoffId: h.id,
        documentRevision: h.documentRevision,
      });
      return {
        id: h.id,
        orderId,
        documentRevision: h.documentRevision,
        payload: h.payload,
        idempotencyKey: `sales-order-handoff:${h.id}`,
      };
    });
  }
  async function record(claimed, status, externalReference) {
    return service.transaction(async (t) => {
      const o = await r.lockedOrder(claimed.orderId, t);
      const h = await r.handoff(o.id, t, true);
      if (h.id !== claimed.id || !["Claimed", "Dispatched"].includes(h.status))
        throw new AppError(
          409,
          "INVALID_TRANSITION",
          "Handoff requires reconciliation",
        );
      await r.save(
        h,
        {
          status,
          externalReference: externalReference || h.externalReference,
          ...(status === "Dispatched"
            ? { dispatchedAt: new Date() }
            : status === "Acknowledged"
              ? { acknowledgedAt: new Date() }
              : {
                  lastError:
                    "Adapter outcome requires reconciliation; inspect protected integration logs",
                }),
          version: h.version + 1,
          updatedAt: new Date(),
        },
        { transaction: t },
      );
      await service.save(o, {}, t);
      await r.audit(
        o,
        null,
        `handoff_${status.toLowerCase()}`,
        o.status,
        null,
        null,
        t,
        { handoffId: h.id },
      );
      return { status };
    });
  }
  return {
    claim,
    async runOne(orderId) {
      const item = await claim(orderId);
      if (!item) return null;
      try {
        const result = await adapter.dispatch(item);
        if (!result?.externalReference)
          throw new Error("Adapter must return a durable external reference");
        await record(item, "Dispatched", result.externalReference);
        if (result.acknowledged === true)
          await record(item, "Acknowledged", result.externalReference);
        return result;
      } catch (error) {
        await record(item, "Failed");
        throw error;
      }
    },
  };
}
