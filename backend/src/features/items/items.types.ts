export interface Option {
  name: string;
  priceImpact: number;
  selectedByDefault: boolean;
  priceInfo?: {
    amount: number;
    currencyCode: string;
    displayText: string;
  };
}
export interface OptionGroup {
  name: string;
  min?: number;
  max?: number;
  multiple: boolean;
  required: boolean;
  options: Option[];
}
export interface IItem {
  _id: string;
  itemKey: string;
  itemUuid: string;
  name: string;
  nameText: string;
  description?: string;
  descriptionText?: string;
  price: number;
  priceRaw?: string;
  currency: string;
  isSoldOut: boolean;
  hasOptions: boolean;
  optionGroups?: OptionGroup[];
  imageUrl?: string;
  storeId: string;
  sectionTitle: string;
  sections: string[];
  itemHash: string;
  revision: number;
  createdAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
}
export type CreateItemInput = Omit<IItem, '_id' | 'createdAt' | 'firstSeenAt' | 'lastSeenAt' | 'itemHash' | 'revision'>;
export type UpdateItemInput = Partial<Omit<CreateItemInput, '_id' | 'storeId'>>;
export interface ItemFilters {
  storeId?: string;
  sectionTitle?: string;
  sections?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  isSoldOut?: boolean;
  hasOptions?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
export type ItemFiltersInput = ItemFilters;
export interface ItemListResponse {
  items: IItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
export interface PriceRange {
  min: number;
  max: number;
  currency: string;
}
