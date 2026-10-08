import type { Request, Response } from "express";
import { NotFoundError, UnauthorizedError } from "../../errors";
import { Store } from "./stores.model";
import User from "../users/users.model";
import { Types } from "mongoose";

export const getStores = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const query: Record<string, any> = { status: req.query.status || "active" };

  if (req.query.search) query.$text = { $search: String(req.query.search) };
  if (req.query.cuisine)
    query["taxonomy.cuisines"] = String(req.query.cuisine).toLowerCase();
  if (req.query.city)
    query["location.city"] = String(req.query.city).toLowerCase();

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
    const radiusKm = Number(req.query.radius) || 10;
    if (req.query.search) {
      query["location.coordinates"] = {
        $geoWithin: {
          $centerSphere: [[lon, lat], radiusKm / 6378.1],
        },
      };
    } else {
      query["location.coordinates"] = {
        $near: {
          $geometry: { type: "Point", coordinates: [lon, lat] },
          $maxDistance: radiusKm * 1000,
        },
      };
    }
  }

  const stores = await Store.find(query)
    .select(
      "slug name platform currency taxonomy location rating delivery status stats",
    )
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    stores,
    pagination: { page, limit, hasNextPage: stores.length === limit },
  });
};

export const getStore = async (req: Request, res: Response) => {
  const idOrSlug = String(req.params.idOrSlug);
  const store = await Store.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
  }).lean();
  if (!store) throw new NotFoundError("Store");
  res.json({ store });
};



export const toggleFavoriteStore = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();

  const idOrSlug = String(req.params.idOrSlug);

  const store = await Store.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
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