import type { Types } from "mongoose";
import { OrderEvent } from "./order-events.model";
import type { OrderEventAction } from "./order-events.model";

export interface RecordEventInput {
  roundId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  actorParticipantId?: Types.ObjectId | null;
  actorRole?: "participant" | "organizer" | "system";
  entity: "order" | "selection" | "round";
  entityId: string;
  action: OrderEventAction;
  field?: string | null;
  before?: unknown;
  after?: unknown;
  deltaCents?: number | null;
}

export const recordOrderEvent = async (input: RecordEventInput) => {
  return OrderEvent.create({
    roundId: input.roundId,
    orderId: input.orderId ?? null,
    actorParticipantId: input.actorParticipantId ?? null,
    actorRole: input.actorRole ?? "system",
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    field: input.field ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    deltaCents: input.deltaCents ?? null,
    changedAt: new Date(),
  });
};

export const getRoundMoneyTimelineService = async (roundId: Types.ObjectId) => {
  const events = await OrderEvent.find({ roundId })
    .sort({ changedAt: 1, _id: 1 })
    .lean();

  let running = 0;
  return events.map((event) => {
    running += event.deltaCents ?? 0;
    return {
      at: event.changedAt,
      actor: event.actorRole,
      action: event.action,
      entity: event.entity,
      field: event.field,
      before: event.before,
      after: event.after,
      deltaCents: event.deltaCents ?? 0,
      runningCents: running,
    };
  });
};
