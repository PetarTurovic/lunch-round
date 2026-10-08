import fs from "fs";
import path from "path";
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

const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/health") {
      return res.sendFile(path.resolve(frontendDistPath, "index.html"));
    }
    next();
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
