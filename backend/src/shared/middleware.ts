import cors from "cors";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "./errors";

export const corsOptions: cors.CorsOptions = { origin: process.env.CORS_ORIGIN?.split(",") ?? "*" };

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  const isOperational = err instanceof AppError;
  let status = isOperational ? err.statusCode : 500;
  let message = isOperational ? err.message : "Internal server error";

  if (err?.name === "ZodError") {
    status = 400;
    message = err.issues?.map((i: any) => `${i.path.join(".") || "field"}: ${i.message}`).join(", ") || "Validation failed";
  } else if (err?.name === "ValidationError") {
    status = 400;
    message = err.message;
  }

  if (!isOperational) console.error("Unhandled error:", err);
  res.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
};
