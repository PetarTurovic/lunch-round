import cors from 'cors';
import express from 'express';
import itemsRoutes from './features/items/items.routes';
import menuSectionsRoutes from './features/menu-sections/menu-sections.routes';
import storesRoutes from './features/stores/stores.routes';
import { corsOptions, errorHandler, notFound } from './shared/middleware';
import healthRoutes from './shared/health.routes';

export const createApp = () => {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRoutes);
  app.use('/stores', storesRoutes);
  app.use('/menu-sections', menuSectionsRoutes);
  app.use('/items', itemsRoutes);

  // 404 for unknown API paths
  app.use(notFound);

  app.use(errorHandler);

  return app;
};
