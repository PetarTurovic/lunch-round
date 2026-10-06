import mongoose, { Schema } from "mongoose";
import type { Types } from "mongoose";

export const ROUND_STATUSES = ["open", "locked", "ordered", "settled"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ORDER_STATUSES = [
  "open",
  "locked",
  "ordered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type AdjustmentType = "tip" | "fee" | "discount";
export type AdjustmentAllocation = "proportional" | "equal";

export interface ShortlistStoreSnapshot {
  _id: string; // storeId, e.g. "glovo:9500"
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
  itemSnapshot: {
    name: string;
    imageUrl?: string | null;
  };
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
  storeSnapshot: {
    name: string;
    slug: string | null;
  };
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
  organizer: {
    participantId: Types.ObjectId;
    name: string;
    userId: Types.ObjectId;
  };
  shortlist: ShortlistStoreSnapshot[];
  participants: EmbeddedParticipant[];
  orders: EmbeddedOrder[];
  status: RoundStatus;
  closesAt?: Date | null;
  settlement?: RoundSettlement | null;
  createdAt: Date;
  updatedAt: Date;
}

const ShortlistStoreSchema = new Schema<ShortlistStoreSnapshot>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 200 },
    slug: { type: String, default: null },
    platform: { type: String, required: true },
    currency: { type: String, required: true },
    rating: { type: Number, default: null },
    itemCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const ParticipantSchema = new Schema<EmbeddedParticipant>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  name: { type: String, required: true, maxlength: 100, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  tokenHash: { type: String, required: true, maxlength: 64 },
  joinedAt: { type: Date, default: Date.now },
  claimedAt: { type: Date, default: null },
});

const OrderItemSchema = new Schema<EmbeddedOrderItem>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  participantId: { type: Schema.Types.ObjectId, required: true },
  itemId: { type: String, required: true },
  sectionKey: { type: String, default: null },
  itemSnapshot: {
    name: { type: String, required: true, maxlength: 300 },
    imageUrl: { type: String, default: null },
  },
  quantity: { type: Number, required: true, min: 1, max: 99, default: 1 },
  menuUnitPriceCents: { type: Number, required: true, min: 0 },
  unitPriceCents: { type: Number, required: true, min: 0 },
  priceOverridden: { type: Boolean, default: false },
  note: { type: String, maxlength: 300, default: null },
  status: {
    type: String,
    required: true,
    enum: ["active", "removed"],
    default: "active",
  },
  createdAt: { type: Date, default: Date.now },
});

const AdjustmentSchema = new Schema<EmbeddedAdjustment>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  label: { type: String, required: true, maxlength: 80 },
  type: { type: String, required: true, enum: ["tip", "fee", "discount"] },
  amountCents: { type: Number, required: true, min: 0 },
  allocation: {
    type: String,
    required: true,
    enum: ["proportional", "equal"],
    default: "proportional",
  },
});

const PaymentSchema = new Schema<EmbeddedPayment>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  participantId: { type: Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true, min: 1 },
  method: { type: String, maxlength: 40, default: null },
  note: { type: String, maxlength: 300, default: null },
  receivedAt: { type: Date, default: Date.now },
});

const OrderSchema = new Schema<EmbeddedOrder>({
  _id: {
    type: Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  storeId: { type: String, required: true },
  storeSnapshot: {
    name: { type: String, required: true, maxlength: 200 },
    slug: { type: String, default: null },
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
  adjustments: { type: [AdjustmentSchema], default: [] },
  payments: { type: [PaymentSchema], default: [] },
  items: { type: [OrderItemSchema], default: [] },
  lockedAt: { type: Date, default: null },
  orderedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const RoundSchema = new Schema<RoundDocument>(
  {
    slug: { type: String, required: true, maxlength: 32 },
    title: { type: String, required: true, maxlength: 120, trim: true },
    notes: { type: String, maxlength: 500 },
    currency: { type: String, required: true, uppercase: true, maxlength: 3 },
    organizer: {
      participantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true, maxlength: 100 },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    shortlist: {
      type: [ShortlistStoreSchema],
      default: [],
      validate: {
        validator: (value: ShortlistStoreSnapshot[]) => value.length > 0,
        message: "A round needs at least one restaurant in the shortlist",
      },
    },
    participants: { type: [ParticipantSchema], default: [] },
    orders: { type: [OrderSchema], default: [] },
    status: {
      type: String,
      required: true,
      enum: ROUND_STATUSES,
      default: "open",
    },
    closesAt: { type: Date, default: null },
    settlement: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "rounds", timestamps: true, versionKey: false },
);

RoundSchema.index({ slug: 1 }, { unique: true });
RoundSchema.index({ "organizer.userId": 1, createdAt: -1 });
RoundSchema.index({ "participants.userId": 1, createdAt: -1 });
RoundSchema.index({ "participants.tokenHash": 1 });
RoundSchema.index({ status: 1, closesAt: 1 });

export const Round =
  mongoose.models.Round ?? mongoose.model("Round", RoundSchema);

export default Round;
