import { formatPublicationDate } from "../lib/format";
import type { WijNewsItem } from "../types";
import { DashboardDetailModal } from "./DashboardDetailModal";

type NewsDetailDialogProps = {
  item: WijNewsItem;
  sample: boolean;
  site: string | null;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};

function publication(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return formatPublicationDate(iso);
}

export function NewsDetailDialog({ item, sample, site, onClose, returnFocus }: NewsDetailDialogProps) {
  const published = publication(item.publishedAt);
  const subtitle = [item.category, published].filter(Boolean).join(" · ");

  return (
    <DashboardDetailModal
      testId="news-detail"
      kicker="WijTeunesen"
      title={item.title}
      subtitle={subtitle || (sample ? "Voorbeeld" : undefined)}
      footer={site ? <p>Bron: WijTeunesen · {site}</p> : <p>Bron: WijTeunesen</p>}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      {item.imagePath ? <img src={item.imagePath} alt="" className="dashboard-detail-image" /> : null}
      {item.summary ? <p className="dashboard-detail-prose">{item.summary}</p> : null}
    </DashboardDetailModal>
  );
}
