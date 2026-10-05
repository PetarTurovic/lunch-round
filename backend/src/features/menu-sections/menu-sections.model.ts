import mongoose, { Schema } from 'mongoose';
import type { PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IMenuSection } from './menu-sections.types';

export interface MenuSectionDocument extends Omit<IMenuSection, '_id'> {
  _id: string;
}
export const MenuSectionSchema = new Schema<MenuSectionDocument>(
  {
    _id: {
      type: String,
      required: true,
      maxlength: 300,
    },
    storeId: {
      type: String,
      required: true,
      maxlength: 100,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      index: true,
    },
  },
  {
    collection: 'menu_sections',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    versionKey: false,
  }
);
MenuSectionSchema.index({ storeId: 1, title: 1 }, { unique: true });
MenuSectionSchema.index({ storeId: 1 });
MenuSectionSchema.plugin(paginate);
export const MenuSection = (
  mongoose.models.MenuSection ??
  mongoose.model('MenuSection', MenuSectionSchema)
) as unknown as PaginateModel<MenuSectionDocument>;
