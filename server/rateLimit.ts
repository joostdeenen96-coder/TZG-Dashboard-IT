import type { NextFunction, Request, Response } from "express";

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export function resetRateLimit() {
  buckets.clear();
}

export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string; name: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const id = `${options.name}:${(options.key ? options.key(req) : clientKey(req))}`;
    const bucket = buckets.get(id) ?? { tokens: options.max, updatedAt: now };
    const elapsed = now - bucket.updatedAt;
    const refill = (elapsed / options.windowMs) * options.max;
    bucket.tokens = Math.min(options.max, bucket.tokens + refill);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      buckets.set(id, bucket);
      res.setHeader("retry-after", "10");
      res.status(429).json({ error: "Te veel verzoeken. Probeer het zo opnieuw." });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(id, bucket);
    next();
  };
}

export function clientKey(req: Request) {
  // Met app.set("trust proxy", N) vult Express req.ip uit X-Forwarded-For.
  return req.ip || req.socket.remoteAddress || "onbekend";
}
