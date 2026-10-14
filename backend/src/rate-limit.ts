import type { NextFunction, Request, Response } from "express";

/**
 * A small fixed-window limiter. Deliberately dependency-free: the endpoints
 * that need throttling (sign-in, sign-up, joining a shared link) are the cheap
 * ones to gate, and an in-process counter covers a single instance without
 * pulling in a store. It is not a distributed limiter.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export const rateLimit = ({ windowMs, max, message }: RateLimitOptions) => {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const setHeaders = (res: Response, remaining: number, resetAt: number) => {
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  };

  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    sweep(now);

    const identity = `${req.ip || "unknown"}:${req.method}:${req.path}`;
    const bucket = buckets.get(identity);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identity, { count: 1, resetAt: now + windowMs });
      setHeaders(res, max - 1, now + windowMs);
      return next();
    }

    bucket.count += 1;
    setHeaders(res, max - bucket.count, bucket.resetAt);

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        error: { message: message ?? "Too many requests", status: 429 },
      });
    }

    next();
  };
};
