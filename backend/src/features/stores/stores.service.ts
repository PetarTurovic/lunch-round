import { Store } from './stores.model';
import { NotFoundError } from '../../shared/errors';

export interface StoreListFilters {
  platform?: string;
  city?: string;
  country?: string;
  cuisine?: string;
  category?: string;
  search?: string;
  status?: 'active' | 'inactive';
  minRating?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const LIST_PROJECTION = {
  _id: 1,
  slug: 1,
  name: 1,
  platform: 1,
  currency: 1,
  taxonomy: 1,
  location: 1,
  rating: 1,
  delivery: 1,
  status: 1,
  stats: 1,
} as const;

const SUMMARY_PROJECTION = {
  _id: 1,
  slug: 1,
  name: 1,
  platform: 1,
  currency: 1,
  'location.country': 1,
  'location.city': 1,
  'location.cityLabel': 1,
  'taxonomy.cuisines': 1,
  'taxonomy.cuisineLabels': 1,
  rating: 1,
  stats: 1,
} as const;

const point = (lat?: number, lon?: number): [number, number] | null =>
  typeof lat === 'number' && typeof lon === 'number' ? [lon, lat] : null;

const clampItems = (n: number): number => Math.min(Math.max(1, n), 10);

const summaryProjection = (perSection: number) => ({
  ...SUMMARY_PROJECTION,
  sections: {
    $map: {
      input: '$menu.sections',
      as: 'section',
      in: {
        key: '$$section.key',
        title: '$$section.title',
        position: '$$section.position',
        itemCount: { $size: { $ifNull: ['$$section.items', []] } },
        sampleItems: { $slice: [{ $ifNull: ['$$section.items', []] }, perSection] },
      },
    },
  },
});

const buildFilter = (filters: StoreListFilters): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};

  filter.status = filters.status ?? 'active';
  if (filters.platform) filter.platform = filters.platform;
  if (filters.country) filter['location.country'] = filters.country.toUpperCase();
  if (filters.city) filter['location.city'] = filters.city.toLowerCase();
  if (filters.cuisine) filter['taxonomy.cuisines'] = filters.cuisine.toLowerCase();
  if (filters.category) filter['taxonomy.kind'] = filters.category.toLowerCase();
  if (filters.search) filter.$text = { $search: filters.search };
  if (typeof filters.minRating === 'number') {
    filter['rating.value'] = { $gte: filters.minRating };
  }

  return filter;
};

const SORT_FIELDS: Record<string, string> = {
  name: 'name',
  rating: 'rating.value',
  itemCount: 'stats.itemCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

const sortSpec = (sortBy: string, sortOrder: 'asc' | 'desc' = 'desc'): Record<string, 1 | -1> => ({
  [SORT_FIELDS[sortBy] ?? 'name']: sortOrder === 'asc' ? 1 : -1,
});

export const getStoresService = async (filters: StoreListFilters) => {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
  const centre = point(filters.lat, filters.lon);

  if (centre && typeof filters.radiusKm === 'number') {
    const conditions = buildFilter(filters);
    if (conditions.$text) {
      console.warn('?search= ignored for a geo query');
      delete conditions.$text;
    }

    const near = {
      $geoNear: {
        near: { type: 'Point' as const, coordinates: centre },
        distanceField: 'distanceMeters',
        maxDistance: filters.radiusKm * 1000,
        spherical: true,
        query: conditions,
      },
    };

    const [docs, counted] = await Promise.all([
      Store.aggregate([
        near,
        { $project: { ...LIST_PROJECTION, distanceMeters: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      Store.aggregate([near, { $count: 'n' }]),
    ]);

    const total = counted[0]?.n ?? 0;
    return {
      stores: docs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    };
  }

  const result = await Store.paginate(buildFilter(filters), {
    page,
    limit,
    sort: sortSpec(filters.sortBy ?? 'name', filters.sortOrder),
    select: LIST_PROJECTION,
    lean: true,
  });

  return {
    stores: result.docs,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.totalDocs,
      totalPages: result.totalPages,
      hasNextPage: result.nextPage !== null,
    },
  };
};

export const getStoreByIdOrSlugService = async (idOrSlug: string) => {
  const store = await Store.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
  }).lean();

  if (!store) throw new NotFoundError('Store');
  return store;
};

export const getStoreMenuSummaryService = async (
  idOrSlug: string,
  itemsPerSection = 3,
) => {
  const [store] = await Store.aggregate([
    { $match: { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } },
    { $project: summaryProjection(clampItems(itemsPerSection)) },
  ]);

  if (!store) throw new NotFoundError('Store');

  return { ...store, menu: { sections: store.sections ?? [] } };
};

export const getStoresMenuSummaryService = async (
  storeIds: string[],
  itemsPerSection = 3,
) => {
  const ids = storeIds.filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return [];

  const found = await Store.aggregate([
    { $match: { _id: { $in: ids } } },
    { $project: summaryProjection(clampItems(itemsPerSection)) },
  ]);

  const byId = new Map(found.map((entry) => [entry._id as string, entry]));
  return ids.flatMap((id) => byId.get(id) ?? []);
};