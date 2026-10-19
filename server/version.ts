import { readAppVersion } from "./appPaths.js";
import { appConfig } from "./config.js";

export function versionInfo() {
  const config = (() => {
    try {
      return appConfig();
    } catch {
      return null;
    }
  })();
  return {
    version: process.env.APP_VERSION?.trim() || config?.appVersion || readAppVersion(),
    commit: process.env.BUILD_COMMIT?.trim() || config?.buildCommit || "unknown",
    buildDate: process.env.BUILD_DATE?.trim() || config?.buildDate || "",
    environment: process.env.NODE_ENV?.trim() || "development",
  };
}
