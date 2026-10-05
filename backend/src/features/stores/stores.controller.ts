import type { QueryFilter } from 'mongoose';
import { MenuSection } from '../menu-sections/menu-sections.model';
import { Item } from '../items/items.model';
import type { Request, Response } from 'express';
import { NotFoundError } from '../../shared/errors';
import { Store } from './stores.model';
import type { StoreDocument } from './stores.model';
import type {
  MenuSectionWithItems,
  StoreFiltersInput,
  StoreListResponse,
  StoreMenuResponse,
} from './stores.types';
import type { IItem } from '../items/items.types';

// --- query param helpers (inlined; shared/pagination.ts removed) ---
const MAX_LIMIT = 100;

function strParam(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

function parsePagination(query: {
  page?: string;
  limit?: string;
}): { page: number; limit: number } {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit ?? '20', 10) || 20),
  );
  return { page, limit };
}

function parseSort<T extends string>(
  query: { sortBy?: string; sortOrder?: string },
  allowlist: readonly T[],
  fallback: T,
): { sortBy: T; sortOrder: 1 | -1 } {
  const sortBy = (allowlist as readonly string[]).includes(query.sortBy ?? '')
    ? (query.sortBy as T)
    : fallback;
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { sortBy, sortOrder };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const SORTABLE_FIELDS = [
  'name',
  'city',
  'platform',
  'category',
  'rating',
  'createdAt',
] as const;

const DEFAULT_RADIUS_KM = 10;

export const listStores = async (req: Request, res: Response) => {
  const query: StoreFiltersInput = {
    platform: strParam(req.query.platform),
    city: strParam(req.query.city),
    country: strParam(req.query.country),
    search: strParam(req.query.search),
    category: strParam(req.query.category),
    isActive: parseBoolean(strParam(req.query.isActive)),
    minRating: parseNumber(strParam(req.query.minRating)),
    lat: parseNumber(strParam(req.query.lat)),
    lon: parseNumber(strParam(req.query.lon)),
    radius: parseNumber(strParam(req.query.radius)),
  };

  const filter: QueryFilter<StoreDocument> = {};
  if (query.platform) filter.platform = query.platform;
  if (query.city) filter.city = query.city;
  if (query.country) filter.country = query.country;
  if (query.category) filter.category = query.category;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) filter.name = { $regex: query.search, $options: 'i' };
  if (query.minRating !== undefined) {
    // rating is stored as a string; compare numerically, dropping unusable values
    (filter as Record<string, unknown>).$expr = {
      $gte: [
        {
          $convert: { input: '$rating', to: 'double', onError: null, onNull: null },
        },
        query.minRating,
      ],
    };
  }
  if (query.lat !== undefined && query.lon !== undefined) {
    const radiusKm = query.radius ?? DEFAULT_RADIUS_KM;
    (filter as Record<string, unknown>).geo = {
      $near: {
        $geometry: { type: 'Point', coordinates: [query.lon, query.lat] },
        $maxDistance: radiusKm * 1000,
      },
    };
  }

  const pagination = parsePagination({
    page: strParam(req.query.page),
    limit: strParam(req.query.limit),
  });
  const sort = parseSort(
    {
      sortBy: strParam(req.query.sortBy),
      sortOrder: strParam(req.query.sortOrder),
    },
    SORTABLE_FIELDS,
    'createdAt',
  );

  const result = await Store.paginate(filter, {
    page: pagination.page,
    limit: pagination.limit,
    sort: { [sort.sortBy]: sort.sortOrder },
    lean: true,
  });

  const response: StoreListResponse = {
    stores: result.docs as unknown as StoreListResponse['stores'],
    pagination: {
      page: result.page ?? pagination.page,
      limit: result.limit,
      total: result.totalDocs,
      totalPages: result.totalPages,
    },
  };
  res.json(response);
};

export const getStore = async (req: Request, res: Response) => {
  const idOrSlug = strParam(req.params.idOrSlug) ?? '';
  const store = await Store.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
  }).lean();

  if (!store) {
    throw new NotFoundError('Store');
  }
  res.json(store);
};

export const getStoreMenu = async (req: Request, res: Response) => {
  const idOrSlug = strParam(req.params.idOrSlug) ?? '';
  const store = await Store.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
  }).lean();

  if (!store) {
    throw new NotFoundError('Store');
  }

  const [sections, rawItems] = await Promise.all([
    MenuSection.find({ storeId: store._id }).sort({ title: 1 }).lean(),
    Item.find({ storeId: store._id }).sort({ sectionTitle: 1, name: 1 }).lean(),
  ]);
  const items = rawItems as unknown as IItem[];

  const itemsBySection = new Map<string, IItem[]>();
  for (const item of items) {
    const list = itemsBySection.get(item.sectionTitle) ?? [];
    list.push(item);
    itemsBySection.set(item.sectionTitle, list);
  }

  const menuSections: MenuSectionWithItems[] = sections.map((section) => ({
    ...section,
    items: itemsBySection.get(section.title) ?? [],
  })) as unknown as MenuSectionWithItems[];

  // Item groups that exist in items but have no menu_sections document
  const knownTitles = new Set(sections.map((section) => section.title));
  for (const [title, sectionItems] of itemsBySection) {
    if (!knownTitles.has(title)) {
      menuSections.push({
        _id: `${store._id}:${title}`,
        storeId: store._id,
        title,
        items: sectionItems,
        createdAt: sectionItems[0]?.createdAt ?? new Date(),
        updatedAt: sectionItems[0]?.lastSeenAt ?? new Date(),
      });
    }
  }

  const response: StoreMenuResponse = {
    store: store as unknown as StoreMenuResponse['store'],
    sections: menuSections as unknown as StoreMenuResponse['sections'],
  };
  res.json(response);
};
