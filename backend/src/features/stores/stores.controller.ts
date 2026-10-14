import type { Request, Response } from "express";
import { NotFoundError, UnauthorizedError } from "../../errors";
import { Store } from "./stores.model";
import User from "../users/users.model";

const EARTH_RADIUS_M = 6371008.8;

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
};

const SORT_PATHS: Record<string, string> = {
  name: "name",
  rating: "rating.value",
  itemCount: "stats.itemCount",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

/** Store list projection: never ships the embedded menu (up to ~400 KB each). */
const LIST_PROJECTION = "slug name platform currency taxonomy location rating delivery status stats";

export const getStores = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter: Record<string, any> = { status: req.query.status || "active" };
  if (req.query.search) filter.$text = { $search: String(req.query.search) };
  if (req.query.cuisine) filter["taxonomy.cuisines"] = String(req.query.cuisine).toLowerCase();
  if (req.query.city) filter["location.city"] = String(req.query.city).toLowerCase();
  if (req.query.country) filter["location.country"] = String(req.query.country).toUpperCase();
  if (req.query.platform) filter.platform = String(req.query.platform);

  const kind = req.query.category || req.query.kind;
  if (kind) filter["taxonomy.kind"] = String(kind).toLowerCase();

  const minRating = Number(req.query.minRating);
  if (Number.isFinite(minRating)) filter["rating.value"] = { $gte: minRating };

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const hasGeo = !Number.isNaN(lat) && !Number.isNaN(lon);
  const radiusKm = Number(req.query.radius) || 10;
  const searching = Boolean(req.query.search);

  const sortBy = SORT_PATHS[String(req.query.sortBy)] || "createdAt";
  const sortOrder = String(req.query.sortOrder).toLowerCase() === "asc" ? 1 : -1;

  // Geo narrows the set; which operator depends on whether a text search is
  // present. `$text` cannot be combined with `$near`, and `$near` cannot be
  // combined with an explicit sort — the text+geo path filters with
  // `$geoWithin` and sorts by the requested key instead.
  let query: Record<string, any> = filter;
  let countQuery: Record<string, any> = filter;
  let sortable = true;

  if (hasGeo) {
    const centerSphere = [[lon, lat], radiusKm / 6378.1];
    if (searching) {
      query = { ...filter, "location.coordinates": { $geoWithin: { $centerSphere: centerSphere } } };
      countQuery = query;
    } else {
      query = {
        ...filter,
        "location.coordinates": {
          $near: { $geometry: { type: "Point", coordinates: [lon, lat] }, $maxDistance: radiusKm * 1000 },
        },
      };
      countQuery = { ...filter, "location.coordinates": { $geoWithin: { $centerSphere: centerSphere } } };
      sortable = false;
    }
  }

  let findQuery = Store.find(query).select(LIST_PROJECTION).skip((page - 1) * limit).limit(limit);
  if (sortable) findQuery = findQuery.sort({ [sortBy]: sortOrder, _id: 1 });

  const [stores, total] = await Promise.all([findQuery.lean(), Store.countDocuments(countQuery)]);

  const formatted = stores.map((store: any) => {
    if (!hasGeo) return store;
    const coordinates = store.location?.coordinates?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return store;
    return { ...store, distanceMeters: haversineMeters(lat, lon, coordinates[1], coordinates[0]) };
  });

  res.json({
    stores: formatted,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  });
};

const findStore = async (idOrSlug: string) => {
  const store = await Store.findOne({ $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }).lean();
  if (!store) throw new NotFoundError("Store");
  return store;
};

export const getStore = async (req: Request, res: Response) => {
  res.json({ store: await findStore(String(req.params.idOrSlug)) });
};

/** The full embedded menu, for a single store's page. */
export const getStoreMenu = async (req: Request, res: Response) => {
  res.json({ store: await findStore(String(req.params.idOrSlug)) });
};

/**
 * Every section with its true itemCount plus the first N items, sliced in the
 * database. A shortlist browser needs the shape of a menu, not the 400 KB.
 */
export const getStoreMenuSummary = async (req: Request, res: Response) => {
  const itemsPerSection = Math.min(10, Math.max(1, Number(req.query.items) || 5));
  const idOrSlug = String(req.params.idOrSlug);

  const [summary] = await Store.aggregate([
    { $match: { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } },
    {
      $project: {
        slug: 1,
        name: 1,
        platform: 1,
        currency: 1,
        menu: {
          sections: {
            $map: {
              input: { $ifNull: ["$menu.sections", []] },
              as: "section",
              in: {
                key: "$$section.key",
                title: "$$section.title",
                position: "$$section.position",
                itemCount: { $size: { $ifNull: ["$$section.items", []] } },
                items: { $slice: [{ $ifNull: ["$$section.items", []] }, itemsPerSection] },
              },
            },
          },
        },
      },
    },
  ]);

  if (!summary) throw new NotFoundError("Store");
  res.json({ store: summary, itemsPerSection });
};

export const toggleFavoriteStore = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();

  const store = await Store.findOne({
    $or: [{ _id: String(req.params.idOrSlug) }, { slug: String(req.params.idOrSlug) }],
  }).select("_id").lean();
  if (!store) throw new NotFoundError("Store");

  const storeId = String(store._id);
  const user = await User.findById(userId).select("favoriteStore").lean();
  if (!user) throw new NotFoundError("User");

  const currentFavorites = ((user.favoriteStore as any) || []).map(String);
  const isAlreadyFavorited = currentFavorites.includes(storeId);

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    isAlreadyFavorited
      ? { $pull: { favoriteStore: storeId } }
      : { $addToSet: { favoriteStore: storeId } },
    { new: true }
  ).select("favoriteStore").lean();

  const favoriteStore = ((updatedUser?.favoriteStore as any) || []).map(String);
  const isFavorited = favoriteStore.includes(storeId);

  return res.status(200).json({
    success: true,
    isFavorited,
    favoriteStore,
    message: isFavorited
      ? "Store added to favorites"
      : "Store removed from favorites",
  });
};
