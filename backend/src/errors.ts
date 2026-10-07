import type { ErrorRequestHandler, RequestHandler } from "express";

export class AppError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
  }
}

export class NotFoundError extends AppError { constructor(res = "Resource") { super(`${res} not found`, 404); } }
export class UnauthorizedError extends AppError { constructor(msg = "Unauthorized") { super(msg, 401); } }
export class ForbiddenError extends AppError { constructor(msg = "Forbidden") { super(msg, 403); } }
export class BadRequestError extends AppError { constructor(msg = "Bad request") { super(msg, 400); } }
export class ConflictError extends AppError { constructor(msg = "Conflict") { super(msg, 409); } }

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  const isAppError = err instanceof AppError;
  let status = isAppError ? err.statusCode : 500;
  let message = isAppError ? err.message : "Internal server error";

  if (err?.name === "ZodError") {
    status = 400;
    message = err.issues?.map((i: any) => `${i.path.join(".") || "field"}: ${i.message}`).join(", ") || "Validation failed";
  } else if (err?.name === "ValidationError") {
    status = 400;
    message = err.message;
  }

  if (!isAppError && status === 500) console.error("Unhandled error:", err);
  res.status(status).json({ error: { message, status } });
};
