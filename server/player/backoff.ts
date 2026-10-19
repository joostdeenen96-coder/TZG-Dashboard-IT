export function nextBackoff(current: number, cap = 60_000) {
  return Math.min(Math.max(current, 2_000) * 2, cap);
}

const TOKENISH = /tzg_[A-Za-z0-9_-]{8,}|Bearer\s+\S+|GRAPH_CLIENT_SECRET|postgresql:\/\//i;

export function cacheContainsSecrets(raw: string) {
  return TOKENISH.test(raw);
}
