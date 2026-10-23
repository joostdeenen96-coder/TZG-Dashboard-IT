import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { formatPublicationDate } from "../lib/format";
import { useWijNews } from "../services/newsService";
import type { WijNewsItem } from "../types";
import { CardState } from "./CardState";
import { NewsDetailDialog } from "./NewsDetailDialog";

const ROTATE_MS = 20_000;

const previews: WijNewsItem[] = [
  {
    id: "voorbeeld-titel",
    title: "Titel van het bericht",
    summary: "Hier komen de eerste regels van een Nederlands nieuwsbericht op WijTeunesen.",
    publishedAt: "",
    category: "Lief en leed",
    imagePath: null,
  },
  {
    id: "voorbeeld-datum",
    title: "Tweede bericht",
    summary: "Alleen Nederlandse berichten van de site wt-nieuws wisselen hier.",
    publishedAt: "",
    category: "Nieuws",
    imagePath: null,
  },
];

export function NewsCard({ density = "regular" }: { density?: "regular" | "compact" }) {
  const state = useWijNews();
  const [index, setIndex] = useState(0);
  const [hiddenPhoto, setHiddenPhoto] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ready = state.status === "ready" || state.status === "fallback" ? state : null;
  const liveItems = ready?.data.connected ? ready.data.items : [];
  const sample = ready !== null && !ready.data.connected;
  const shown = (sample ? previews : liveItems).slice(0, 15);
  const rotationKey = shown.map((item) => item.id).join("|");
  const active = shown[index] ?? shown[0];

  useEffect(() => {
    setIndex(0);
  }, [rotationKey]);

  useEffect(() => {
    if (detailOpen || shown.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % shown.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [detailOpen, shown.length, rotationKey]);

  if (state.status === "error") {
    return <CardState status="error" title="WijTeunesen" message={state.message} />;
  }
  if (state.status !== "ready" && state.status !== "fallback") {
    return <CardState status="loading" title="WijTeunesen" message="Nieuws laden." />;
  }
  if (!active) {
    return <CardState status="empty" title="WijTeunesen" message="Geen Nederlandse berichten." />;
  }

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col overflow-hidden" data-density={density} data-status={state.status}>
      {state.refreshing ? <span className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-gold" aria-label="Vernieuwen" /> : null}
      <AnimatePresence mode="sync">
        <motion.div
          key={active.id}
          className="absolute inset-0 grid grid-cols-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <button
            ref={triggerRef}
            type="button"
            data-testid="news-open"
            data-news-open=""
            className="absolute inset-0 z-[1] cursor-pointer hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold"
            aria-label={active.title}
            onClick={() => setDetailOpen(true)}
          />
          <div className={density === "compact" ? "pointer-events-none relative z-[2] flex h-full min-h-0 items-center gap-[clamp(8px,0.8vw,16px)] px-[clamp(12px,1vw,22px)] py-[clamp(4px,0.45vh,10px)]" : "pointer-events-none relative z-[2] flex h-full min-h-0 gap-8 px-10 py-6"}>
            {density === "regular" && active.imagePath && hiddenPhoto !== active.id ? (
              <div className="flex w-[380px] shrink-0 items-center justify-center">
                <img
                  src={active.imagePath}
                  alt=""
                  className="h-[320px] w-[380px] rounded-[20px] object-contain"
                  onError={() => setHiddenPhoto(active.id)}
                />
              </div>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
              <div className="flex items-center justify-between gap-6">
                <p className="text-[13px] font-semibold tracking-[0.08em] text-gold uppercase" data-news-kicker="">
                  WijTeunesen
                  {active.category ? <span className="ml-3 font-medium tracking-normal text-mist normal-case">{active.category}</span> : null}
                </p>
                <p className="font-display text-[18px] tracking-[0.16em] text-mist tabular-nums" data-news-count="">
                  {String((shown.indexOf(active) >= 0 ? shown.indexOf(active) : index) + 1).padStart(2, "0")} / {String(shown.length).padStart(2, "0")}
                </p>
              </div>
              <h2 data-news-title="" className={density === "compact" ? "mt-0.5 truncate font-display leading-tight font-semibold" : "mt-2 line-clamp-2 pb-1 font-display text-[42px] leading-tight font-semibold tracking-[-0.015em]"}>
                {active.title}
              </h2>
              <p data-news-body="" className={density === "compact" ? "news-excerpt mt-0.5" : "mt-3 line-clamp-[16] text-[22px] leading-snug text-paper/90"}>{active.summary}</p>
              {density === "regular" ? (
                <p className={`mt-3 text-[18px] ${state.status === "fallback" ? "text-gold" : "text-mist"}`}>
                  {state.status === "fallback" ? "Laatste bekende gegevens · " : ""}
                  {ready?.data.connected ? formatPublicationDate(active.publishedAt) : "Voorbeeld"}
                </p>
              ) : null}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="dashboard-progress-track" data-news-progress="">
        <div
          key={`${active.id}-${index}`}
          className="progress-bar dashboard-progress-bar"
          data-paused={detailOpen ? "true" : "false"}
          style={{ animationDuration: `${ROTATE_MS}ms` }}
        />
      </div>
      {detailOpen ? (
        <NewsDetailDialog
          item={active}
          sample={sample}
          site={ready?.data.site ?? null}
          returnFocus={triggerRef.current}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </article>
  );
}
