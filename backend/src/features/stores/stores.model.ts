import mongoose, { Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";
import type { StoreRating, StoreLocation, StoreDelivery, StoreTaxonomy, MenuSection } from "./stores.types";

export interface StoreDoc {
  _id: string;
  externalId: string;
  platform: string;
  slug: string;
  name: string;
  currency: string;
  taxonomy: StoreTaxonomy;
  location: StoreLocation;
  rating: StoreRating;
  delivery: StoreDelivery;
  status: "active" | "inactive";
  menu: { sections: MenuSection[] };
  stats: { itemCount: number; sectionCount: number };
  createdAt: Date;
  updatedAt: Date;
}

export type StoreModel = PaginateModel<StoreDoc>;

export const StoreSchema = new Schema(
  {
    _id: { type: String, required: true },
    externalId: { type: String, required: true },
    platform: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    taxonomy: { kind: String, label: String, cuisines: [String], cuisineLabels: [String] },
    location: {
      country: String,
      city: String,
      cityLabel: String,
      coordinates: { type: { type: String, enum: ["Point"] }, coordinates: [Number] },
    },
    rating: { value: Number, scale: String, votes: Number, raw: String },
    delivery: {
      fee: { amount: Number, currency: String },
      minOrder: { amount: Number, currency: String },
      timeMinutes: { min: Number, max: Number, text: String },
    },
    menu: { type: Schema.Types.Mixed, default: { sections: [] } },
    stats: { itemCount: Number, sectionCount: Number, hasImages: Boolean, priceRange: { min: Number, max: Number } },
    source: { url: String, platformSpecific: Schema.Types.Mixed },
  },
  { collection: "stores", timestamps: true, versionKey: false },
);

StoreSchema.plugin(paginate);
StoreSchema.index({ "location.coordinates": "2dsphere" });
StoreSchema.index({ status: 1 });
StoreSchema.index({ "location.city": 1, status: 1 });
StoreSchema.index({ "taxonomy.cuisines": 1, status: 1 });
StoreSchema.index({ "rating.value": -1 });
StoreSchema.index({ name: "text", "taxonomy.cuisines": "text" });

export const Store = (mongoose.models.Store ||
  mongoose.model("Store", StoreSchema)) as unknown as StoreModel;
export default Store;
