import { useEffect, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { DisplayPage } from "./pages/DisplayPage";
import { PlayerPage } from "./pages/PlayerPage";
import { resolveRoute, type AppRoute } from "./routing";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute(window.location.pathname));

  useEffect(() => {
    const sync = () => setRoute(resolveRoute(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (route.kind === "admin") return <AdminPage />;
  if (route.kind === "player") return <PlayerPage token={route.token} />;
  return <DisplayPage slug={route.slug} />;
}
