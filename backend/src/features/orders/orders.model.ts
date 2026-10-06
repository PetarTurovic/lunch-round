import mongoose, { Schema } from "mongoose";
import type { Types } from "mongoose";

export const ORDER_STATUSES = [
  "open",
  "locked",
  "ordered",
  "cancelled",
] as const;
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
    storeSnapshot: {
      name: { type: String, required: true, maxlength: 200 },
      slug: { type: String, maxlength: 200, default: null },
    },
    status: {
      type: String,
      required: true,
      enum: ORDER_STATUSES,
      default: "open",
    },
    currency: { type: String, required: true, uppercase: true, maxlength: 3 },

    subtotalCents: { type: Number, required: true, default: 0, min: 0 },
    adjustmentsCents: { type: Number, required: true, default: 0 },
    totalCents: { type: Number, required: true, default: 0, min: 0 },
    paidCents: { type: Number, required: true, default: 0, min: 0 },

    adjustments: {
      type: [
        new Schema<OrderAdjustment>(
          {
            label: { type: String, required: true, maxlength: 80 },
            type: {
              type: String,
              required: true,
              enum: ["tip", "fee", "discount"],
            },
            amountCents: { type: Number, required: true, min: 0 },
            allocation: {
              type: String,
              required: true,
              enum: ["proportional", "equal"],
              default: "proportional",
            },
          },
          { _id: true },
        ),
      ],
      default: [],
    },

    payments: {
      type: [
        new Schema<OrderPayment>(
          {
            participantId: { type: Schema.Types.ObjectId, required: true },
            amountCents: { type: Number, required: true, min: 0 },
            method: { type: String, maxlength: 40, default: null },
            note: { type: String, maxlength: 300, default: null },
            receivedAt: { type: Date, default: Date.now },
          },
          { _id: true },
        ),
      ],
      default: [],
    },

    lockedAt: { type: Date, default: null },
    orderedAt: { type: Date, default: null },
  },
  { collection: "orders", timestamps: true, versionKey: false },
);

OrderSchema.index({ roundId: 1, createdAt: 1 });
OrderSchema.index({ storeId: 1 });

export const Order =
  mongoose.models.Order ?? mongoose.model("Order", OrderSchema);

export default Order;
