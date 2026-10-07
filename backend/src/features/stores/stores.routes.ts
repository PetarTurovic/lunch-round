import { Router } from "express";
import * as storeCtrl from "./stores.controller";

export const storesRouter = Router();

storesRouter.get("/", storeCtrl.getStores);
storesRouter.get("/:idOrSlug", storeCtrl.getStore);
storesRouter.get("/:idOrSlug/menu", storeCtrl.getStore);
storesRouter.get("/:idOrSlug/menu/summary", storeCtrl.getStore);

export default storesRouter;
