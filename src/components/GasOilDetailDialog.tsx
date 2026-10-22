import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { GasOilSurchargeResult } from "../types/gasoil";
import { formatAmsterdamTime, formatEuro } from "../lib/format";

const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  month: "long",
  year: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const priceFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function monthLabel(applicableMonth: string | null) {
  if (!applicableMonth) return "—";
  const stamp = Date.parse(`${applicableMonth}-01T12:00:00`);
  if (!Number.isFinite(stamp)) return applicableMonth;
  return monthFormatter.format(new Date(stamp));
}

function peildatumLabel(iso: string | null) {
  if (!iso) return "—";
  const stamp = Date.parse(`${iso}T12:00:00`);
  if (!Number.isFinite(stamp)) return iso;
  return dateFormatter.format(new Date(stamp));
}

type Props = {
  result: GasOilSurchargeResult;
  onClose: () => void;
};

export function GasOilDetailDialog({ result, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const countryName = result.country === "NL" ? "Nederland" : "België";
  const statusLabel =
    result.status === "ok" ? "Actueel" : result.status === "stale" ? "Verouderd" : "Niet beschikbaar";
  const bronPrijs =
    typeof result.sourcePricePer100Liters === "number"
      ? result.sourcePricePer100Liters
      : result.rawPricePer100LitersCbrb;

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/70 p-6" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Sluiten" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] w-full max-w-[720px] rounded-[28px] border border-veil/20 bg-panel p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[18px] text-mist">{countryName}</p>
            <h2 id={titleId} className="font-display text-[34px] leading-none font-semibold text-paper">
              Gasolietoeslag {monthLabel(result.applicableMonth)}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-veil/20 p-2 text-mist hover:text-paper"
            aria-label="Sluiten"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-[18px]">
          <div>
            <dt className="text-mist">Peildatum</dt>
            <dd className="font-semibold text-paper">{peildatumLabel(result.referenceDate)}</dd>
          </div>
          {result.country === "NL" && typeof bronPrijs === "number" ? (
            <div>
              <dt className="text-mist">CBRB/KBN bronprijs</dt>
              <dd className="font-semibold text-paper">{priceFormatter.format(bronPrijs)} / 100 L</dd>
            </div>
          ) : (
            <div>
              <dt className="text-mist">Toepassingsmaand</dt>
              <dd className="font-semibold capitalize text-paper">{monthLabel(result.applicableMonth)}</dd>
            </div>
          )}
          <div>
            <dt className="text-mist">{result.country === "NL" ? "Prijs staffel" : "Gasolieprijs"}</dt>
            <dd className="font-semibold text-paper">
              {typeof result.priceExVatPer1000Liters === "number"
                ? `${priceFormatter.format(result.priceExVatPer1000Liters)} / 1000 L ex BTW`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Staffel</dt>
            <dd className="font-semibold text-paper">
              {result.staffelRange
                ? `${priceFormatter.format(result.staffelRange.from)} - ${priceFormatter.format(result.staffelRange.to)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Toeslag</dt>
            <dd className="font-display text-[40px] leading-none font-semibold text-gold">
              {typeof result.surchargePerTon === "number" ? `${formatEuro(result.surchargePerTon)} / ton` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Status</dt>
            <dd className="font-semibold text-paper">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-mist">Bron</dt>
            <dd className="font-semibold text-paper">{result.sourceLabel}</dd>
          </div>
          <div>
            <dt className="text-mist">Vastlegging</dt>
            <dd className="font-semibold text-paper">
              {result.sourceType === "manual-bootstrap"
                ? "Handmatige bootstrap"
                : result.sourceType === "automatic"
                  ? "Automatisch"
                  : "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-mist">Laatst bijgewerkt</dt>
            <dd className="font-semibold text-paper">
              {result.retrievedAt ? formatAmsterdamTime(result.retrievedAt) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>,
    document.body,
  );
}
