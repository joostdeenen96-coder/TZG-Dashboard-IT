import { useEffect, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IctDashboardPage } from "./pages/IctDashboardPage";

function currentRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/admin") return "admin" as const;
  if (path === "/ict") return "ict" as const;
  return "dashboard" as const;
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const sync = () => setRoute(currentRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (route === "admin") return <AdminPage />;
  if (route === "ict") return <IctDashboardPage />;
  return <DashboardPage />;
}
