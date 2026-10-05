import { Router } from 'express';
import { getMenuSection, listMenuSections } from './menu-sections.controller';

const router = Router();

router.get('/', listMenuSections);
router.get('/:id', getMenuSection);

export default router;
