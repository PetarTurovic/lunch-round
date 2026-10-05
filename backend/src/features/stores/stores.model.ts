import mongoose, { Schema } from 'mongoose';
import { IStore } from './stores.types';

export interface StoreDocument extends Omit<IStore, '_id'> {
  _id: string;
}
export const StoreSchema = new Schema<StoreDocument>(
  {
    _id: {
      type: String,
      required: true,
      maxlength: 100,
    },
    platform: {
      type: String,
      required: true,
      enum: ['glovo', 'ubereats', 'doordash', 'grubhub', 'uber eats', 'deliveroo'],
      index: true,
    },
    platformStoreId: {
      type: String,
      required: true,
      maxlength: 100,
    },
    country: {
      type: String,
      required: true,
      maxlength: 2,
      index: true,
    },
    city: {
      type: String,
      required: true,
      index: true,
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    lat: {
      type: Number,
    },
    lon: {
      type: Number,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      maxlength: 200,
      unique: true,
    },
    url: {
      type: String,
      maxlength: 500,
    },
    tag: {
      type: String,
      maxlength: 100,
    },
    category: {
      type: String,
      maxlength: 50,
      default: 'RESTAURANT',
    },
    rating: {
      type: String,
      maxlength: 20,
    },
    ratingVotes: {
      type: String,
      maxlength: 50,
    },
    itemCount: {
      type: Number,
      min: 0,
    },
    sectionCount: {
      type: Number,
      min: 0,
    },
    deliveryInfo: {
      deliveryTime: String,
      deliveryFee: String,
      minOrder: String,
    },
    deliveryZone: [String],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    collection: 'stores',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    versionKey: false,
  }
);
StoreSchema.index({ platform: 1, platformStoreId: 1 }, { unique: true });
StoreSchema.index({ geo: '2dsphere' });
StoreSchema.index({ platform: 1, city: 1 });
StoreSchema.index({ country: 1, city: 1 });
StoreSchema.index({ isActive: 1, platform: 1 });
export const Store =
  mongoose.models.Store ?? mongoose.model<StoreDocument>('Store', StoreSchema);
