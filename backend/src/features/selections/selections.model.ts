import mongoose, { Schema } from 'mongoose';
import type { Types } from 'mongoose';

export const SELECTION_STATUSES = ['active', 'removed'] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export interface SelectionDocument {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  participantId: Types.ObjectId;
  roundId: Types.ObjectId;

  storeId: string;
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
  status: SelectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const SelectionSchema = new Schema<SelectionDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    roundId: { type: Schema.Types.ObjectId, ref: 'Round', required: true },

    storeId: { type: String, required: true },
    itemId: { type: String, required: true },
    sectionKey: { type: String, maxlength: 200, default: null },
    itemSnapshot: {
      name: { type: String, required: true, maxlength: 300 },
      imageUrl: { type: String, maxlength: 500, default: null },
    },

    quantity: { type: Number, required: true, min: 1, max: 99, default: 1 },

    menuUnitPriceCents: { type: Number, required: true, min: 0 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    priceOverridden: { type: Boolean, default: false },

    note: { type: String, maxlength: 300, default: null },
    status: {
      type: String,
      required: true,
      enum: SELECTION_STATUSES,
      default: 'active',
    },
  },
  { collection: 'selections', timestamps: true, versionKey: false },
);

SelectionSchema.index({ orderId: 1, participantId: 1, status: 1 });
SelectionSchema.index({ orderId: 1, status: 1 });
SelectionSchema.index({ roundId: 1, participantId: 1, status: 1 });
SelectionSchema.index(
  { orderId: 1, participantId: 1, itemId: 1 },
  { unique: true },
);

export const Selection =
  mongoose.models.Selection ?? mongoose.model('Selection', SelectionSchema);

export default Selection;