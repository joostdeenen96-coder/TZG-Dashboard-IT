export type ResourceSensorStatus =
  | "up"
  | "warning"
  | "down"
  | "unusual"
  | "downPartial"
  | "downAcknowledged"
  | "paused"
  | "unknown";

export type DiskResource = {
  name: string;
  usedBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
  usedPercentage: number | null;
  status: ResourceSensorStatus;
  measuredAt: string | null;
  sourceSensorId: string;
};

export type NetworkResource = {
  name: string;
  inbound: number | null;
  outbound: number | null;
  errors: number | null;
  unit: string | null;
  status: ResourceSensorStatus;
  measuredAt: string | null;
  sourceSensorId: string;
};

export type SensorLine = {
  id: string;
  name: string;
  status: ResourceSensorStatus;
  message: string;
  lastvalue: string;
  measuredAt: string | null;
  device: string;
};

export type ServerResourceDetails = {
  serverId: string;
  serverName: string;
  status: ResourceSensorStatus;
  statusMessage: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  groupName: string | null;
  lastUpdatedAt: string | null;
  retrievedAt: string;
  cpu: { usedPercent: number | null; status: ResourceSensorStatus; measuredAt: string | null; sensorName: string | null } | null;
  memory: {
    usedPercent: number | null;
    usedBytes: number | null;
    totalBytes: number | null;
    freeBytes: number | null;
    status: ResourceSensorStatus;
    measuredAt: string | null;
    sensorName: string | null;
  } | null;
  disks: DiskResource[];
  network: NetworkResource[];
  availability: {
    uptime: string | null;
    lastReboot: string | null;
    ping: string | null;
    responseTime: string | null;
    status: ResourceSensorStatus;
    measuredAt: string | null;
  } | null;
  alerts: SensorLine[];
  otherSensors: SensorLine[];
};

export type ProbeChannel = { name: string; lastvalue: string };

export type ProbeSensor = {
  id: string;
  device: string;
  name: string;
  type: string;
  tags: string;
  statusCode: number | null;
  message: string;
  lastvalue: string;
  group: string;
  lastcheck: string;
  channels: ProbeChannel[];
};

export type ProbeDevice = {
  name: string;
  host: string;
  group: string;
  statusCode: number | null;
  message: string;
} | null;

const BYTE_UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1000,
  kbyte: 1000,
  kib: 1024,
  mb: 1000 ** 2,
  mbyte: 1000 ** 2,
  mib: 1024 ** 2,
  gb: 1000 ** 3,
  gbyte: 1000 ** 3,
  gib: 1024 ** 3,
  tb: 1000 ** 4,
  tbyte: 1000 ** 4,
  tib: 1024 ** 4,
};

const RATE_UNITS = ["gbit/s", "mbit/s", "kbit/s", "bit/s", "gbps", "mbps", "kbps"];

export function sensorStatus(code: number | null): ResourceSensorStatus {
  if (code === 3) return "up";
  if (code === 4) return "warning";
  if (code === 5) return "down";
  if (code === 7 || code === 8 || code === 9 || code === 11 || code === 12) return "paused";
  if (code === 10) return "unusual";
  if (code === 13) return "downAcknowledged";
  if (code === 14) return "downPartial";
  return "unknown";
}

function finite(value: number) {
  return Number.isFinite(value) ? value : null;
}

export function parseNumber(raw: string) {
  const match = raw.replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return finite(Number(match[0]));
}

export function parsePercent(raw: string) {
  if (!raw.includes("%")) return null;
  return parseNumber(raw);
}

export function parseBytes(raw: string) {
  const match = raw
    .replace(",", ".")
    .match(/(-?\d+(?:\.\d+)?)\s*(tib|gib|mib|kib|tbyte|gbyte|mbyte|kbyte|bytes|byte|tb|gb|mb|kb|b)\b/i);
  if (!match) return null;
  const amount = finite(Number(match[1]));
  const factor = BYTE_UNITS[match[2].toLowerCase()];
  if (amount === null || factor === undefined) return null;
  return finite(amount * factor);
}

export function rateUnit(raw: string) {
  const lower = raw.toLowerCase();
  return RATE_UNITS.find((unit) => lower.includes(unit)) ?? null;
}

function compact(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function categoryFromType(type: string) {
  const value = compact(type);
  if (!value || value === "exesensor" || value === "factorysensor" || value === "sensorfactory") return null;
  if (/snmpcpu|wmiprocessor|ptfcpu|cpuload|hostresourcecpu|processorload|processor/.test(value)) return "cpu" as const;
  if (/snmpmemory|wmimemory|meminfo|hostresourcemem/.test(value)) return "memory" as const;
  if (/snmpdisk|wmidisk|logicaldisk|diskfree/.test(value)) return "disk" as const;
  if (/snmptraffic|wminetwork|traffic|bandwidth/.test(value)) return "network" as const;
  if (/uptime|lastboot|sysuptime/.test(value)) return "uptime" as const;
  if (/ping/.test(value)) return "ping" as const;
  if (/operatingsystem|windowsversion|osversion/.test(value)) return "os" as const;
  return null;
}

function categoryFromName(name: string) {
  const value = name.toLowerCase();
  if (/\bcpu\b|processor|processorbelasting/.test(value)) return "cpu" as const;
  if (/\bmemory\b|\bram\b|geheugen|physiek geheugen|physical memory/.test(value)) return "memory" as const;
  if (/\bdisk\b|schijf|volume|opslag|drive/.test(value)) return "disk" as const;
  if (/traffic|bandbreedte|netwerk/.test(value)) return "network" as const;
  if (/\bping\b/.test(value)) return "ping" as const;
  if (/uptime|beschikbaarheid/.test(value)) return "uptime" as const;
  if (/operating system|windows version|besturingssysteem/.test(value)) return "os" as const;
  return null;
}

export function sensorCategory(type: string, name: string) {
  const fromType = categoryFromType(type);
  if (fromType) return fromType;
  if (type.trim()) return null;
  return categoryFromName(name);
}

function channelText(sensor: ProbeSensor) {
  return sensor.channels.length > 0 ? sensor.channels : [{ name: sensor.name, lastvalue: sensor.lastvalue }];
}

function measuredAt(sensor: ProbeSensor) {
  const raw = sensor.lastcheck.trim();
  if (!raw || raw === "-") return null;
  const euro = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (euro) {
    const date = new Date(
      Number(euro[3]),
      Number(euro[2]) - 1,
      Number(euro[1]),
      Number(euro[4] ?? 0),
      Number(euro[5] ?? 0),
      Number(euro[6] ?? 0),
    );
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function looksAvailable(name: string) {
  return /\b(available|avail|free|vrij|frei|beschikbaar)\b|percent available/i.test(name);
}

function looksUsed(name: string) {
  return /\b(used|usage|gebruikt)\b|in use/i.test(name);
}

function looksTotal(name: string) {
  return /\b(total|totaal|gesamt)\b/i.test(name);
}

function ipAddress(host: string) {
  const value = host.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return value;
  if (value.includes(":") && /^[0-9a-f:]+$/i.test(value)) return value;
  return null;
}

function worst(statuses: ResourceSensorStatus[]): ResourceSensorStatus {
  const rank: Record<ResourceSensorStatus, number> = {
    down: 0,
    downPartial: 1,
    warning: 2,
    unusual: 3,
    downAcknowledged: 4,
    paused: 5,
    unknown: 6,
    up: 7,
  };
  return statuses.slice().sort((left, right) => rank[left] - rank[right])[0] ?? "unknown";
}

function line(sensor: ProbeSensor): SensorLine {
  return {
    id: sensor.id,
    name: sensor.name,
    status: sensorStatus(sensor.statusCode),
    message: sensor.message.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    lastvalue: sensor.lastvalue.trim(),
    measuredAt: measuredAt(sensor),
    device: sensor.device,
  };
}

function isAlert(status: ResourceSensorStatus) {
  return status === "warning" || status === "down" || status === "downPartial" || status === "unusual" || status === "downAcknowledged";
}

export function normalizeServerResources(
  serverId: string,
  device: ProbeDevice,
  sensors: ProbeSensor[],
  retrievedAt: string,
): ServerResourceDetails | null {
  const own = sensors.filter((sensor) => sensor.device.toLowerCase() === (device?.name || sensors[0]?.device || "").toLowerCase());
  const rows = own.length > 0 ? own : sensors.filter((sensor) => sensor.device.toLowerCase() === serverId.toLowerCase());
  if (!device && rows.length === 0) return null;

  const serverName = device?.name || rows[0]?.device || serverId;
  let cpu: ServerResourceDetails["cpu"] = null;
  let memory: ServerResourceDetails["memory"] = null;
  const disks: DiskResource[] = [];
  const network: NetworkResource[] = [];
  let uptime: string | null = null;
  let lastReboot: string | null = null;
  let ping: string | null = null;
  let responseTime: string | null = null;
  let availabilityStatus: ResourceSensorStatus = "unknown";
  let availabilityAt: string | null = null;
  let operatingSystem: string | null = null;
  const other: SensorLine[] = [];

  for (const sensor of rows) {
    const category = sensorCategory(sensor.type, sensor.name);
    const status = sensorStatus(sensor.statusCode);
    const at = measuredAt(sensor);
    if (category === "cpu" && !cpu) {
      const percentChannel = channelText(sensor).find((channel) => parsePercent(channel.lastvalue) !== null);
      cpu = {
        usedPercent: percentChannel ? parsePercent(percentChannel.lastvalue) : parsePercent(sensor.lastvalue),
        status,
        measuredAt: at,
        sensorName: sensor.name,
      };
    } else if (category === "memory" && !memory) {
      memory = memoryFrom(sensor, status, at);
    } else if (category === "disk") {
      disks.push(diskFrom(sensor, status, at));
    } else if (category === "network") {
      const item = networkFrom(sensor, status, at);
      if (item) network.push(item);
      else other.push(line(sensor));
    } else if (category === "uptime") {
      const boot = channelText(sensor).find((channel) => /last boot|last reboot|laatste herstart/i.test(channel.name));
      if (!uptime) uptime = sensor.lastvalue.trim() || null;
      if (boot?.lastvalue.trim()) lastReboot = boot.lastvalue.trim();
      availabilityStatus = worst([availabilityStatus, status]);
      availabilityAt = availabilityAt ?? at;
    } else if (category === "ping") {
      ping = sensor.lastvalue.trim() || null;
      if (/msec|ms\b/i.test(sensor.lastvalue)) responseTime = sensor.lastvalue.trim();
      availabilityStatus = worst([availabilityStatus, status]);
      availabilityAt = availabilityAt ?? at;
    } else if (category === "os") {
      if (!operatingSystem && sensor.lastvalue.trim()) operatingSystem = sensor.lastvalue.trim();
    } else {
      other.push(line(sensor));
    }
  }

  const alerts = rows.filter((sensor) => isAlert(sensorStatus(sensor.statusCode))).map(line);
  const stamps = rows.map(measuredAt).filter((value): value is string => Boolean(value)).sort();
  const availability =
    uptime || lastReboot || ping || responseTime
      ? { uptime, lastReboot, ping, responseTime, status: availabilityStatus, measuredAt: availabilityAt }
      : null;

  return {
    serverId,
    serverName,
    status: device ? sensorStatus(device.statusCode) : worst(rows.map((sensor) => sensorStatus(sensor.statusCode))),
    statusMessage: device?.message.trim() || null,
    ipAddress: device ? ipAddress(device.host) : null,
    operatingSystem,
    groupName: device?.group.trim() || rows.find((sensor) => sensor.group.trim())?.group.trim() || null,
    lastUpdatedAt: stamps.at(-1) ?? null,
    retrievedAt,
    cpu,
    memory,
    disks,
    network,
    availability,
    alerts,
    otherSensors: other.filter((sensor) => !alerts.some((alert) => alert.id === sensor.id)),
  };
}

function memoryFrom(sensor: ProbeSensor, status: ResourceSensorStatus, at: string | null): ServerResourceDetails["memory"] {
  let usedPercent: number | null = null;
  let freePercent: number | null = null;
  let usedBytes: number | null = null;
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  for (const channel of channelText(sensor)) {
    const percent = parsePercent(channel.lastvalue);
    const bytes = parseBytes(channel.lastvalue);
    if (percent !== null && looksUsed(channel.name) && usedPercent === null) usedPercent = percent;
    else if (percent !== null && looksAvailable(channel.name) && freePercent === null) freePercent = percent;
    else if (percent !== null && usedPercent === null && freePercent === null && !looksTotal(channel.name)) {
      if (/wmimemory|snmpmemory/.test(compact(sensor.type))) freePercent = percent;
      else usedPercent = percent;
    }
    if (bytes !== null && looksTotal(channel.name)) totalBytes = bytes;
    else if (bytes !== null && looksAvailable(channel.name)) freeBytes = bytes;
    else if (bytes !== null && looksUsed(channel.name)) usedBytes = bytes;
  }
  if (usedPercent === null && freePercent !== null) usedPercent = finite(100 - freePercent);
  if (usedBytes === null && totalBytes !== null && freeBytes !== null) usedBytes = finite(totalBytes - freeBytes);
  return { usedPercent, usedBytes, totalBytes, freeBytes, status, measuredAt: at, sensorName: sensor.name };
}

function diskFrom(sensor: ProbeSensor, status: ResourceSensorStatus, at: string | null): DiskResource {
  let usedPercentage: number | null = null;
  let freePercent: number | null = null;
  let usedBytes: number | null = null;
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  for (const channel of channelText(sensor)) {
    const percent = parsePercent(channel.lastvalue);
    const bytes = parseBytes(channel.lastvalue);
    if (percent !== null && looksUsed(channel.name)) usedPercentage = percent;
    else if (percent !== null && looksAvailable(channel.name)) freePercent = percent;
    if (bytes !== null && looksTotal(channel.name)) totalBytes = bytes;
    else if (bytes !== null && looksAvailable(channel.name)) freeBytes = bytes;
    else if (bytes !== null && looksUsed(channel.name)) usedBytes = bytes;
  }
  if (usedPercentage === null && freePercent !== null) usedPercentage = finite(100 - freePercent);
  if (usedPercentage === null) {
    const primary = parsePercent(sensor.lastvalue);
    if (primary !== null && (looksAvailable(sensor.type) || looksAvailable(sensor.name))) usedPercentage = finite(100 - primary);
    else usedPercentage = primary;
  }
  if (usedBytes === null && totalBytes !== null && freeBytes !== null) usedBytes = finite(totalBytes - freeBytes);
  return {
    name: sensor.name,
    usedBytes,
    freeBytes,
    totalBytes,
    usedPercentage,
    status,
    measuredAt: at,
    sourceSensorId: sensor.id,
  };
}

function networkFrom(sensor: ProbeSensor, status: ResourceSensorStatus, at: string | null): NetworkResource | null {
  let inbound: number | null = null;
  let outbound: number | null = null;
  let errors: number | null = null;
  let unit: string | null = null;
  for (const channel of channelText(sensor)) {
    const name = channel.name.toLowerCase();
    const value = parseNumber(channel.lastvalue);
    const channelUnit = rateUnit(channel.lastvalue);
    if (value === null) continue;
    if (/error|discard|fout|verworpen/.test(name)) {
      errors = value;
      continue;
    }
    if (!channelUnit) continue;
    if (unit && unit !== channelUnit) continue;
    unit = channelUnit;
    if (/(\bin\b|inbound|inkomend|traffic in)/.test(name)) inbound = value;
    else if (/(\bout\b|outbound|uitgaand|traffic out)/.test(name)) outbound = value;
  }
  if (inbound === null && outbound === null && errors === null) return null;
  return { name: sensor.name, inbound, outbound, errors, unit, status, measuredAt: at, sourceSensorId: sensor.id };
}

const SECRET = /\b(passhash|password|authorization|api[_-]?key)\b\s*[:=]\s*\S+/gi;

export function redactSecrets(value: string) {
  return value.replace(SECRET, "[verborgen]");
}

export function responseHasSecrets(payload: unknown) {
  const text = JSON.stringify(payload);
  return /passhash\s*[:=]|password\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9]/i.test(text);
}
