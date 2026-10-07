import mongoose, { Schema } from "mongoose";

export const StoreSchema = new Schema(
  {
    _id: { type: String, required: true },
    externalId: { type: String, required: true },
    platform: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    taxonomy: Schema.Types.Mixed,
    location: Schema.Types.Mixed,
    rating: Schema.Types.Mixed,
    delivery: Schema.Types.Mixed,
    menu: { type: Schema.Types.Mixed, default: { sections: [] } },
    stats: Schema.Types.Mixed,
  },
  { collection: "stores", timestamps: true, versionKey: false },
);

StoreSchema.index({ status: 1 });
StoreSchema.index({ "location.city": 1, status: 1 });
StoreSchema.index({ name: "text", "taxonomy.cuisines": "text" });

export const Store = mongoose.models.Store ?? mongoose.model("Store", StoreSchema);
export default Store;
