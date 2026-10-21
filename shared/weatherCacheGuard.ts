/** Spiegel van server/player/backoff — voorkomt secrets in weather localStorage. */
const TOKENISH = /tzg_[A-Za-z0-9_-]{8,}|Bearer\s+\S+|GRAPH_CLIENT_SECRET|postgresql:\/\/|api[_-]?key/i;

export function cacheContainsSecrets(raw: string) {
  return TOKENISH.test(raw);
}
