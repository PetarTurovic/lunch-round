import type { Request, Response } from "express";
import { z } from "zod";
import {
  getStoresService,
  getStoreByIdOrSlugService,
  getStoreMenuSummaryService,
} from "./stores.service";

const storeListQuery = z.object({
  platform: z.string().optional(),
  city: z.string().optional(),
  country: z.string().length(2).optional(),
  cuisine: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z
    .enum(["name", "createdAt", "updatedAt", "rating", "itemCount"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const getStoresController = async (req: Request, res: Response) => {
  const { radius, ...filters } = storeListQuery.parse(req.query);
  const result = await getStoresService({ ...filters, radiusKm: radius });
  res.json(result);
};

export const getStoreController = async (req: Request, res: Response) => {
  const idOrSlug = z.string().parse(req.params.idOrSlug);
  const store = await getStoreByIdOrSlugService(idOrSlug);
  res.json({ store });
};

export const getStoreMenuController = async (req: Request, res: Response) => {
  const idOrSlug = z.string().parse(req.params.idOrSlug);
  const store = await getStoreByIdOrSlugService(idOrSlug);

  const {
    _id,
    slug,
    name,
    platform,
    currency,
    location,
    delivery,
    stats,
    menu,
  } = store;
  res.json({
    store: {
      _id,
      slug,
      name,
      platform,
      currency,
      location,
      delivery,
      stats,
      menu,
    },
  });
};

export const getStoreMenuSummaryController = async (
  req: Request,
  res: Response,
) => {
  const items = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .parse(req.query.items);
  const idOrSlug = z.string().parse(req.params.idOrSlug);
  const store = await getStoreMenuSummaryService(idOrSlug, items);

  res.json({ store });
};
