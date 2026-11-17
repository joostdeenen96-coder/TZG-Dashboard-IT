export type ServerResourceStatus =
  | "up"
  | "warning"
  | "down"
  | "unusual"
  | "downPartial"
  | "downAcknowledged"
  | "paused"
  | "unknown";

export type ServerDisk = {
  name: string;
  usedBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
  usedPercentage: number | null;
  status: ServerResourceStatus;
  measuredAt: string | null;
  sourceSensorId: string;
};

export type ServerNetwork = {
  name: string;
  inbound: number | null;
  outbound: number | null;
  errors: number | null;
  unit: string | null;
  status: ServerResourceStatus;
  measuredAt: string | null;
  sourceSensorId: string;
};

export type ServerSensorLine = {
  id: string;
  name: string;
  status: ServerResourceStatus;
  message: string;
  lastvalue: string;
  measuredAt: string | null;
  device: string;
};

export type ServerResourceDetails = {
  serverId: string;
  serverName: string;
  status: ServerResourceStatus;
  statusMessage: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  groupName: string | null;
  lastUpdatedAt: string | null;
  retrievedAt: string;
  cpu: { usedPercent: number | null; status: ServerResourceStatus; measuredAt: string | null; sensorName: string | null } | null;
  memory: {
    usedPercent: number | null;
    usedBytes: number | null;
    totalBytes: number | null;
    freeBytes: number | null;
    status: ServerResourceStatus;
    measuredAt: string | null;
    sensorName: string | null;
  } | null;
  disks: ServerDisk[];
  network: ServerNetwork[];
  availability: {
    uptime: string | null;
    lastReboot: string | null;
    ping: string | null;
    responseTime: string | null;
    status: ServerResourceStatus;
    measuredAt: string | null;
  } | null;
  alerts: ServerSensorLine[];
  otherSensors: ServerSensorLine[];
};

export type ServerResourceCacheStatus = "hit" | "miss" | "stale" | "unavailable";

export type ServerResourceResponse = {
  source: "PRTG";
  retrievedAt: string | null;
  cacheStatus: ServerResourceCacheStatus;
  staleReason: string | null;
  error: string | null;
  server: ServerResourceDetails | null;
};
