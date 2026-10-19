function stamp() {
  return new Date().toISOString();
}

function sanitize(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/client[_-]?secret["'\s:=]+[^\s"',}]+/gi, "client_secret=[redacted]")
    .replace(/passhash["'\s:=]+[^\s"',}]+/gi, "passhash=[redacted]")
    .replace(/password["'\s:=]+[^\s"',}]+/gi, "password=[redacted]")
    .replace(/GRAPH_CLIENT_SECRET=\S+/gi, "GRAPH_CLIENT_SECRET=[redacted]")
    .replace(/PRTG_PASSWORD=\S+/gi, "PRTG_PASSWORD=[redacted]")
    .replace(/PRTG_PASSHASH=\S+/gi, "PRTG_PASSHASH=[redacted]");
}

export function logInfo(message: string) {
  console.log(`[teunesen-tv] ${stamp()} info ${sanitize(message)}`);
}

export function logWarn(message: string) {
  console.warn(`[teunesen-tv] ${stamp()} warn ${sanitize(message)}`);
}

export function logError(message: string) {
  console.error(`[teunesen-tv] ${stamp()} error ${sanitize(message)}`);
}
