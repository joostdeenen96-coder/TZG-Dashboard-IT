import { useState } from "react";
import { useDieselSurcharge } from "../services/dieselService";
import { useGasOilSurcharges } from "../services/gasOilService";
import type { DieselWeek } from "../types";
import type { GasOilSurchargeResult } from "../types/gasoil";
import { formatEuro } from "../lib/format";
import { CardState } from "./CardState";
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

function isoWeekNumber(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function formatPeildatum(iso: string) {
  const date = amsterdamDate(iso);
  if (!date) return iso;
  return `${date.day}-${date.month}-${date.year}`;
}

function formatWeekNumber(iso: string) {
  const date = amsterdamDate(iso);
  if (!date) return "Week";
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const weekday = next.getUTCDay() || 7;
  next.setUTCDate(next.getUTCDate() + (weekday === 1 ? 7 : 8 - weekday));
  return `Week ${isoWeekNumber(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`;
}

function formatWholePercent(value: number) {
  return `${Math.floor(value + 1e-6)}%`;
}

function formatPrice(value: number) {
  if (value <= 0) return "geen dieselprijs";
  return priceFormatter.format(value);
}

function newestWeeks(weeks: DieselWeek[], count: number) {
  return [...weeks].sort((left, right) => Date.parse(right.peildatum) - Date.parse(left.peildatum)).slice(0, count);
}

function monthName(applicableMonth: string | null) {
  if (!applicableMonth) return "";
  const stamp = Date.parse(`${applicableMonth}-01T12:00:00`);
  if (!Number.isFinite(stamp)) return applicableMonth;
  return monthFormatter.format(new Date(stamp));
}

function DieselWeekCell({ week, emphasize }: { week: DieselWeek; emphasize: boolean }) {
  return (
    <li
      data-week={formatWeekNumber(week.peildatum)}
      className={`grid min-h-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[20px] border px-3 ${
        emphasize ? "border-gold/45 bg-gold/8" : "border-veil/12 bg-veil/[0.06]"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-[20px] leading-none font-semibold text-gold">{formatWeekNumber(week.peildatum)}</p>
        <p className="mt-1 font-display text-[42px] leading-none font-semibold tabular-nums">
          {formatWholePercent(week.toeslagPercentage)}
        </p>
        <p className="mt-1 truncate text-[14px] text-mist">Dieseltoeslag</p>
      </div>
      <div className="min-w-0 text-right">
        <p className="truncate text-[15px] leading-tight">Dieselprijs {formatPrice(week.dieselPrijs)}</p>
        <p className="mt-1 truncate text-[14px] leading-tight text-mist">Peildatum {formatPeildatum(week.peildatum)}</p>
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
    (result.status === "ready" || result.status === "stale") &&
    typeof result.surchargePerTon === "number";

  return (
    <li className="min-h-0">
      <button
        type="button"
        onClick={() => {
          if (canOpen) onOpen();
        }}
        disabled={!canOpen}
        className={`grid h-full min-h-0 w-full grid-cols-1 content-center gap-1 rounded-[20px] border px-3 py-2 text-left ${
          stale ? "border-gold/35 bg-gold/6" : "border-veil/12 bg-veil/[0.06]"
        } ${canOpen ? "cursor-pointer hover:border-gold/40" : "cursor-default"}`}
      >
        <p className="font-display text-[18px] leading-none font-semibold text-gold">Gasolietoeslag</p>
        {unavailable ? (
          <p className="font-display text-[28px] leading-tight font-semibold text-mist">Niet beschikbaar</p>
        ) : (
          <p className="font-display text-[42px] leading-none font-semibold tabular-nums text-paper">
            {formatEuro(result!.surchargePerTon!)}
            <span className="ml-1 text-[18px] font-normal text-mist">/ ton</span>
          </p>
        )}
        <p className="truncate text-[15px] capitalize text-mist">
          {countryLabel}
          {result?.applicableMonth ? ` · ${monthName(result.applicableMonth)}` : ""}
        </p>
        {stale ? <p className="text-[13px] text-gold">verouderd</p> : null}
      </button>
    </li>
  );
}

export function DieselCard() {
  const dieselState = useDieselSurcharge();
  const gasOilState = useGasOilSurcharges();
  const [detail, setDetail] = useState<GasOilSurchargeResult | null>(null);

  if (dieselState.status === "error") {
    return <CardState status="error" title="Dieseltoeslag" message={dieselState.message} />;
  }
  if (dieselState.status === "empty") {
    return <CardState status="empty" title="Dieseltoeslag" message="Geen toeslag beschikbaar." />;
  }
  if (dieselState.status !== "ready" && dieselState.status !== "fallback") {
    return <CardState status="loading" title="Dieseltoeslag" message="Toeslag laden." />;
  }

  const dieselWeeks = newestWeeks(
    dieselState.data.weken?.length ? dieselState.data.weken : [dieselState.data],
    2,
  );
  while (dieselWeeks.length < 2) {
    dieselWeeks.push(dieselWeeks[0] ?? dieselState.data);
  }

  const gasOil =
    gasOilState.status === "ready" || gasOilState.status === "fallback" ? gasOilState.data : null;
  const refreshing = dieselState.refreshing || gasOilState.refreshing;

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col p-3" data-status={dieselState.status}>
      {refreshing ? <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gold" aria-label="Vernieuwen" /> : null}
      <ul className="grid min-h-0 flex-1 grid-rows-4 gap-2">
        <DieselWeekCell week={dieselWeeks[0]!} emphasize />
        <DieselWeekCell week={dieselWeeks[1]!} emphasize={false} />
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
      {detail && (detail.status === "ready" || detail.status === "stale") ? (
        <GasOilDetailDialog result={detail} onClose={() => setDetail(null)} />
      ) : null}
    </article>
  );
}
