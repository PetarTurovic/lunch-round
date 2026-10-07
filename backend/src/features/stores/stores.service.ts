import { Store } from "./stores.model";
import { NotFoundError } from "../../shared/errors";
import type { PipelineStage } from "mongoose";

export interface StoreListFilters {
  platform?: string;
  city?: string;
  country?: string;
  cuisine?: string;
  category?: string;
  search?: string;
  status?: "active" | "inactive";
  minRating?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

const STORE_LIST_FIELDS = "slug name platform currency taxonomy location rating delivery status stats";

const STORE_GEO_PROJECTION = {
  slug: 1, name: 1, platform: 1, currency: 1, taxonomy: 1, location: 1, rating: 1, delivery: 1, status: 1, stats: 1,
};

const getMenuSummaryProjection = (limit: number) => ({
  slug: 1, name: 1, platform: 1, currency: 1, rating: 1, stats: 1,
  "location.country": 1, "location.city": 1, "location.cityLabel": 1,
  "taxonomy.cuisines": 1, "taxonomy.cuisineLabels": 1,
  sections: {
    $map: {
      input: { $ifNull: ["$menu.sections", []] },
      as: "section",
      in: {
        key: "$$section.key",
        title: "$$section.title",
        position: "$$section.position",
        itemCount: { $size: { $ifNull: ["$$section.items", []] } },
        sampleItems: { $slice: [{ $ifNull: ["$$section.items", []] }, limit] },
      },
    },
  },
});

export const getStoresService = async (filters: StoreListFilters) => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const query: Record<string, any> = { status: filters.status || "active" };

  if (filters.platform) query.platform = filters.platform;
  if (filters.country) query["location.country"] = filters.country.toUpperCase();
  if (filters.city) query["location.city"] = filters.city.toLowerCase();
  if (filters.cuisine) query["taxonomy.cuisines"] = filters.cuisine.toLowerCase();
  if (filters.category) query["taxonomy.kind"] = filters.category.toLowerCase();
  if (filters.search) query.$text = { $search: filters.search };
  if (filters.minRating) query["rating.value"] = { $gte: filters.minRating };

  if (filters.lat && filters.lon && filters.radiusKm) {
    delete query.$text;
    const geoNear: PipelineStage.GeoNear = {
      $geoNear: {
        near: { type: "Point", coordinates: [filters.lon, filters.lat] },
        distanceField: "distanceMeters",
        maxDistance: filters.radiusKm * 1000,
        spherical: true,
        query,
      },
    };
    const skip = (page - 1) * limit;
    const [stores, [{ total = 0 } = {}]] = await Promise.all([
      Store.aggregate([geoNear, { $skip: skip }, { $limit: limit }, { $project: STORE_GEO_PROJECTION }]),
      Store.aggregate([geoNear, { $count: "total" }]),
    ]);
    return {
      stores,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: skip + limit < total },
    };
  }

  const sortMap: Record<string, string> = { rating: "rating.value", itemCount: "stats.itemCount", createdAt: "createdAt", updatedAt: "updatedAt" };
  const sortField = sortMap[filters.sortBy || "name"] || "name";
  const result = await Store.paginate(query, {
    page,
    limit,
    sort: { [sortField]: filters.sortOrder === "asc" ? 1 : -1 },
    select: STORE_LIST_FIELDS,
    lean: true,
  });

  return { stores: result.docs, pagination: { page: result.page, limit: result.limit, total: result.totalDocs, totalPages: result.totalPages, hasNextPage: result.hasNextPage } };
};

export const getStoreByIdOrSlugService = async (idOrSlug: string) => {
  const store = await Store.findOne({ $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }).lean();
  if (!store) throw new NotFoundError("Store");
  return store;
};

export const getStoreMenuSummaryService = async (idOrSlug: string, itemsPerSection = 3) => {
  const [store] = await Store.aggregate([{ $match: { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } }, { $project: getMenuSummaryProjection(itemsPerSection) }]);
  if (!store) throw new NotFoundError("Store");
  return { ...store, menu: { sections: store.sections || [] } };
};
