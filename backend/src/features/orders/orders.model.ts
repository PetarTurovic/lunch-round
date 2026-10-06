import mongoose, { Schema, type Types } from "mongoose";

export const ORDER_STATUSES = ["open", "locked", "ordered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type AdjustmentType = "tip" | "fee" | "discount";
export type AdjustmentAllocation = "proportional" | "equal";

export interface OrderAdjustment {
  _id: Types.ObjectId;
  label: string;
  type: AdjustmentType;
  amountCents: number;
  allocation: AdjustmentAllocation;
}

export interface OrderPayment {
  _id: Types.ObjectId;
  participantId: Types.ObjectId;
  amountCents: number;
  method?: string | null;
  note?: string | null;
  receivedAt: Date;
}

export interface OrderDocument {
  _id: Types.ObjectId;
  roundId: Types.ObjectId;
  placedByParticipantId: Types.ObjectId | null;
  storeId: string;
  storeSnapshot: { name: string; slug: string | null };
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  adjustmentsCents: number;
  totalCents: number;
  paidCents: number;
  adjustments: OrderAdjustment[];
  payments: OrderPayment[];
  lockedAt?: Date | null;
  orderedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = new Schema<OrderDocument>(
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
