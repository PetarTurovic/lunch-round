import { Router } from 'express';
import { getStore, getStoreMenu, listStores } from './stores.controller';

const router = Router();

router.get('/', listStores);
router.get('/:idOrSlug', getStore);
router.get('/:idOrSlug/menu', getStoreMenu);

export default router;
