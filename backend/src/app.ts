import cors from "cors";
import express from "express";
import config from "./config";
import { errorHandler, notFound } from "./errors";
import usersRouter from "./features/users/users.routes";
import storesRouter from "./features/stores/stores.routes";
import roundsRouter from "./features/rounds/rounds.routes";

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", usersRouter);
app.use("/api/stores", storesRouter);
app.use("/api/rounds", roundsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
