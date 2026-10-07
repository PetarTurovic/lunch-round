import mongoose, { Schema, type Types } from "mongoose";
import {
  ORDER_STATUSES,
  type OrderStatus,
  type AdjustmentType,
  type AdjustmentAllocation,
  type EmbeddedAdjustment,
  type EmbeddedPayment,
  type EmbeddedOrder,
} from "../rounds/rounds.model";

export { ORDER_STATUSES, type OrderStatus, type AdjustmentType, type AdjustmentAllocation };
export type OrderAdjustment = EmbeddedAdjustment;
export type OrderPayment = EmbeddedPayment;

export interface OrderDocument extends Omit<EmbeddedOrder, "items"> {
  roundId: Types.ObjectId;
  placedByParticipantId: Types.ObjectId | null;
  updatedAt: Date;
}

export const OrderSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: "Round", required: true },
    placedByParticipantId: { type: Schema.Types.ObjectId, default: null },
    storeId: { type: String, required: true },
    storeSnapshot: { name: String, slug: String },
    status: { type: String, enum: ORDER_STATUSES, default: "open" },
    currency: { type: String, required: true },
    subtotalCents: { type: Number, default: 0 },
    adjustmentsCents: { type: Number, default: 0 },
    totalCents: { type: Number, default: 0 },
    paidCents: { type: Number, default: 0 },
    adjustments: { type: [Object], default: [] },
    payments: { type: [Object], default: [] },
    lockedAt: Date,
    orderedAt: Date,
  },
  { collection: "orders", timestamps: true, versionKey: false },
);

export const Order = mongoose.models.Order ?? mongoose.model("Order", OrderSchema);
export default Order;
