import cors from 'cors';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from './errors';

export const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  const isOperational = err instanceof AppError;
  const isValidationError = (err as { name?: string })?.name === 'ValidationError';
  const statusCode = isOperational
    ? err.statusCode
    : isValidationError
      ? 400
      : 500;
  const message = isOperational
    ? err.message
    : isValidationError
      ? (err as Error).message
      : 'Internal server error';

  if (!isOperational) {
    console.error('Unhandled error:', err);
  }

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
      ...(process.env.NODE_ENV !== 'production' && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
};
