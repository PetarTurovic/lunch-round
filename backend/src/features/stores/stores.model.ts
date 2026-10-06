import mongoose, { Schema } from "mongoose";
import type { PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";
import type {
  ItemOption,
  ItemOptionGroup,
  MenuItem,
  MenuSection,
  StoreDelivery,
  StoreLocation,
  StoreRating,
  StoreTaxonomy,
} from "./stores.types";

const ItemOptionSchema = new Schema<ItemOption>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, maxlength: 300 },
    priceDelta: { type: Number, default: 0 },
    selectedByDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

const ItemOptionGroupSchema = new Schema<ItemOptionGroup>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, maxlength: 500 },
    minSelect: { type: Number, default: 0 },
    maxSelect: { type: Number, default: 1 },
    multiple: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    options: { type: [ItemOptionSchema], default: [] },
  },
  { _id: false },
);

const MenuItemSchema = new Schema<MenuItem>(
  {
    _id: { type: String, required: true },
    externalId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 300 },
    searchName: { type: String, required: true, maxlength: 300 },
    description: { type: String, maxlength: 2000 },
    price: { type: Number, min: 0, default: null },
    imageUrl: { type: String, maxlength: 500 },
    available: { type: Boolean, default: true },
    alsoInSections: { type: [String], default: [] },
    contentHash: { type: String, maxlength: 64 },
    revision: { type: Number, default: 1, min: 1 },
    optionGroups: { type: [ItemOptionGroupSchema], default: [] },
    firstSeenAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  { _id: false },
);

const MenuSectionSchema = new Schema<MenuSection>(
  {
    key: { type: String, required: true },
    title: { type: String, required: true, maxlength: 300 },
    position: { type: Number, default: 0 },
    items: { type: [MenuItemSchema], default: [] },
  },
  { _id: false },
);

const GeoPointSchema = new Schema<StoreLocation["coordinates"]>(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const StoreLocationSchema = new Schema<StoreLocation>(
  {
    country: { type: String, required: true, maxlength: 2, uppercase: true },
    city: { type: String, required: true, maxlength: 100 },
    cityLabel: { type: String, required: true, maxlength: 100 },
    coordinates: { type: GeoPointSchema, required: false, default: undefined },
  },
  { _id: false },
);

const StoreRatingSchema = new Schema<StoreRating>(
  {
    value: { type: Number, min: 0, max: 5, default: null },
    scale: { type: String, enum: ["percent", "five_star"], required: true },
    votes: { type: Number, min: 0, default: null },
    raw: { type: String, maxlength: 50, default: null },
  },
  { _id: false },
);

const StoreDeliverySchema = new Schema<StoreDelivery>(
  {
    fee: {
      amount: { type: Number, min: 0, default: null },
      currency: { type: String, required: true, maxlength: 3 },
    },
    eta: {
      min: { type: Number, min: 0, default: null },
      max: { type: Number, min: 0, default: null },
    },
    minOrder: {
      amount: { type: Number, min: 0, default: null },
      currency: { type: String, required: true, maxlength: 3 },
    },
  },
  { _id: false },
);

const StoreTaxonomySchema = new Schema<StoreTaxonomy>(
  {
    kind: {
      type: String,
      required: true,
      maxlength: 50,
      default: "restaurant",
    },
    cuisines: { type: [String], default: [] },
    cuisineLabels: { type: [String], default: [] },
  },
  { _id: false },
);

export const StoreSchema = new Schema(
  {
    _id: { type: String, required: true, maxlength: 100 },
    slug: { type: String, required: true, maxlength: 200 },
    name: { type: String, required: true, maxlength: 200 },
    platform: { type: String, required: true, maxlength: 50 },
    externalId: { type: String, required: true, maxlength: 100 },
    url: { type: String, maxlength: 500 },
    currency: { type: String, required: true, maxlength: 3, default: "EUR" },
    taxonomy: { type: StoreTaxonomySchema, required: true },
    location: { type: StoreLocationSchema, required: true },
    rating: { type: StoreRatingSchema, required: true },
    delivery: { type: StoreDeliverySchema, required: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    menu: {
      sections: { type: [MenuSectionSchema], default: [] },
    },
    stats: {
      itemCount: { type: Number, min: 0, default: 0 },
      sectionCount: { type: Number, min: 0, default: 0 },
    },
    provenance: {
      firstSeenAt: { type: Date },
      lastSeenAt: { type: Date },
    },
  },
  {
    collection: "stores",
    timestamps: true,
    versionKey: false,
  },
);

StoreSchema.index({ platform: 1, externalId: 1 }, { unique: true });
StoreSchema.index({ slug: 1 }, { unique: true });
StoreSchema.index({ "location.coordinates": "2dsphere" });
StoreSchema.index({ status: 1, platform: 1, "location.city": 1 });
StoreSchema.index({ "location.country": 1, "location.city": 1 });
StoreSchema.index({ "taxonomy.cuisines": 1 });
StoreSchema.index({ "rating.value": -1 });
StoreSchema.index(
  { name: "text", "taxonomy.cuisineLabels": "text" },
  { weights: { name: 10, "taxonomy.cuisineLabels": 5 }, name: "store_search" },
);
StoreSchema.index({ "menu.sections.items.price": 1 });
StoreSchema.index({ "menu.sections.key": 1 });

StoreSchema.plugin(paginate);

export interface StoreDoc {
  _id: string;
  slug: string;
  name: string;
  platform: string;
  externalId: string;
  url?: string;
  currency: string;
  taxonomy: StoreTaxonomy;
  location: StoreLocation;
  rating: StoreRating;
  delivery: StoreDelivery;
  status: "active" | "inactive";
  menu: { sections: MenuSection[] };
  stats: { itemCount: number; sectionCount: number };
  provenance: { firstSeenAt: Date; lastSeenAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

export type StoreModel = PaginateModel<StoreDoc>;

export const Store = (mongoose.models.Store ??
  mongoose.model("Store", StoreSchema)) as unknown as StoreModel;

export default Store;
