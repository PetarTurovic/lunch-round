import mongoose, { Schema } from 'mongoose';
import type { Types } from 'mongoose';

export const ORDER_EVENT_ACTIONS = [
  'order_created',
  'order_status_changed',
  'selection_added',
  'selection_removed',
  'quantity_changed',
  'price_overridden',
  'price_restored',
  'adjustment_added',
  'adjustment_removed',
  'payment_recorded',
  'round_settled',
] as const;
export type OrderEventAction = (typeof ORDER_EVENT_ACTIONS)[number];

export interface OrderEventDocument {
  _id: Types.ObjectId;
  roundId: Types.ObjectId;
  orderId: Types.ObjectId | null;
  actorParticipantId: Types.ObjectId | null;
  actorRole: 'participant' | 'organizer' | 'system';
  entity: 'order' | 'selection' | 'round';
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
    roundId: { type: Schema.Types.ObjectId, ref: 'Round', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    actorParticipantId: { type: Schema.Types.ObjectId, default: null },
    actorRole: {
      type: String,
      required: true,
      enum: ['participant', 'organizer', 'system'],
      default: 'system',
    },
    entity: {
      type: String,
      required: true,
      enum: ['order', 'selection', 'round'],
    },
    entityId: { type: String, required: true, maxlength: 200 },
    action: { type: String, required: true, enum: ORDER_EVENT_ACTIONS },
    field: { type: String, maxlength: 100, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    deltaCents: { type: Number, default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { collection: 'order_events', timestamps: false, versionKey: false },
);

OrderEventSchema.index({ roundId: 1, changedAt: -1 });
OrderEventSchema.index({ orderId: 1, changedAt: -1 });
OrderEventSchema.index({ roundId: 1, action: 1, changedAt: -1 });

export const OrderEvent =
  mongoose.models.OrderEvent ??
  mongoose.model('OrderEvent', OrderEventSchema);

export default OrderEvent;