import cors from "cors";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "./errors";

export const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  const isOperational = err instanceof AppError;
  const isValidationError =
    (err as { name?: string })?.name === "ValidationError";
  const isZodError = (err as { name?: string })?.name === "ZodError";

  let statusCode = 500;
  let message = "Internal server error";

  if (isOperational) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (isZodError) {
    statusCode = 400;
    const issues = (
      err as {
        issues?: Array<{ message: string; path: Array<string | number> }>;
      }
    ).issues;
    message =
      issues && issues.length > 0
        ? issues
            .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
            .join(", ")
        : "Validation failed";
  } else if (isValidationError) {
    statusCode = 400;
    message = (err as Error).message;
  }

  if (!isOperational) {
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
      ...(process.env.NODE_ENV !== "production" && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
};
