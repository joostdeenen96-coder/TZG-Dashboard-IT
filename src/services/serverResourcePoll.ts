export const SERVER_RESOURCE_REFRESH_MS = 60_000;

export function startServerResourcePoll(load: () => void, intervalMs = SERVER_RESOURCE_REFRESH_MS) {
  load();
  const timer = setInterval(load, intervalMs);
  return () => clearInterval(timer);
}
