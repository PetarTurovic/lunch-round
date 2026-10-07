import cors from "cors";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "./errors";

export const corsOptions: cors.CorsOptions = { origin: process.env.CORS_ORIGIN?.split(",") ?? "*" };

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

export const validate = (schema: { body?: z.ZodTypeAny; query?: z.ZodTypeAny; params?: z.ZodTypeAny }): RequestHandler => {
  return (req, _res, next) => {
    if (schema.body) req.body = schema.body.parse(req.body);
    if (schema.query) req.query = schema.query.parse(req.query) as any;
    if (schema.params) req.params = schema.params.parse(req.params) as any;
    next();
  };
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
