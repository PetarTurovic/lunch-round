import cors from "cors";
import express from "express";
import { corsOptions, errorHandler, notFound } from "./shared/middleware";
import healthRoutes from "./shared/health.routes";
import storesRoutes from "./features/stores/stores.routes";
import authRoutes from "./features/users/users.routes";
import roundsRoutes from "./features/rounds/rounds.routes";

export const createApp = () => {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/stores", storesRoutes);
  app.use("/api/rounds", roundsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
