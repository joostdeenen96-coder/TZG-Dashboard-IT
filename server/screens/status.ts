export type ScreenPresence = "Online" | "Offline" | "Uitgeschakeld" | "Nooit verbonden";

export function heartbeatSeconds() {
  return readInt("SCREEN_HEARTBEAT_SECONDS", 60, 5, 3600);
}

export function offlineAfterSeconds() {
  return readInt("SCREEN_OFFLINE_AFTER_SECONDS", 180, 10, 86_400);
}

export function heartbeatRetentionDays() {
  return readInt("SCREEN_HEARTBEAT_RETENTION_DAYS", 14, 1, 365);
}

function readInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

export function screenPresence(input: {
  enabled: boolean;
  lastSeenAt: string | null;
  now?: number;
  offlineAfterSeconds?: number;
}): ScreenPresence {
  if (!input.enabled) return "Uitgeschakeld";
  if (!input.lastSeenAt) return "Nooit verbonden";
  const seen = Date.parse(input.lastSeenAt);
  if (!Number.isFinite(seen)) return "Nooit verbonden";
  const now = input.now ?? Date.now();
  const limit = (input.offlineAfterSeconds ?? offlineAfterSeconds()) * 1000;
  if (now - seen > limit) return "Offline";
  return "Online";
}
