export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}
export interface DeliveryInfo {
  deliveryTime?: string;
  deliveryFee?: string;
  minOrder?: string;
}
export interface IStore {
  _id: string;
  platform: string;
  platformStoreId: string;
  country: string;
  city: string;
  geo: GeoPoint;
  lat?: number;
  lon?: number;
  name: string;
  slug: string;
  url: string;
  tag?: string;
  category?: string;
  rating?: string;
  ratingVotes?: string;
  itemCount?: number;
  sectionCount?: number;
  deliveryInfo?: DeliveryInfo;
  deliveryZone?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type CreateStoreInput = Omit<IStore, '_id' | 'createdAt' | 'updatedAt'>;

export type UpdateStoreInput = Partial<Omit<CreateStoreInput, '_id'>>;
export interface StoreFilters {
  platform?: string;
  city?: string;
  country?: string;
  search?: string;
  category?: string;
  isActive?: boolean;
  minRating?: number;
  lat?: number;
  lon?: number;
  radius?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
export type StoreFiltersInput = StoreFilters;
export interface StoreListResponse {
  stores: IStore[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
export type Platform = 'glovo' | 'ubereats' | string;
export type Category = 'RESTAURANT' | 'GROCERY' | 'MARKET' | string;
