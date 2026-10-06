import mongoose, { Schema, type Types } from "mongoose";

export const ROUND_STATUSES = ["open", "locked", "ordered", "settled"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ORDER_STATUSES = ["open", "locked", "ordered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type AdjustmentType = "tip" | "fee" | "discount";
export type AdjustmentAllocation = "proportional" | "equal";

export interface ShortlistStoreSnapshot {
  _id: string;
  name: string;
  slug: string | null;
  platform: string;
  currency: string;
  rating?: number | null;
  itemCount?: number;
}

export interface EmbeddedParticipant {
  _id: Types.ObjectId;
  name: string;
  userId: Types.ObjectId | null;
  tokenHash: string;
  joinedAt: Date;
  claimedAt?: Date | null;
}

export interface EmbeddedOrderItem {
  _id: Types.ObjectId;
  participantId: Types.ObjectId;
  itemId: string;
  sectionKey?: string | null;
  itemSnapshot: { name: string; imageUrl?: string | null };
  quantity: number;
  menuUnitPriceCents: number;
  unitPriceCents: number;
  priceOverridden: boolean;
  note?: string | null;
  status: "active" | "removed";
  createdAt: Date;
}

export interface EmbeddedAdjustment {
  _id: Types.ObjectId;
  label: string;
  type: AdjustmentType;
  amountCents: number;
  allocation: AdjustmentAllocation;
}

export interface EmbeddedPayment {
  _id: Types.ObjectId;
  participantId: Types.ObjectId;
  amountCents: number;
  method?: string | null;
  note?: string | null;
  receivedAt: Date;
}

export interface EmbeddedOrder {
  _id: Types.ObjectId;
  storeId: string;
  storeSnapshot: { name: string; slug: string | null };
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  adjustmentsCents: number;
  totalCents: number;
  paidCents: number;
  adjustments: EmbeddedAdjustment[];
  payments: EmbeddedPayment[];
  items: EmbeddedOrderItem[];
  lockedAt?: Date | null;
  orderedAt?: Date | null;
  createdAt: Date;
}

export interface RoundSettlementLine {
  participantId?: Types.ObjectId;
  participantName?: string;
  orderId: Types.ObjectId | null;
  orderLabel: string;
  itemsCents: number;
  adjustmentsCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
}

export interface RoundSettlement {
  frozenAt: Date;
  currency: string;
  orderTotalCents: number;
  perParticipant: RoundSettlementLine[];
}

export interface RoundDocument {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  notes?: string;
  currency: string;
  organizer: { participantId: Types.ObjectId; name: string; userId: Types.ObjectId };
  shortlist: ShortlistStoreSnapshot[];
  participants: EmbeddedParticipant[];
  orders: EmbeddedOrder[];
  status: RoundStatus;
  closesAt?: Date | null;
  settlement?: RoundSettlement | null;
  createdAt: Date;
  updatedAt: Date;
}

const ShortlistStoreSchema = new Schema(
  { _id: { type: String, required: true }, name: String, slug: String, platform: String, currency: String, rating: Number, itemCount: Number },
  { _id: false },
);

const ParticipantSchema = new Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  tokenHash: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  claimedAt: { type: Date, default: null },
});

const OrderItemSchema = new Schema({
  participantId: { type: Schema.Types.ObjectId, required: true },
  itemId: { type: String, required: true },
  sectionKey: String,
  itemSnapshot: { name: String, imageUrl: String },
  quantity: { type: Number, default: 1 },
  menuUnitPriceCents: { type: Number, required: true },
  unitPriceCents: { type: Number, required: true },
  priceOverridden: { type: Boolean, default: false },
  note: String,
  status: { type: String, enum: ["active", "removed"], default: "active" },
  createdAt: { type: Date, default: Date.now },
});

const AdjustmentSchema = new Schema({
  label: { type: String, required: true },
  type: { type: String, required: true, enum: ["tip", "fee", "discount"] },
  amountCents: { type: Number, required: true },
  allocation: { type: String, enum: ["proportional", "equal"], default: "proportional" },
});

const PaymentSchema = new Schema({
  participantId: { type: Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  method: String,
  note: String,
  receivedAt: { type: Date, default: Date.now },
});

const OrderSchema = new Schema({
  storeId: { type: String, required: true },
  storeSnapshot: { name: String, slug: String },
  status: { type: String, enum: ORDER_STATUSES, default: "open" },
  currency: { type: String, required: true },
  subtotalCents: { type: Number, default: 0 },
  adjustmentsCents: { type: Number, default: 0 },
  totalCents: { type: Number, default: 0 },
  paidCents: { type: Number, default: 0 },
  adjustments: { type: [AdjustmentSchema], default: [] },
  payments: { type: [PaymentSchema], default: [] },
  items: { type: [OrderItemSchema], default: [] },
  lockedAt: Date,
  orderedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

export const RoundSchema = new Schema<RoundDocument>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    notes: String,
    currency: { type: String, required: true },
    organizer: {
      participantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    shortlist: {
      type: [ShortlistStoreSchema],
      default: [],
      validate: [(v: any[]) => v.length > 0, "A round needs at least one restaurant in the shortlist"],
    },
    participants: { type: [ParticipantSchema], default: [] },
    orders: { type: [OrderSchema], default: [] },
    status: { type: String, enum: ROUND_STATUSES, default: "open" },
    closesAt: { type: Date, default: null },
    settlement: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "rounds", timestamps: true, versionKey: false },
);

RoundSchema.index({ "organizer.userId": 1, createdAt: -1 });
RoundSchema.index({ "participants.userId": 1, createdAt: -1 });
RoundSchema.index({ "participants.tokenHash": 1 });
RoundSchema.index({ status: 1, closesAt: 1 });

export const Round = mongoose.models.Round ?? mongoose.model("Round", RoundSchema);
export default Round;
