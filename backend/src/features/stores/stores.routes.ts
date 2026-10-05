import { Router } from 'express';
import {
  getStoreController,
  getStoreMenuController,
  getStoreMenuSummaryController,
  getStoresController,
} from './stores.controller';

const router = Router();

router.get('/', getStoresController);
router.get('/:idOrSlug/menu', getStoreMenuController);
router.get('/:idOrSlug/menu/summary', getStoreMenuSummaryController);
router.get('/:idOrSlug', getStoreController);

export default router;