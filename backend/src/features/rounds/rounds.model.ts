import mongoose, { Schema, Types } from "mongoose";
import { createHash, randomBytes } from "node:crypto";

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const generateToken = (): string => randomBytes(24).toString("hex");

export interface RoundItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  storeId?: string;
  storeName?: string;
  section?: string;
  imageUrl?: string;
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

export interface RoundBill {
  settledAt: Date;
  totalCents: number;
  people: { name: string; amountCents: number }[];
}

export interface RoundDocument {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  venue: string;
  location?: { lat: number; lon: number; radiusKm?: number } | null;
  organizer: {
    participantId: Types.ObjectId;
    name: string;
    userId: Types.ObjectId;
  };
  status: "open" | "locked" | "settled";
  closesAt?: Date | null;
  items: RoundItem[];
  orders: RoundOrder[];
  feeCents: number;
  bill?: RoundBill | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RoundSchema = new Schema<RoundDocument>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    venue: { type: String, required: true, default: "Lunch Venue" },
    location: { type: Schema.Types.Mixed, default: null },
    organizer: {
      participantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    status: { type: String, enum: ["open", "locked", "settled"], default: "open" },
    closesAt: { type: Date, default: null },
    items: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          description: String,
          priceCents: { type: Number, required: true, default: 0 },
          storeId: String,
          storeName: String,
          section: String,
          imageUrl: String,
        },
      ],
      default: [],
    },
    orders: {
      type: [
        {
          participantId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true, trim: true },
          userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
          tokenHash: { type: String, required: true },
          joinedAt: { type: Date, default: Date.now },
          quantities: { type: Schema.Types.Mixed, default: {} },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    feeCents: { type: Number, default: 0 },
    bill: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "rounds", timestamps: true, versionKey: false },
);

RoundSchema.index({ "organizer.userId": 1, createdAt: -1 });
RoundSchema.index({ "orders.userId": 1, createdAt: -1 });
RoundSchema.index({ "orders.tokenHash": 1 });

export const Round = mongoose.models.Round ?? mongoose.model<RoundDocument>("Round", RoundSchema);
export default Round;
