import type { QueryState } from "../types";
import { useWijAgenda } from "./agendaService";
import { useWijNews } from "./newsService";
import { usePrtg } from "./prtgService";

function stampOf(state: QueryState<unknown>) {
  return state.fetchedAt;
}

export function useIctTvStatus() {
  const prtg = usePrtg();
  const news = useWijNews();
  const agenda = useWijAgenda();
  const feeds = [prtg, news, agenda];
  const refreshing = feeds.some((feed) => feed.refreshing);
  const anyReady = feeds.some((feed) => feed.status === "ready");
  const anyFallback = feeds.some((feed) => feed.status === "fallback");
  const fetchedAt =
    feeds
      .map(stampOf)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort()
      .at(-1) ?? null;
  return {
    refreshing,
    stale: !anyReady && anyFallback,
    fetchedAt,
  };
}
