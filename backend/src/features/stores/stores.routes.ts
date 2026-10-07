import { Router } from "express";
import { z } from "zod";
import {
  getStoreController,
  getStoreMenuController,
  getStoreMenuSummaryController,
  getStoresController,
} from "./stores.controller";
import { validate } from "../../shared/middleware";

const router = Router();

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
  sortBy: z.enum(["name", "createdAt", "updatedAt", "rating", "itemCount"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const storeParams = z.object({ idOrSlug: z.string() });
const menuSummaryQuery = z.object({ items: z.coerce.number().int().min(1).max(10).default(3) });

router.get("/", validate({ query: storeListQuery }), getStoresController);
router.get("/:idOrSlug/menu", validate({ params: storeParams }), getStoreMenuController);
router.get("/:idOrSlug/menu/summary", validate({ params: storeParams, query: menuSummaryQuery }), getStoreMenuSummaryController);
router.get("/:idOrSlug", validate({ params: storeParams }), getStoreController);

export default router;
