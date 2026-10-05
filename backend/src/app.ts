import cors from 'cors';
import express from 'express';
import { corsOptions, errorHandler, notFound } from './shared/middleware';
import healthRoutes from './shared/health.routes';
import storesRoutes from './features/stores/stores.routes';

export const createApp = () => {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  app.use('/', healthRoutes);
  app.use('/api/stores', storesRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;