import { useState } from "react";
import { useDieselSurcharge } from "../services/dieselService";
import { useGasOilSurcharges } from "../services/gasOilService";
import type { DieselWeek } from "../types";
import type { GasOilSurchargeResult } from "../types/gasoil";
import { formatEuro } from "../lib/format";
import { GasOilDetailDialog } from "./GasOilDetailDialog";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  month: "long",
});

const priceFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function amsterdamDate(iso: string) {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (ymd) {
    return { year: Number(ymd[1]), month: Number(ymd[2]), day: Number(ymd[3]) };
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const parts = dateFormatter.formatToParts(new Date(parsed));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatPeildatum(iso: string) {
  const date = amsterdamDate(iso);
  if (!date) return iso;
  return `${String(date.day).padStart(2, "0")}-${String(date.month).padStart(2, "0")}-${date.year}`;
}

/** Zichtbaar weeknummer uitsluitend uit SharePoint WebsiteWeek. */
function formatWebsiteWeek(week: DieselWeek) {
  return `Week ${week.websiteWeek}`;
}

/** Weergave: Math.floor(raw) → geheel percentage, geen decimalen. */
function formatFlooredPercent(week: DieselWeek) {
  const display =
    typeof week.toeslagPercentageDisplay === "number"
      ? week.toeslagPercentageDisplay
      : week.toeslagPercentage;
  return `${display}%`;
}

function formatPricePerLiter(value: number | null) {
  if (value == null || value <= 0) return "geen dieselprijs";
  return `${priceFormatter.format(value)} / liter`;
}

function planningWeeks(weeks: DieselWeek[], count: number) {
  return [...weeks]
    .sort((left, right) => {
      const byDate = Date.parse(right.peildatum) - Date.parse(left.peildatum);
      if (byDate !== 0) return byDate;
      return String(right.itemId ?? "").localeCompare(String(left.itemId ?? ""));
    })
    .slice(0, count);
}

function monthName(applicableMonth: string | null) {
  if (!applicableMonth) return "";
  const stamp = Date.parse(`${applicableMonth}-01T12:00:00`);
  if (!Number.isFinite(stamp)) return applicableMonth;
  return monthFormatter.format(new Date(stamp));
}

const tileFrame = "relative h-full min-h-0 overflow-hidden rounded-[20px] border";
const tileBody = "flex h-full min-h-0 flex-col justify-between gap-1 px-3 py-2";

function DieselWeekCell({ week, emphasize }: { week: DieselWeek | null; emphasize: boolean }) {
  const frame = `${tileFrame} ${emphasize ? "border-gold/45 bg-gold/8" : "border-veil/12 bg-veil/[0.06]"}`;
  if (!week) {
    return (
      <li className={frame} data-surcharge-tile="" data-surcharge="diesel-empty">
        <div className={tileBody} data-surcharge-body="">
          <p className="font-display text-[18px] font-semibold text-gold" data-diesel-label="">Dieseltoeslag</p>
          <p className="text-[20px] text-mist" data-diesel-meta="">Geen voorgaande peildatum</p>
          <span />
        </div>
      </li>
    );
  }
  return (
    <li
      data-week={formatWebsiteWeek(week)}
      data-item-id={week.itemId ?? undefined}
      data-raw-toeslag={week.toeslagPercentageRaw}
      data-surcharge-tile=""
      data-surcharge={emphasize ? "diesel-current" : "diesel-previous"}
      className={frame}
    >
      <div className={tileBody} data-surcharge-body="">
        <p className="font-display text-[18px] leading-none font-semibold text-gold" data-diesel-label="">{formatWebsiteWeek(week)}</p>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-2">
          <p className="font-display text-[40px] leading-none font-semibold tabular-nums" data-diesel-value="">
            {formatFlooredPercent(week)}
          </p>
          <div className="min-w-0 text-right">
            <p className="truncate text-[13px] leading-tight text-mist" data-diesel-meta="">Dieselprijs</p>
            <p className="truncate text-[15px] leading-tight tabular-nums" data-diesel-meta="">{formatPricePerLiter(week.dieselPrijs)}</p>
            <p className="mt-1 truncate text-[13px] leading-tight text-mist" data-diesel-meta="">Peildatum</p>
            <p className="truncate text-[14px] leading-tight tabular-nums" data-diesel-meta="">{formatPeildatum(week.peildatum)}</p>
          </div>
        </div>
        <p className="truncate text-[13px] text-mist" data-diesel-meta="">Dieseltoeslag</p>
      </div>
    </li>
  );
}

function GasOilCell({
  result,
  countryLabel,
  onOpen,
}: {
  result: GasOilSurchargeResult | null;
  countryLabel: string;
  onOpen: () => void;
}) {
  const unavailable = !result || result.status === "unavailable";
  const stale = result?.status === "stale";
  const canOpen =
    !!result &&
    (result.status === "ok" || result.status === "stale") &&
    typeof result.surchargePerTon === "number";

  const key = countryLabel === "België" ? "gas-be" : "gas-nl";
  return (
    <li
      className={`${tileFrame} ${stale ? "border-gold/35 bg-gold/6" : "border-veil/12 bg-veil/[0.06]"}`}
      data-surcharge-tile=""
      data-surcharge={key}
    >
      <button
        type="button"
        onClick={() => {
          if (canOpen) onOpen();
        }}
        disabled={!canOpen}
        data-surcharge-body=""
        className={`${tileBody} absolute inset-0 w-full text-left disabled:opacity-100 ${canOpen ? "cursor-pointer" : "cursor-default"}`}
      >
        <p className="font-display text-[18px] leading-none font-semibold text-gold" data-diesel-label="">Gasolietoeslag</p>
        <div className="flex min-h-0 flex-1 items-center">
          {unavailable ? (
            <p className="font-display text-[28px] leading-tight font-semibold text-mist" data-diesel-value="">Niet beschikbaar</p>
          ) : (
            <p className="font-display text-[42px] leading-none font-semibold tabular-nums text-paper" data-gas-value="">
              {formatEuro(result!.surchargePerTon!)}
              <span className="ml-1 text-[18px] font-normal text-mist" data-diesel-unit="">/ ton</span>
            </p>
          )}
        </div>
        <p className="truncate text-[15px] capitalize text-mist" data-diesel-meta="">
          {countryLabel}
          {result?.applicableMonth ? ` · ${monthName(result.applicableMonth)}` : ""}
          {stale ? " · verouderd" : ""}
        </p>
      </button>
    </li>
  );
}

function DieselStatusCell({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <li className={`${tileFrame} border-veil/12 bg-veil/[0.06]`} data-surcharge-tile="" data-surcharge="diesel-status">
      <div className={tileBody} data-surcharge-body="">
        <p className="font-display text-[18px] font-semibold text-gold" data-diesel-label="">{title}</p>
        <p className="text-[16px] leading-snug text-mist" data-diesel-meta="">{message}</p>
        <span />
      </div>
    </li>
  );
}

export function DieselCard() {
  const dieselState = useDieselSurcharge();
  const gasOilState = useGasOilSurcharges();
  const [detail, setDetail] = useState<GasOilSurchargeResult | null>(null);

  const dieselReady = dieselState.status === "ready" || dieselState.status === "fallback";
  const dieselWeeks = dieselReady
    ? planningWeeks(dieselState.data.weken?.length ? dieselState.data.weken : [dieselState.data], 2)
    : [];

  const gasOil =
    gasOilState.status === "ready" || gasOilState.status === "fallback" ? gasOilState.data : null;
  const refreshing = dieselState.refreshing || gasOilState.refreshing;
  const cardStatus = dieselReady ? dieselState.status : gasOil ? "ready" : dieselState.status;

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col p-3" data-diesel-card="" data-status={cardStatus}>
      {refreshing ? <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gold" aria-label="Vernieuwen" /> : null}
      <ul
        className="grid h-full min-h-0 flex-1 gap-2"
        data-diesel-stack=""
        style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
      >
        {dieselReady ? (
          <>
            <DieselWeekCell week={dieselWeeks[0] ?? null} emphasize />
            <DieselWeekCell week={dieselWeeks[1] ?? null} emphasize={false} />
          </>
        ) : dieselState.status === "error" ? (
          <>
            <DieselStatusCell title="Dieseltoeslag" message={dieselState.message} />
            <DieselStatusCell title="Dieseltoeslag" message="Vorige week niet beschikbaar" />
          </>
        ) : dieselState.status === "empty" ? (
          <>
            <DieselStatusCell title="Dieseltoeslag" message="Geen toeslag beschikbaar." />
            <DieselStatusCell title="Dieseltoeslag" message="Geen voorgaande peildatum" />
          </>
        ) : (
          <>
            <DieselStatusCell title="Dieseltoeslag" message="Toeslag laden." />
            <DieselStatusCell title="Dieseltoeslag" message="Toeslag laden." />
          </>
        )}
        <GasOilCell
          result={gasOil?.nl ?? null}
          countryLabel="Nederland"
          onOpen={() => {
            if (gasOil?.nl) setDetail(gasOil.nl);
          }}
        />
        <GasOilCell
          result={gasOil?.be ?? null}
          countryLabel="België"
          onOpen={() => {
            if (gasOil?.be) setDetail(gasOil.be);
          }}
        />
      </ul>
      {dieselState.status === "fallback" ? (
        <p className="mt-1 truncate text-center text-[13px] text-gold">Laatste bekende dieselgegevens</p>
      ) : null}
      {detail && (detail.status === "ok" || detail.status === "stale") ? (
        <GasOilDetailDialog result={detail} onClose={() => setDetail(null)} />
      ) : null}
    </article>
  );
}
