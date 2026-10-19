import { randomUUID } from "node:crypto";
import { AppError, conflict, invalid } from "../../shared/errors.js";
import { parse, eventSchema } from "./sales-order.schemas.js";
import { hash } from "./sales-order.service.js";
// No HTTP route: an upstream integration must authenticate its credentials here.
export function createFulfilmentAdapter(
  service,
  { authorizeIntegration } = {},
) {
  return {
    async applyFulfilmentEvent(credential, input) {
      const principal = await authorizeIntegration?.(credential);
      if (
        !principal ||
        (principal.source === "demo" &&
          process.env.NODE_ENV === "production") ||
        !["demo", "integration"].includes(principal.source) ||
        principal.provider !== input.provider
      )
        throw new AppError(
          403,
          "UNTRUSTED_INTEGRATION",
          "Trusted integration credentials are required",
        );
      const body = parse(eventSchema, input);
      if (new Date(body.occurredAt).valueOf() > Date.now() + 300000)
        invalid(
          "occurredAt",
          "Event time cannot be more than five minutes in the future",
        );
      const fingerprint = hash({
        ...body,
        lines: body.lines
          .slice()
          .sort((a, b) => a.orderLineId.localeCompare(b.orderLineId)),
        source: principal.source,
      });
      const r = service.r;
      return service.transaction(async (t) => {
        // Reuse the durable idempotency table? Events deduplicate by provider/event identity.
        // Order-first lock is shared with confirm, claim, hold, amend and cancel.
        const o = await r.lockedOrder(body.orderId, t);
        const h = await r.handoff(o.id, t, true);
        const lines = await r.lines(o.id, t, true);
        const old = await r.one("fulfilment_events", {
          where: {
            provider: body.provider,
            externalEventId: body.externalEventId,
          },
          transaction: t,
        });
        if (old) {
          if (old.payloadHash !== fingerprint)
            conflict(
              "IDEMPOTENCY_KEY_REUSED",
              "External event identity has a different payload",
            );
          return {
            orderId: o.id,
            status: o.status,
            version: o.version,
            replayed: true,
          };
        }
        if (
          o.isOnHold ||
          ![
            "Confirmed",
            "InProgress",
            "PartiallyDelivered",
            "Delivered",
          ].includes(o.status)
        )
          conflict(
            "INVALID_TRANSITION",
            "Order cannot accept fulfilment events in its current state",
          );
        if (["Failed", "Cancelled"].includes(h?.status))
          conflict(
            "INVALID_TRANSITION",
            "Reconcile the handoff before applying fulfilment",
          );
        if (o.status === "Delivered")
          conflict(
            "INVALID_TRANSITION",
            "Late new activity on a delivered order requires reconciliation",
          );
        if (body.eventType !== "ProductionStarted" && !body.lines.length)
          invalid(
            "lines",
            "Shipment and delivery events require line quantities",
          );
        const seen = new Set();
        const progress = await r.delivered(o.id, lines, t);
        for (const [i, l] of body.lines.entries()) {
          const line = lines.find((x) => x.id === l.orderLineId);
          if (!line || seen.has(l.orderLineId))
            invalid(
              `lines[${i}].orderLineId`,
              "Line must belong to this order and occur once",
            );
          seen.add(l.orderLineId);
          if (
            l.qty > line.quantity ||
            (body.eventType === "DeliveryConfirmed" &&
              l.qty +
                progress.find((p) => p.orderLineId === line.id).deliveredQty >
                line.quantity)
          )
            invalid(
              `lines[${i}].qty`,
              "Quantity exceeds the remaining order line quantity",
            );
        }
        const event = await r.insert(
          "fulfilment_events",
          {
            id: randomUUID(),
            salesOrderId: o.id,
            provider: body.provider,
            externalEventId: body.externalEventId,
            eventType: body.eventType,
            externalReference: body.externalReference || null,
            payloadHash: fingerprint,
            source: principal.source,
            occurredAt: new Date(body.occurredAt),
            receivedAt: new Date(),
          },
          { transaction: t },
        );
        if (body.lines.length)
          await r.insertMany(
            "fulfilment_event_lines",
            body.lines.map((l) => ({
              id: randomUUID(),
              eventId: event.id,
              salesOrderLineId: l.orderLineId,
              quantity: l.qty,
            })),
            { transaction: t },
          );
        const after = await r.delivered(o.id, lines, t);
        let status = o.status;
        if (body.eventType === "DeliveryConfirmed")
          status = after.every((p) => p.remainingQty === 0)
            ? "Delivered"
            : "PartiallyDelivered";
        else if (
          body.eventType === "ProductionStarted" &&
          o.status === "Confirmed"
        )
          status = "InProgress";
        const from = o.status;
        await service.save(o, { status }, t);
        await r.audit(o, null, body.eventType, from, null, null, t, {
          eventId: event.id,
          provider: body.provider,
          externalEventId: body.externalEventId,
          source: principal.source,
        });
        return {
          orderId: o.id,
          status: o.status,
          version: o.version,
          replayed: false,
        };
      });
    },
  };
}
