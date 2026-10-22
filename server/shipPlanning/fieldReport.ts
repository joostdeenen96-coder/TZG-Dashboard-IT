import { PROVEN_PATHS, entityDataRoot, readPath, type ProvenPathKey } from "./mapRecord.js";

const PHONE_PATH = /telefoon|phone|telnr|email/i;

export type FieldStat = {
  path: string;
  types: string[];
  present: number;
  nulls: number;
  nonNull: number;
};

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function walk(value: unknown, prefix: string, into: Map<string, { types: Set<string>; present: number; nulls: number; nonNull: number }>) {
  if (Array.isArray(value)) {
    const stat = into.get(prefix) ?? { types: new Set<string>(), present: 0, nulls: 0, nonNull: 0 };
    stat.types.add("array");
    stat.present += 1;
    stat.nonNull += 1;
    into.set(prefix, stat);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (PHONE_PATH.test(key) && prefix === "") {
      // pad wel registreren, waarde nooit.
    }
    const pathName = prefix ? `${prefix}.${key}` : key;
    const stat = into.get(pathName) ?? { types: new Set<string>(), present: 0, nulls: 0, nonNull: 0 };
    const kind = valueType(nested);
    stat.types.add(kind);
    stat.present += 1;
    if (nested == null) stat.nulls += 1;
    else stat.nonNull += 1;
    into.set(pathName, stat);
    if (nested && typeof nested === "object" && !Array.isArray(nested) && !PHONE_PATH.test(key)) {
      walk(nested, pathName, into);
    }
  }
}

export function describeFields(entities: unknown[]): FieldStat[] {
  const into = new Map<string, { types: Set<string>; present: number; nulls: number; nonNull: number }>();
  for (const entity of entities) {
    walk(entityDataRoot(entity), "", into);
  }
  return [...into.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pathName, stat]) => ({
      path: pathName,
      types: [...stat.types].sort(),
      present: stat.present,
      nulls: stat.nulls,
      nonNull: stat.nonNull,
    }));
}

export function operationalPresence(entities: unknown[]) {
  const rows = entities.map((entity) => entityDataRoot(entity));
  const report: Record<string, { source: string; present: boolean; nonNull: number; nulls: number }> = {};
  for (const key of Object.keys(PROVEN_PATHS) as ProvenPathKey[]) {
    const source = PROVEN_PATHS[key];
    let nonNull = 0;
    let nulls = 0;
    let present = false;
    for (const row of rows) {
      const hit = readPath(row, source);
      if (!hit.present) continue;
      present = true;
      if (hit.value == null || hit.value === "") nulls += 1;
      else nonNull += 1;
    }
    report[key] = { source, present, nonNull, nulls };
  }
  report.quantityUnit = { source: "(geen bronattribuut in plugin-project)", present: false, nonNull: 0, nulls: rows.length };
  return report;
}
