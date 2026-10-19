import { useEffect, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DisplayPage } from "./pages/DisplayPage";
import { IctDashboardPage } from "./pages/IctDashboardPage";

type Route =
  | { kind: "admin" }
  | { kind: "ict" }
  | { kind: "dashboard" }
  | { kind: "display"; slug: string };

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/admin") return { kind: "admin" };
  if (path === "/ict") return { kind: "ict" };
  const display = path.match(/^\/display\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
  if (display?.[1]) return { kind: "display", slug: display[1].toLowerCase() };
  return { kind: "dashboard" };
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const sync = () => setRoute(currentRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (route.kind === "admin") return <AdminPage />;
  if (route.kind === "ict") return <IctDashboardPage />;
  if (route.kind === "display") return <DisplayPage slug={route.slug} />;
  return <DashboardPage />;
}
