import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request) {
  const existing = req.header("x-request-id")?.trim();
  if (existing && /^[A-Za-z0-9._-]{8,128}$/.test(existing)) return existing;
  return randomUUID();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = requestId(req);
  (req as Request & { requestId: string }).requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

export function getRequestId(req: Request) {
  return (req as Request & { requestId?: string }).requestId || resFallback(req);
}

function resFallback(req: Request) {
  return req.header("x-request-id")?.trim() || "";
}
