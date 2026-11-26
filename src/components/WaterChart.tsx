import { alignForecast, capForecastHorizon, formatWaterPointTooltip, thinPoints, type ForecastClock } from "../lib/waterForecast";
import type { WaterForecastPoint, WaterPoint } from "../types";

type WaterChartProps = {
  series: WaterPoint[];
  forecast: WaterForecastPoint[];
  stationName?: string;
  forecastClock?: ForecastClock;
  source?: string | null;
  issuedAt?: string | null;
  now?: Date;
};

const dayLabel = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "numeric",
});

const hourLabel = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function chartPath(points: WaterPoint[], xOf: (timestamp: string) => number, yOf: (levelCm: number) => number) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(point.timestamp).toFixed(1)},${yOf(point.levelCm).toFixed(1)}`)
    .join(" ");
}

function tickTimes(start: number, end: number) {
  const count = 4;
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

export function WaterChart({
  series,
  forecast,
  stationName = "Waterstand",
  forecastClock = "shifted",
  source = null,
  issuedAt = null,
  now = new Date(),
}: WaterChartProps) {
  const measured = [...series].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const lastMeasuredMs = measured.length > 0 ? Date.parse(measured[measured.length - 1].timestamp) : Number.NEGATIVE_INFINITY;
  const windowed = capForecastHorizon(forecast, now, forecastClock).points;
  const shifted = alignForecast(windowed, lastMeasuredMs, forecastClock);
  const expected = shifted.filter((point) => point.kind === "verwacht");
  const estimated = shifted.filter((point) => point.kind === "inschatting");
  const drawnMeasured = thinPoints(measured, 48);
  const drawnExpected = thinPoints(expected, 64);
  const drawnEstimated = thinPoints(estimated, 64);
  const bridge = drawnMeasured.length > 0 ? [drawnMeasured[drawnMeasured.length - 1], ...drawnExpected] : drawnExpected;
  const estimateBridge = drawnExpected.length > 0 ? [drawnExpected[drawnExpected.length - 1], ...drawnEstimated] : drawnEstimated;
  const all = [...measured, ...shifted];
  if (all.length < 2) {
    return <p className="px-2 text-[15px] text-mist">Geen grafiekreeks.</p>;
  }

  const width = 560;
  const height = 168;
  const pad = { left: 36, right: 12, top: 10, bottom: 22 };
  const times = all.map((point) => Date.parse(point.timestamp)).filter((value) => Number.isFinite(value));
  const levels = all.map((point) => point.levelCm).filter((value) => Number.isFinite(value));
  if (times.length < 2 || levels.length < 2) {
    return <p className="px-2 text-[15px] text-mist">Geen grafiekreeks.</p>;
  }
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  let min = Math.min(...levels);
  let max = Math.max(...levels);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const xOf = (timestamp: string) => {
    const span = Math.max(1, t1 - t0);
    return pad.left + ((Date.parse(timestamp) - t0) / span) * (width - pad.left - pad.right);
  };
  const yOf = (levelCm: number) => {
    const span = max - min;
    return height - pad.bottom - ((levelCm - min) / span) * (height - pad.top - pad.bottom);
  };
  const spanDays = (t1 - t0) / (24 * 60 * 60 * 1000);
  const labelOf = spanDays < 3 ? hourLabel : dayLabel;
  const marks = (
    points: WaterForecastPoint[] | WaterPoint[],
    mode: "Gemeten" | "Voorspelling" | "Inschatting",
  ) =>
    thinPoints(points, 16).map((point) => (
      <circle
        key={`${mode}-${point.timestamp}-${point.levelCm}`}
        cx={xOf(point.timestamp)}
        cy={yOf(point.levelCm)}
        r={8}
        fill="transparent"
        data-water-tooltip=""
        data-water-tooltip-mode={mode}
      >
        <title>
          {formatWaterPointTooltip({
            station: stationName,
            mode,
            timestamp: point.timestamp,
            levelCm: point.levelCm,
            source,
            issuedAt: mode === "Gemeten" ? null : issuedAt,
          })}
        </title>
      </circle>
    ));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Waterstand en verwachting" data-forecast-clock={forecastClock}>
      <line x1={pad.left} y1={yOf(max)} x2={width - pad.right} y2={yOf(max)} className="stroke-veil/15" />
      <line x1={pad.left} y1={yOf(min)} x2={width - pad.right} y2={yOf(min)} className="stroke-veil/15" />
      <text x={4} y={yOf(max) + 4} className="fill-mist" fontSize="10">
        {max}
      </text>
      <text x={4} y={yOf(min) + 4} className="fill-mist" fontSize="10">
        {min}
      </text>
      {drawnMeasured.length > 1 ? (
        <path d={chartPath(drawnMeasured, xOf, yOf)} fill="none" className="stroke-water" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" data-water-measured-line="" />
      ) : null}
      {bridge.length > 1 ? (
        <path
          d={chartPath(bridge, xOf, yOf)}
          fill="none"
          className="stroke-gold"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="6 4"
          data-water-forecast-line=""
        />
      ) : null}
      {estimateBridge.length > 1 ? (
        <path
          d={chartPath(estimateBridge, xOf, yOf)}
          fill="none"
          className="stroke-mist"
          strokeWidth="2.2"
          strokeDasharray="2 4"
          data-water-estimate-line=""
        />
      ) : null}
      {marks(drawnMeasured, "Gemeten")}
      {marks(expected, "Voorspelling")}
      {marks(estimated, "Inschatting")}
      {tickTimes(t0, t1).map((time, index, ticks) => (
        <text
          key={time}
          x={pad.left + ((time - t0) / Math.max(1, t1 - t0)) * (width - pad.left - pad.right)}
          y={height - 4}
          className="fill-mist"
          fontSize="10"
          textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
          data-water-axis=""
        >
          {labelOf.format(time)}
        </text>
      ))}
    </svg>
  );
}
