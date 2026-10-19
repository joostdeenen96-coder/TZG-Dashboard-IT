/** Zelfde contract als src/routing.ts voor de legacy TV-routes. */
export function legacyDashboardSlug(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/" || path === "/display/planning") return "planning";
  if (path === "/ict" || path === "/display/ict") return "ict";
  return null;
}
