import type { Request, Response } from "express";
import {
  getStoresService,
  getStoreByIdOrSlugService,
  getStoreMenuSummaryService,
} from "./stores.service";


export const getStoresController = async (req: Request, res: Response) => {
  const { radius, ...filters } = req.query as any;
  res.json(await getStoresService({ ...filters, radiusKm: radius }));
};

export const getStoreController = async (req: Request, res: Response) => {
  res.json({ store: await getStoreByIdOrSlugService(String(req.params.idOrSlug)) });
};

export const getStoreMenuController = getStoreController;

export const getStoreMenuSummaryController = async (req: Request, res: Response) => {
  const items = Number((req.query as any).items || 3);
  res.json({ store: await getStoreMenuSummaryService(String(req.params.idOrSlug), items) });
};
