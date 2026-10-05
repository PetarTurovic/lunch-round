export interface IMenuSection {
  _id: string;
  storeId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MenuSectionFilters {
  storeId?: string;
}
export type MenuSectionFiltersInput = MenuSectionFilters;
export interface MenuSectionListResponse {
  sections: IMenuSection[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
