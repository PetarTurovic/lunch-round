import mongoose, { Schema } from 'mongoose';
import type { Types } from 'mongoose';

export const ROUND_STATUSES = ['open', 'locked', 'ordered', 'settled'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface RoundSettlementLine {
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
    userId?: Types.ObjectId | null;
  };
  shortlist: string[];
  status: RoundStatus;
  closesAt?: Date | null;
  settlement?: RoundSettlement | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RoundSchema = new Schema<RoundDocument>(
  {
    slug: { type: String, required: true, maxlength: 32 },
    title: { type: String, required: true, maxlength: 120, trim: true },
    notes: { type: String, maxlength: 500 },
    currency: { type: String, required: true, uppercase: true, maxlength: 3 },
    organizer: {
      participantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true, maxlength: 100 },
      userId: { type: Schema.Types.ObjectId, default: null },
    },
    shortlist: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: 'A round needs at least one restaurant to choose from',
      },
    },
    status: {
      type: String,
      required: true,
      enum: ROUND_STATUSES,
      default: 'open',
    },
    closesAt: { type: Date, default: null },
    settlement: { type: Schema.Types.Mixed, default: null },
  },
  { collection: 'rounds', timestamps: true, versionKey: false },
);

RoundSchema.index({ slug: 1 }, { unique: true });
RoundSchema.index({ 'organizer.userId': 1, createdAt: -1 });
RoundSchema.index({ status: 1, closesAt: 1 });

export const Round =
  mongoose.models.Round ?? mongoose.model('Round', RoundSchema);

export default Round;