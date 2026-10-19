export function isDatabaseUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "57P01" ||
    code === "57P03" ||
    code === "08006" ||
    code === "08001" ||
    code === "08000"
  ) {
    return true;
  }
  return /ECONNREFUSED|Connection terminated|terminating connection|could not connect|not yet accepting/i.test(
    message,
  );
}

export function unavailableMessage() {
  return "Service tijdelijk niet beschikbaar.";
}
