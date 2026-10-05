import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors';
import {
  getStoresService,
  getStoreByIdOrSlugService,
  getStoreMenuSummaryService,
} from './stores.service';

const storeListQuery = z.object({
  platform: z.string().optional(),
  city: z.string().optional(),
  country: z.string().length(2).optional(),
  cuisine: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'rating', 'itemCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const menuSummaryQuery = z.object({
  items: z.coerce.number().int().min(1).max(10).optional(),
});

const idOrSlug = z.string().min(1);

const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
      .join('; ');
    throw new AppError(message, 400);
  }
  return result.data;
};

const blankToUndefined = (data: unknown): unknown =>
  typeof data === 'object' && data !== null
    ? Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ''))
    : data;

const pathParam = (value: unknown): string => parse(idOrSlug, Array.isArray(value) ? value[0] : value);

export const getStoresController = async (req: Request, res: Response) => {
  const { radius, ...filters } = parse(storeListQuery, blankToUndefined(req.query));
  const result = await getStoresService({ ...filters, radiusKm: radius });
  res.json(result);
};

export const getStoreController = async (req: Request, res: Response) => {
  const store = await getStoreByIdOrSlugService(pathParam(req.params.idOrSlug));
  res.json({ store });
};

export const getStoreMenuController = async (req: Request, res: Response) => {
  const store = await getStoreByIdOrSlugService(pathParam(req.params.idOrSlug));
  res.json({
    store: {
      _id: store._id,
      slug: store.slug,
      name: store.name,
      platform: store.platform,
      currency: store.currency,
      location: store.location,
      delivery: store.delivery,
      stats: store.stats,
      menu: store.menu,
    },
  });
};

export const getStoreMenuSummaryController = async (req: Request, res: Response) => {
  const { items } = parse(menuSummaryQuery, blankToUndefined(req.query));
  const store = await getStoreMenuSummaryService(pathParam(req.params.idOrSlug), items ?? 3);
  res.json({ store });
};