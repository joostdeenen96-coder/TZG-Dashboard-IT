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

const percentFormatter = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

/** ISO-week uitsluitend afgeleid uit peildatum (weergave). */
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
  return `${String(date.day).padStart(2, "0")}-${String(date.month).padStart(2, "0")}-${date.year}`;
}

function formatWeekNumber(week: DieselWeek) {
  if (typeof week.isoWeek === "number" && Number.isFinite(week.isoWeek)) {
    return `Week ${week.isoWeek}`;
  }
  const date = amsterdamDate(week.peildatum);
  if (!date) return "Week";
  return `Week ${isoWeekNumber(date.year, date.month, date.day)}`;
}

function formatExactPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatPricePerLiter(value: number) {
  if (value <= 0) return "geen dieselprijs";
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

function DieselWeekCell({ week, emphasize }: { week: DieselWeek | null; emphasize: boolean }) {
  if (!week) {
    return (
      <li className="grid min-h-0 content-center rounded-[20px] border border-veil/12 bg-veil/[0.06] px-3 py-1">
        <p className="font-display text-[18px] font-semibold text-gold">Dieseltoeslag</p>
        <p className="mt-1 text-[20px] text-mist">Geen voorgaande peildatum</p>
      </li>
    );
  }
  return (
    <li
      data-week={formatWeekNumber(week)}
      data-item-id={week.itemId ?? undefined}
      className={`grid min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-2 rounded-[20px] border px-3 py-1 ${
        emphasize ? "border-gold/45 bg-gold/8" : "border-veil/12 bg-veil/[0.06]"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-[18px] leading-none font-semibold text-gold">{formatWeekNumber(week)}</p>
        <p className="mt-1 font-display text-[36px] leading-none font-semibold tabular-nums">
          {formatExactPercent(week.toeslagPercentage)}
        </p>
        <p className="mt-1 truncate text-[13px] text-mist">Dieseltoeslag</p>
      </div>
      <div className="min-w-0 text-right">
        <p className="truncate text-[13px] leading-tight text-mist">Dieselprijs</p>
        <p className="truncate text-[15px] leading-tight tabular-nums">{formatPricePerLiter(week.dieselPrijs)}</p>
        <p className="mt-1 truncate text-[13px] leading-tight text-mist">Peildatum</p>
        <p className="truncate text-[14px] leading-tight tabular-nums">{formatPeildatum(week.peildatum)}</p>
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

  const dieselWeeks = planningWeeks(
    dieselState.data.weken?.length ? dieselState.data.weken : [dieselState.data],
    2,
  );

  const gasOil =
    gasOilState.status === "ready" || gasOilState.status === "fallback" ? gasOilState.data : null;
  const refreshing = dieselState.refreshing || gasOilState.refreshing;

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col p-3" data-status={dieselState.status}>
      {refreshing ? <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gold" aria-label="Vernieuwen" /> : null}
      <ul className="grid min-h-0 flex-1 grid-rows-4 gap-2">
        <DieselWeekCell week={dieselWeeks[0] ?? null} emphasize />
        <DieselWeekCell week={dieselWeeks[1] ?? null} emphasize={false} />
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
