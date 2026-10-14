import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import config, { databaseReadyState, isDatabaseReady } from "./config";
import { errorHandler, notFound } from "./errors";
import { rateLimit } from "./rate-limit";
import usersRouter from "./features/users/users.routes";
import storesRouter from "./features/stores/stores.routes";
import roundsRouter from "./features/rounds/rounds.routes";

export const app = express();

// Behind Render's proxy, req.ip is the load balancer unless we trust one hop.
// Rate limiting keys on req.ip, so without this every request shares one bucket.
app.set("trust proxy", 1);

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  next();
});

/** Liveness: is the process up? Used by orchestrators, never touches Mongo. */
app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Readiness: can this instance actually serve requests? A liveness answer that
 * ignores the database keeps a broken deployment looking healthy, so this one
 * reports 503 while Mongo is unreachable.
 */
app.get("/health", (_req, res) => {
  const ready = isDatabaseReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    database: ready ? "up" : "down",
    readyState: databaseReadyState(),
    timestamp: new Date().toISOString(),
  });
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: "Too many requests, please slow down",
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, try again later",
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/claim", authLimiter);

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
