import { Router } from 'express';
import { getItem, listItems } from './items.controller';

const router = Router();

router.get('/', listItems);
router.get('/:id', getItem);

export default router;
