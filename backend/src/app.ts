import cors from 'cors';
import express from 'express';
import { corsOptions, errorHandler, notFound } from './shared/middleware';
import healthRoutes from './shared/health.routes';

export const createApp = () => {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRoutes);

  // 404 for unknown API paths
  app.use(notFound);

  app.use(errorHandler);

  return app;
};
