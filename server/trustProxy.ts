/**
 * Aantal proxy-hops dat Express mag vertrouwen (X-Forwarded-* / req.ip / req.secure).
 * TRUST_PROXY=1 (of true) achter één nginx-hop; 0 of unset zonder proxy.
 */
export function resolveTrustProxyHops(raw = process.env.TRUST_PROXY): number {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return 0;
  if (value === "true" || value === "yes" || value === "on") return 1;
  if (value === "false" || value === "no" || value === "off") return 0;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) return 0;
  return hops;
}
