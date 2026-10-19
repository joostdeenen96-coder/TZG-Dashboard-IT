export type AppRoute =
  | { kind: "admin" }
  | { kind: "player"; token: string }
  | { kind: "display"; slug: string; legacy: boolean };

export function resolveRoute(pathname: string): AppRoute {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/admin") return { kind: "admin" };
  const player = path.match(/^\/player\/(tzg_[A-Za-z0-9_-]+)$/);
  if (player?.[1]) return { kind: "player", token: player[1] };
  if (path === "/" || path === "/display/planning") return { kind: "display", slug: "planning", legacy: true };
  if (path === "/ict" || path === "/display/ict") return { kind: "display", slug: "ict", legacy: true };
  const display = path.match(/^\/display\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
  if (display?.[1]) return { kind: "display", slug: display[1].toLowerCase(), legacy: true };
  return { kind: "display", slug: "planning", legacy: true };
}
