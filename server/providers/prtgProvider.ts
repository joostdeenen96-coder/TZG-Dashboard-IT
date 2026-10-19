import http from "node:http";
import https from "node:https";

export type PrtgAlarmStatus = "warning" | "down" | "unusual" | "downPartial" | "downAcknowledged";

export type PrtgMetricKind = "cpu" | "memory" | "storage";

export type PrtgSensorStatus =
  | "up"
  | "warning"
  | "down"
  | "unusual"
  | "downPartial"
  | "downAcknowledged"
  | "unknown";

export type PrtgAlarm = {
  id: string;
  device: string;
  sensor: string;
  status: PrtgAlarmStatus;
  message: string;
  acknowledged: boolean;
  group: string;
  lastvalue: string;
  sinceLabel: string | null;
  sinceAt: string | null;
  suggestion: string | null;
};

export type PrtgMetric = {
  sensorId: string;
  name: string;
  percent: number | null;
  status: PrtgSensorStatus;
  high: boolean;
};

export type PrtgServer = {
  id: string;
  name: string;
  cpu: PrtgMetric | null;
  memory: PrtgMetric | null;
  storage: PrtgMetric[];
};

export type PrtgSnapshot = {
  alarms: PrtgAlarm[];
  servers: PrtgServer[];
};

export type PrtgCredentials = {
  baseUrl: string;
  username: string;
  passhash: string;
  password: string;
};

export type PrtgFilter = {
  groupId: string;
  tag: string;
};

const ALARM_STATUS_CODES = new Set([4, 5, 10, 13, 14]);
const HIGH_PERCENT = 85;

const statusByCode: Record<number, PrtgSensorStatus> = {
  3: "up",
  4: "warning",
  5: "down",
  10: "unusual",
  13: "downAcknowledged",
  14: "downPartial",
};

const alarmStatusByCode: Record<number, PrtgAlarmStatus> = {
  4: "warning",
  5: "down",
  10: "unusual",
  13: "downAcknowledged",
  14: "downPartial",
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("PRTG_BASE_URL is geen geldig adres.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PRTG_BASE_URL moet http of https zijn.");
  }
  // Alleen host: /index.htm of andere UI-paden horen niet in API-aanroepen.
  return url.origin;
}

export function readPrtgCredentials(fromSettings?: {
  baseUrl?: string;
  username?: string;
  password?: string;
}): PrtgCredentials | null {
  const baseUrl = text(fromSettings?.baseUrl) || text(process.env.PRTG_BASE_URL);
  const username = text(fromSettings?.username) || text(process.env.PRTG_USERNAME);
  const passhash = text(process.env.PRTG_PASSHASH);
  const password = text(fromSettings?.password) || text(process.env.PRTG_PASSWORD);
  if (!baseUrl || (!passhash && !password)) return null;
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    username: username || "Beheert",
    passhash,
    password,
  };
}

function mapStatus(code: number | null): PrtgSensorStatus {
  if (code === null) return "unknown";
  return statusByCode[code] ?? "unknown";
}

function parsePercent(lastvalue: string, kind: PrtgMetricKind, sensorName: string) {
  const match = lastvalue.replace(",", ".").match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  let percent = Number(match[1]);
  if (!Number.isFinite(percent)) return null;
  percent = Math.max(0, Math.min(100, percent));
  const label = `${sensorName} ${lastvalue}`.toLowerCase();
  const looksFree =
    kind === "storage" &&
    (/\bfree\b/.test(label) || /\bvrij\b/.test(label) || /\bfrei\b/.test(label) || /disk free|free space|vrije ruimte/.test(label));
  if (looksFree) percent = Math.max(0, Math.min(100, 100 - percent));
  return Math.round(percent * 10) / 10;
}

function classifyMetric(type: string, name: string, tags: string): PrtgMetricKind | null {
  const hay = `${type} ${name} ${tags}`.toLowerCase();
  if (/\bcpu\b|processor|processor load|cpu load|snmp cpu|wmi cpu|ptf cpu|processor time/.test(hay)) return "cpu";
  if (/\bmem(?:ory)?\b|\bram\b|physical memory|available memory|snmp memory|wmi memory|geheugen/.test(hay)) {
    return "memory";
  }
  if (
    /\bdisk\b|\bdrive\b|storage|volume|logical disk|snmp disk|disk free|disk space|schijf|opslag|vrijespace|free space/.test(
      hay,
    )
  ) {
    return "storage";
  }
  return null;
}

function authParams(credentials: PrtgCredentials) {
  const params: Record<string, string> = { username: credentials.username };
  // Passhash heeft voorrang; wachtwoord alleen als er geen hash is.
  if (credentials.passhash) params.passhash = credentials.passhash;
  else if (credentials.password) params.password = credentials.password;
  return params;
}

function httpErrorMessage(status: number) {
  if (status === 401 || status === 403) {
    return "PRTG-login geweigerd. Controleer gebruiker en wachtwoord of passhash.";
  }
  if (status === 404) {
    return "PRTG API niet gevonden (404). Zet PRTG_BASE_URL op https://prtg.teunesen.local (zonder /index.htm) en gebruik als groep-ID alleen het nummer uit de PRTG-URL.";
  }
  return `PRTG antwoordde met ${status}.`;
}

function allowInsecureTls(baseUrl: string) {
  const flag = text(process.env.PRTG_TLS_INSECURE).toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "localhost" || host.endsWith(".local") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

function requestPrtg(url: URL, insecure: boolean): Promise<{ status: number; body: string }> {
  const transport = url.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "TeunesenDashboard/0.1 (ict-scherm)",
        },
        timeout: 20_000,
        ...(url.protocol === "https:" ? { rejectUnauthorized: !insecure } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchPrtgJson(credentials: PrtgCredentials, params: Record<string, string>) {
  const url = new URL(`${credentials.baseUrl}/api/table.json`);
  for (const [key, value] of Object.entries({ ...params, ...authParams(credentials), output: "json" })) {
    url.searchParams.set(key, value);
  }
  const insecure = allowInsecureTls(credentials.baseUrl);
  let result: { status: number; body: string };
  try {
    result = await requestPrtg(url, insecure);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (/certificate|CERT|TLS|SSL|self.signed|unable to verify/i.test(detail)) {
      throw new Error(
        "PRTG TLS-certificaat geweigerd. Zet PRTG_TLS_INSECURE=true in .env of gebruik een vertrouwd certificaat.",
      );
    }
    throw new Error("PRTG niet bereikbaar. Controleer of deze pc https://prtg.teunesen.local kan openen.");
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(httpErrorMessage(result.status));
  }
  try {
    return JSON.parse(result.body) as unknown;
  } catch {
    // PRTG geeft bij fouten soms XML terug i.p.v. JSON.
    if (result.body.includes("<error>") || result.body.includes("<prtg>")) {
      const match = result.body.match(/<error>([^<]+)<\/error>/i);
      throw new Error(match?.[1]?.trim() || "PRTG gaf een fout terug.");
    }
    throw new Error("PRTG gaf geen geldige data. Login of basisadres klopt waarschijnlijk niet.");
  }
}

async function fetchTable(credentials: PrtgCredentials, params: Record<string, string>) {
  const payload = await fetchPrtgJson(credentials, params);
  const row = asRecord(payload);
  const key = text(params.content) || "sensors";
  const list = row?.[key];
  if (!Array.isArray(list)) {
    throw new Error("PRTG-tabel mist sensorgegevens.");
  }
  return list;
}

function cleanMessage(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parsePrtgStamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^(-|n\/a|none)$/i.test(trimmed)) return null;
  // PRTG levert vaak "16-10-2026 12:03:01" of ISO.
  const euro = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (euro) {
    const day = Number(euro[1]);
    const month = Number(euro[2]);
    const year = Number(euro[3]);
    const hour = Number(euro[4] ?? 0);
    const minute = Number(euro[5] ?? 0);
    const second = Number(euro[6] ?? 0);
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function formatDurationSince(iso: string | null) {
  if (!iso) return null;
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} u ${rest} min` : `${hours} u`;
  const days = Math.floor(hours / 24);
  const hourRest = hours % 24;
  return hourRest ? `${days} d ${hourRest} u` : `${days} d`;
}

function suggestForAlarm(input: {
  status: PrtgAlarmStatus;
  sensor: string;
  message: string;
  type: string;
  lastvalue: string;
}) {
  const hay = `${input.sensor} ${input.message} ${input.type} ${input.lastvalue}`.toLowerCase();
  if (/ssl|certificaat|certificate|tls/.test(hay)) {
    return "Controleer of het SSL-certificaat bijna verloopt of ongeldig is en plan vernieuwing.";
  }
  if (/\bcpu\b|processor|load/.test(hay)) {
    return "Bekijk welke processen de CPU belasten en herstart zware diensten indien nodig.";
  }
  if (/\bmem(?:ory)?\b|\bram\b|geheugen/.test(hay)) {
    return "Controleer geheugengebruik en geheugenlekken; herstart de dienst bij aanhoudend hoge druk.";
  }
  if (/\bdisk\b|drive|opslag|schijf|free space|vrije ruimte/.test(hay)) {
    return "Maak schijfruimte vrij of breid de volume uit; controleer log- en temp-mappen.";
  }
  if (/ping|icmp|timeout|niet bereikbaar|unreachable|no response/.test(hay)) {
    return "Controleer netwerk, firewall en of de host nog online is.";
  }
  if (/snmp|wmi|credentials|authentication|login|access denied/.test(hay)) {
    return "Controleer monitoringsrechten, SNMP/WMI-instellingen en of de service draait.";
  }
  if (input.status === "down" || input.status === "downPartial") {
    return "Open de sensor in PRTG, bekijk de historie en herstel de onderliggende dienst of verbinding.";
  }
  if (input.status === "warning" || input.status === "unusual") {
    return "Bekijk drempels en recente metingen in PRTG; grijp in als de waarde verder oploopt.";
  }
  return null;
}

function buildQuery(filter: PrtgFilter) {
  const params: Record<string, string> = {
    content: "sensors",
    columns: "objid,device,sensor,status,message,lastvalue,type,tags,group,downtimesince,lastdown,lastup,lastcheck",
    count: "5000",
  };
  // Numeriek = object-id in de PRTG-URL. Tekst = groepsnaam via filter.
  if (filter.groupId) {
    if (/^\d+$/.test(filter.groupId)) params.id = filter.groupId;
    else params.filter_group = filter.groupId;
  }
  if (filter.tag) params.filter_tags = `@tag(${filter.tag})`;
  return params;
}

function sensorRows(raw: unknown[]) {
  return raw.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = text(row.objid) || text(row.objid_raw);
    const device = text(row.device);
    const sensor = text(row.sensor);
    if (!id || !device || !sensor) return [];
    const statusRaw = numberValue(row.status_raw) ?? numberValue(row.status);
    return [
      {
        id,
        device,
        sensor,
        statusCode: statusRaw,
        message: text(row.message) || text(row.message_raw) || "",
        lastvalue: text(row.lastvalue),
        type: text(row.type) || text(row.type_raw),
        tags: text(row.tags),
        group: text(row.group),
        downtimesince: text(row.downtimesince) || text(row.downtimesince_raw),
        lastdown: text(row.lastdown) || text(row.lastdown_raw),
        lastup: text(row.lastup) || text(row.lastup_raw),
        lastcheck: text(row.lastcheck) || text(row.lastcheck_raw),
      },
    ];
  });
}

function toAlarm(row: ReturnType<typeof sensorRows>[number]): PrtgAlarm | null {
  if (row.statusCode === null || !ALARM_STATUS_CODES.has(row.statusCode)) return null;
  const status = alarmStatusByCode[row.statusCode];
  if (!status) return null;
  const message = cleanMessage(row.message);
  const sinceAt = parsePrtgStamp(row.lastdown) || parsePrtgStamp(row.lastcheck);
  const sinceFromPrtg = row.downtimesince && !/^(-|0+|none|n\/a)$/i.test(row.downtimesince) ? row.downtimesince : null;
  const sinceLabel = sinceFromPrtg || formatDurationSince(sinceAt);
  return {
    id: row.id,
    device: row.device,
    sensor: row.sensor,
    status,
    message,
    acknowledged: status === "downAcknowledged",
    group: row.group,
    lastvalue: row.lastvalue,
    sinceLabel,
    sinceAt,
    suggestion: suggestForAlarm({
      status,
      sensor: row.sensor,
      message,
      type: row.type,
      lastvalue: row.lastvalue,
    }),
  };
}

function toMetric(
  row: ReturnType<typeof sensorRows>[number],
  kind: PrtgMetricKind,
): PrtgMetric {
  const percent = parsePercent(row.lastvalue, kind, row.sensor);
  const status = mapStatus(row.statusCode);
  const high = percent !== null && percent >= HIGH_PERCENT;
  return {
    sensorId: row.id,
    name: row.sensor,
    percent,
    status,
    high,
  };
}

function buildServers(rows: ReturnType<typeof sensorRows>) {
  const byDevice = new Map<
    string,
    {
      name: string;
      cpu: PrtgMetric | null;
      memory: PrtgMetric | null;
      storage: PrtgMetric[];
    }
  >();

  for (const row of rows) {
    const kind = classifyMetric(row.type, row.sensor, row.tags);
    if (!kind) continue;
    const key = row.device.toLowerCase();
    let bucket = byDevice.get(key);
    if (!bucket) {
      bucket = { name: row.device, cpu: null, memory: null, storage: [] };
      byDevice.set(key, bucket);
    }
    const metric = toMetric(row, kind);
    if (kind === "cpu") {
      if (!bucket.cpu || (metric.percent ?? -1) > (bucket.cpu.percent ?? -1)) bucket.cpu = metric;
    } else if (kind === "memory") {
      if (!bucket.memory || (metric.percent ?? -1) > (bucket.memory.percent ?? -1)) bucket.memory = metric;
    } else {
      bucket.storage.push(metric);
    }
  }

  return [...byDevice.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      cpu: value.cpu,
      memory: value.memory,
      storage: value.storage
        .slice()
        .sort((left, right) => (right.percent ?? -1) - (left.percent ?? -1) || left.name.localeCompare(right.name, "nl")),
    }))
    .filter((server) => server.cpu || server.memory || server.storage.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name, "nl"));
}

export function filterIsSet(filter: PrtgFilter) {
  return Boolean(filter.groupId || filter.tag);
}

export async function fetchPrtgSnapshot(credentials: PrtgCredentials, filter: PrtgFilter): Promise<PrtgSnapshot> {
  if (!filterIsSet(filter)) {
    return { alarms: [], servers: [] };
  }
  const sensors = sensorRows(await fetchTable(credentials, buildQuery(filter)));
  const alarms = sensors
    .map(toAlarm)
    .filter((item): item is PrtgAlarm => item !== null)
    .sort((left, right) => {
      const rank = (status: PrtgAlarmStatus) => {
        if (status === "down") return 0;
        if (status === "downPartial") return 1;
        if (status === "warning") return 2;
        if (status === "unusual") return 3;
        return 4;
      };
      return rank(left.status) - rank(right.status) || left.device.localeCompare(right.device, "nl");
    });
  return {
    alarms,
    servers: buildServers(sensors),
  };
}
