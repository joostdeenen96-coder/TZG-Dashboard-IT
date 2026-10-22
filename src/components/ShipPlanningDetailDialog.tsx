import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatQuantity } from "../shipPlanning/formatQuantity";
import type { ShipPlanningEntry } from "../types/shipPlanning";

type ShipPlanningDetailDialogProps = {
  entry: ShipPlanningEntry;
  location: string;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 border-b border-veil/10 py-2">
      <dt className="text-[14px] font-semibold tracking-[0.06em] text-mist uppercase">{label}</dt>
      <dd className="text-[20px] text-paper">{value}</dd>
    </div>
  );
}

export function ShipPlanningDetailDialog({ entry, location, onClose }: ShipPlanningDetailDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedAtRef = useRef(Date.now());

  useEffect(() => {
    openedAtRef.current = Date.now();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const requestClose = () => {
    if (Date.now() - openedAtRef.current < 350) return;
    onClose();
  };

  return createPortal(
    <div
      data-testid="ship-planning-detail"
      className="fixed inset-0 z-[10000] grid place-items-center bg-ink/70 p-6 backdrop-blur-md"
      role="presentation"
      onClick={requestClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tv-card relative w-[min(920px,85vw)] max-h-[min(860px,88vh)] overflow-auto px-7 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="absolute top-5 right-5 grid h-12 w-12 place-items-center rounded-full border border-veil/15 bg-veil/[0.06] text-mist hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          aria-label="Sluiten"
          onClick={onClose}
        >
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>
        <h2 id={titleId} className="pr-14 font-display text-[36px] leading-none font-semibold tracking-[-0.02em]">
          {entry.vessel || "Rit"}
        </h2>
        <p className="mt-2 text-[18px] text-mist">{location}</p>
        <dl className="mt-5">
          <Row label="Tijd" value={entry.time} />
          <Row label="Klant" value={entry.customer} />
          <Row label="Losplaats" value={entry.unloadingLocation} />
          <Row label="Conditie" value={entry.condition} />
          <Row label="Product" value={entry.product} />
          <Row label="Hoeveelheid" value={formatQuantity(entry)} />
          <Row label="Order" value={entry.orderNumber} />
          <Row label="Vervoerder" value={entry.carrier} />
          <Row label="Telnr" value={entry.phoneNumber} />
          <Row label="Losdatum" value={entry.unloadingDate} />
          <Row label="Opmerking planning" value={entry.planningRemark} />
        </dl>
      </section>
    </div>,
    document.body,
  );
}
