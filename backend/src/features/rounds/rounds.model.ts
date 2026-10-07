import mongoose, { Schema, type Types } from "mongoose";

export const ROUND_STATUSES = ["open", "locked", "settled"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface RoundItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
}

export interface RoundOrder {
  participantId: Types.ObjectId;
  name: string;
  userId?: Types.ObjectId | null;
  tokenHash: string;
  joinedAt: Date;
  quantities: Record<string, number>;
  updatedAt: Date;
}

export interface RoundBillPerson {
  name: string;
  amountCents: number;
}

export interface RoundBill {
  settledAt: Date;
  totalCents: number;
  people: RoundBillPerson[];
}

export interface RoundDocument {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  venue: string;
  organizer: {
    participantId: Types.ObjectId;
    name: string;
    userId: Types.ObjectId;
  };
  status: RoundStatus;
  closesAt?: Date | null;
  items: RoundItem[];
  orders: RoundOrder[];
  feeCents: number;
  bill?: RoundBill | null;
  createdAt: Date;
  updatedAt: Date;
}

const RoundItemSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    priceCents: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const RoundOrderSchema = new Schema(
  {
    participantId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tokenHash: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    quantities: { type: Map, of: Number, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export const RoundSchema = new Schema<RoundDocument>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    venue: { type: String, required: true, default: "Lunch Venue" },
    organizer: {
      participantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    status: { type: String, enum: ROUND_STATUSES, default: "open" },
    closesAt: { type: Date, default: null },
    items: { type: [RoundItemSchema], default: [] },
    orders: { type: [RoundOrderSchema], default: [] },
    feeCents: { type: Number, default: 0 },
    bill: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "rounds", timestamps: true, versionKey: false },
);

RoundSchema.index({ "organizer.userId": 1, createdAt: -1 });
RoundSchema.index({ "orders.userId": 1, createdAt: -1 });
RoundSchema.index({ "orders.tokenHash": 1 });
RoundSchema.index({ status: 1, closesAt: 1 });

export const Round = mongoose.models.Round ?? mongoose.model("Round", RoundSchema);
export default Round;
