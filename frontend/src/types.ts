export type Theme = "light" | "dark";
export type View = "setup" | "order" | "ledger" | "history" | "settings";

export interface User {
  _id?: string;
  name: string;
  email?: string;
}

export interface Session {
  authToken: string;
  user: User | null;
  roundSlug: string;
  participantToken: string;
}

export interface Participant {
  _id: string;
  name: string;
  isOrganizer?: boolean;
  userId?: string;
}

export interface Selection {
  _id: string;
  participantId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  status: string;
  unitPriceCents: number;
  priceOverridden?: boolean;
  itemSnapshot?: { name?: string; imageUrl?: string | null };
}

export interface MenuItem {
  _id: string;
  name: string;
  description?: string;
  price: number | null;
  available?: boolean;
  imageUrl?: string;
}

export interface MenuSection {
  key: string;
  title: string;
  items: MenuItem[];
}

export interface StoreSummary {
  _id: string;
  slug?: string;
  name: string;
  platform?: string;
  currency?: string;
  rating?: number | { value?: number | null } | null;
}

export interface Store extends StoreSummary {
  status?: "active" | "inactive";
  menu?: { sections: MenuSection[] };
  location?: { cityLabel?: string };
  taxonomy?: { cuisineLabels?: string[] };
  delivery?: { fee?: { amount?: number | null } };
}

export interface SettlementParticipant {
  participantId?: string;
  participantName: string;
  itemsCents: number;
  adjustmentsCents: number;
  totalCents: number;
}

export interface Settlement {
  isLive?: boolean;
  totalCents?: number;
  orderTotalCents?: number;
  perParticipant?: SettlementParticipant[];
  frozenAt?: string;
}

export interface RoundOrder {
  totalCents?: number;
}

export interface Round {
  _id: string;
  slug: string;
  title: string;
  status: string;
  currency?: string;
  closesAt?: string | null;
  shortlist: StoreSummary[];
  participants: Participant[];
  selections: Selection[];
  orders?: RoundOrder[];
  settlement?: Settlement;
  settlementView?: Settlement;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderMenuItem {
  id: string;
  menuItemId: string;
  storeId: string;
  storeName: string;
  section: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  selections: Selection[];
}

export interface ParticipantOrder {
  id: string;
  name: string;
  quantities: Record<string, number>;
  selectionIds: Record<string, string>;
}

export interface FinalSelection {
  id: string;
  name: string;
  storeName: string;
  personName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  overridden: boolean;
}

export interface AuthDetails {
  mode: "login" | "register";
  name: string;
  email: string;
  password: string;
}

export interface HistoryRound extends Round {
  settlementView?: Settlement;
}
