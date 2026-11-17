export const RESOURCE_TTL_MS = 60_000;

export type CacheStatus = "hit" | "miss" | "stale" | "unavailable";

export type CacheResult<T> = {
  value: T | null;
  cacheStatus: CacheStatus;
  staleReason: string | null;
};

type Entry<T> = { at: number; value: T };

function message(error: unknown) {
  return error instanceof Error && error.message ? error.message : "PRTG niet bereikbaar.";
}

export function createResourceCache<T>(options: {
  ttlMs?: number;
  now?: () => number;
  load: (id: string) => Promise<T>;
}) {
  const ttlMs = options.ttlMs ?? RESOURCE_TTL_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const flights = new Map<string, Promise<CacheResult<T>>>();

  async function read(id: string): Promise<CacheResult<T>> {
    const cached = entries.get(id);
    if (cached && now() - cached.at < ttlMs) {
      return { value: cached.value, cacheStatus: "hit", staleReason: null };
    }
    const pending = flights.get(id);
    if (pending) return pending;
    const flight = (async () => {
      try {
        const value = await options.load(id);
        entries.set(id, { at: now(), value });
        return { value, cacheStatus: "miss" as const, staleReason: null };
      } catch (error) {
        const previous = entries.get(id);
        if (previous) {
          return { value: previous.value, cacheStatus: "stale" as const, staleReason: message(error) };
        }
        return { value: null, cacheStatus: "unavailable" as const, staleReason: message(error) };
      } finally {
        flights.delete(id);
      }
    })();
    flights.set(id, flight);
    return flight;
  }

  return { read, size: () => entries.size };
}
