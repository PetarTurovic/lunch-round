import mongoose, { Schema } from 'mongoose';

export interface PlatformDocument {
  _id: string;
  name: string;
  ratingScale: 'percent' | 'five_star';
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
    _id: { type: String, required: true, maxlength: 50 },
    name: { type: String, required: true, maxlength: 100 },
    ratingScale: {
      type: String,
      required: true,
      enum: ['percent', 'five_star'],
    },
    ratingMax: { type: Number, required: true, min: 1, default: 5 },
    currency: { type: String, required: true, maxlength: 3, default: 'EUR' },
    country: { type: String, required: true, maxlength: 2 },
    baseUrl: { type: String, maxlength: 500 },
    enabled: { type: Boolean, default: true },
  },
  {
    collection: 'platforms',
    timestamps: true,
    versionKey: false,
  },
);

export const Platform =
  mongoose.models.Platform ??
  mongoose.model('Platform', PlatformSchema);