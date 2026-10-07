import type { Request, Response } from "express";
import { NotFoundError } from "../../errors";
import { Store } from "./stores.model";

const STORE_LIST_FIELDS = "slug name platform currency taxonomy location rating delivery status stats";

export const getStores = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const query: Record<string, any> = { status: req.query.status || "active" };

  if (req.query.platform) query.platform = req.query.platform;
  if (req.query.city) query["location.city"] = String(req.query.city).toLowerCase();
  if (req.query.country) query["location.country"] = String(req.query.country).toUpperCase();
  if (req.query.cuisine) query["taxonomy.cuisines"] = String(req.query.cuisine).toLowerCase();
  if (req.query.search) query.$text = { $search: String(req.query.search) };

  const [stores, total] = await Promise.all([
    Store.find(query)
      .select(STORE_LIST_FIELDS)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Store.countDocuments(query),
  ]);

  res.json({
    stores,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: page * limit < total,
    },
  });
};

export const getStore = async (req: Request, res: Response) => {
  const idOrSlug = String(req.params.idOrSlug);
  const store = await Store.findOne({ $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }).lean();
  if (!store) throw new NotFoundError("Store");
  res.json({ store });
};
