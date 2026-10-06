import mongoose, { Schema, type Types } from "mongoose";

export const ORDER_EVENT_ACTIONS = [
  "order_created", "order_status_changed", "selection_added", "selection_removed",
  "quantity_changed", "price_overridden", "price_restored", "adjustment_added",
  "adjustment_removed", "payment_recorded", "round_settled",
] as const;
export type OrderEventAction = (typeof ORDER_EVENT_ACTIONS)[number];

export interface OrderEventDocument {
  _id: Types.ObjectId;
  roundId: Types.ObjectId;
  orderId: Types.ObjectId | null;
  actorParticipantId: Types.ObjectId | null;
  actorRole: "participant" | "organizer" | "system";
  entity: "order" | "selection" | "round";
  entityId: string;
  action: OrderEventAction;
  field?: string | null;
  before?: unknown;
  after?: unknown;
  deltaCents?: number | null;
  changedAt: Date;
}

export const OrderEventSchema = new Schema<OrderEventDocument>(
  {
    roundId: { type: Schema.Types.ObjectId, ref: "Round", required: true },
    orderId: { type: Schema.Types.ObjectId, default: null },
    actorParticipantId: { type: Schema.Types.ObjectId, default: null },
    actorRole: { type: String, enum: ["participant", "organizer", "system"], default: "system" },
    entity: { type: String, enum: ["order", "selection", "round"], required: true },
    entityId: { type: String, required: true },
    action: { type: String, enum: ORDER_EVENT_ACTIONS, required: true },
    field: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    deltaCents: Number,
    changedAt: { type: Date, default: Date.now },
  },
  { collection: "order_events", timestamps: false, versionKey: false },
);

OrderEventSchema.index({ roundId: 1, changedAt: -1 });
export const OrderEvent = mongoose.models.OrderEvent ?? mongoose.model("OrderEvent", OrderEventSchema);
export default OrderEvent;
