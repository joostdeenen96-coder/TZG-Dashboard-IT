import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashScreenToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateScreenToken() {
  const token = `tzg_${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashScreenToken(token) };
}

export function tokenHashesMatch(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
