export interface StoreRating {
  value: number | null;
  scale: 'percent' | 'five_star';
  votes: number | null;
  raw: string | null;
}

export interface StoreLocation {
  country: string;
  city: string;
  cityLabel: string;
  coordinates: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
}

export interface StoreDelivery {
  fee: { amount: number | null; currency: string };
  eta: { min: number | null; max: number | null };
  minOrder: { amount: number | null; currency: string };
}

export interface StoreTaxonomy {
  kind: string;
  cuisines: string[];
  cuisineLabels: string[];
}

export interface ItemOption {
  key: string;
  name: string;
  priceDelta: number;
  selectedByDefault: boolean;
}

export interface ItemOptionGroup {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  multiple: boolean;
  required: boolean;
  options: ItemOption[];
}

export interface MenuItem {
  _id: string;
  externalId: string;
  name: string;
  searchName: string;
  description?: string;
  price: number | null;
  imageUrl?: string;
  available: boolean;
  alsoInSections: string[];
  contentHash?: string;
  revision: number;
  optionGroups: ItemOptionGroup[];
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface MenuSection {
  key: string;
  title: string;
  position: number;
  items: MenuItem[];
}


