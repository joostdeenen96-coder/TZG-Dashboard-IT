export type ClassifiedStation = "kaub" | "ruhrort" | "maxau";

/** Zichtbaar statuslabel. Alleen afgeleid van de actuele gemeten waterstand in cm. */
export type WaterStatusLabel =
  | "Extreem laag"
  | "Zeer laag"
  | "Laag"
  | "Normaal"
  | "Hoog"
  | "Zeer hoog";

export type WaterLevelSeverity = "extreme-low" | "very-low" | "low" | "normal" | "high" | "very-high";

export type WaterLevelClass = {
  label: WaterStatusLabel;
  severity: WaterLevelSeverity;
};

const CLASSES: readonly WaterLevelClass[] = [
  { label: "Extreem laag", severity: "extreme-low" },
  { label: "Zeer laag", severity: "very-low" },
  { label: "Laag", severity: "low" },
  { label: "Normaal", severity: "normal" },
  { label: "Hoog", severity: "high" },
  { label: "Zeer hoog", severity: "very-high" },
];

/**
 * Exclusieve bovengrenzen in cm. level < grens[i] hoort bij klasse i.
 * De laatste klasse vangt alles vanaf de laatste grens, zodat exact die waarde geen gat is.
 */
const UPPER_BOUND_CM: Record<ClassifiedStation, readonly number[]> = {
  kaub: [80, 130, 180, 280, 380],
  maxau: [300, 375, 450, 550, 650],
  ruhrort: [200, 250, 300, 400, 450],
};

export function classifyWaterLevel(
  station: ClassifiedStation,
  levelCm: number | null | undefined,
): WaterLevelClass | null {
  if (typeof levelCm !== "number" || !Number.isFinite(levelCm)) return null;
  const bounds = UPPER_BOUND_CM[station];
  for (let index = 0; index < bounds.length; index += 1) {
    if (levelCm < bounds[index]) return CLASSES[index];
  }
  return CLASSES[CLASSES.length - 1];
}

export function applyMeasuredStatus<T extends { levelCm: number }>(
  station: ClassifiedStation,
  reading: T,
): T & { status: WaterStatusLabel; severity: WaterLevelSeverity } {
  const classified = classifyWaterLevel(station, reading.levelCm);
  if (!classified) throw new Error("Actuele waterstand is ongeldig.");
  return { ...reading, status: classified.label, severity: classified.severity };
}
