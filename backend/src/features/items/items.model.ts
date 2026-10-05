import mongoose, { Schema } from 'mongoose';
import { IItem } from './items.types';

export interface ItemDocument extends Omit<IItem, '_id'> {
  _id: string;
}
export const ItemSchema = new Schema<ItemDocument>(
  {
    _id: {
      type: String,
      required: true,
      maxlength: 200,
    },
    itemKey: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
    },
    itemUuid: {
      type: String,
      required: true,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
    },
    nameText: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    descriptionText: {
      type: String,
      maxlength: 2000,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    priceRaw: {
      type: String,
      maxlength: 50,
    },
    currency: {
      type: String,
      required: true,
      maxlength: 3,
      default: 'EUR',
      index: true,
    },
    isSoldOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    hasOptions: {
      type: Boolean,
      default: false,
    },
    optionGroups: {
      type: [{
        name: String,
        min: Number,
        max: Number,
        multiple: Boolean,
        required: Boolean,
        options: [{
          name: String,
          priceImpact: Number,
          selectedByDefault: Boolean,
          priceInfo: {
            amount: Number,
            currencyCode: String,
            displayText: String,
          },
        }],
      }],
    },
    imageUrl: {
      type: String,
      maxlength: 500,
    },
    storeId: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
    },
    sectionTitle: {
      type: String,
      required: true,
      maxlength: 200,
      index: true,
    },
    sections: {
      type: [String],
      default: [],
    },
    itemHash: {
      type: String,
      maxlength: 50,
    },
    revision: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    collection: 'items',
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    versionKey: false,
  }
);
ItemSchema.index({ storeId: 1, sectionTitle: 1 });
ItemSchema.index({ storeId: 1, itemKey: 1 }, { unique: true });
ItemSchema.index({ itemUuid: 1 });
export const Item =
  mongoose.models.Item ?? mongoose.model<ItemDocument>('Item', ItemSchema);
