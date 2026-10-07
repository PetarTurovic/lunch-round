import mongoose, { Schema } from "mongoose";

export interface PlatformDocument {
  _id: string;
  name: string;
  ratingScale: "percent" | "five_star";
  ratingMax: number;
  currency: string;
  country: string;
  baseUrl?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PlatformSchema = new Schema<PlatformDocument>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    ratingScale: { type: String, required: true, enum: ["percent", "five_star"] },
    ratingMax: { type: Number, default: 5 },
    currency: { type: String, default: "EUR" },
    country: { type: String, required: true },
    baseUrl: String,
    enabled: { type: Boolean, default: true },
  },
  { collection: "platforms", timestamps: true, versionKey: false },
);

export const Platform = mongoose.models.Platform ?? mongoose.model("Platform", PlatformSchema);
