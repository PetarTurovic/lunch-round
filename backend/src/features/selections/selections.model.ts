import mongoose, { Schema, type Types } from "mongoose";
import type { EmbeddedOrderItem } from "../rounds/rounds.model";

export const SELECTION_STATUSES = ["active", "removed"] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export interface SelectionDocument extends EmbeddedOrderItem {
  orderId: Types.ObjectId;
  roundId: Types.ObjectId;
  storeId: string;
  updatedAt: Date;
}

export const SelectionSchema = new Schema<SelectionDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    participantId: { type: Schema.Types.ObjectId, ref: "Participant", required: true },
    roundId: { type: Schema.Types.ObjectId, ref: "Round", required: true },
    storeId: { type: String, required: true },
    itemId: { type: String, required: true },
    sectionKey: String,
    itemSnapshot: { name: String, imageUrl: String },
    quantity: { type: Number, default: 1 },
    menuUnitPriceCents: { type: Number, required: true },
    unitPriceCents: { type: Number, required: true },
    priceOverridden: { type: Boolean, default: false },
    note: String,
    status: { type: String, enum: SELECTION_STATUSES, default: "active" },
  },
  { collection: "selections", timestamps: true, versionKey: false },
);

export const Selection = mongoose.models.Selection ?? mongoose.model("Selection", SelectionSchema);
export default Selection;
