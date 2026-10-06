import type { Types } from "mongoose";
import { OrderEvent, type OrderEventAction } from "./order-events.model";

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

export const recordOrderEvent = async (input: RecordEventInput) =>
  OrderEvent.create({
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

export const getRoundMoneyTimelineService = async (roundId: Types.ObjectId) => {
  const events = await OrderEvent.find({ roundId }).sort({ changedAt: 1, _id: 1 }).lean();
  let running = 0;
  return events.map((e) => ({
    at: e.changedAt,
    actor: e.actorRole,
    action: e.action,
    entity: e.entity,
    field: e.field,
    before: e.before,
    after: e.after,
    deltaCents: e.deltaCents ?? 0,
    runningCents: (running += e.deltaCents ?? 0),
  }));
};
