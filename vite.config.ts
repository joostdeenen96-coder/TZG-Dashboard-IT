import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function agendaDevRoute(): Plugin {
  const handle: Plugin["configureServer"] = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (path !== "/api/agenda" && path !== "/api/wij-agenda") return next();
      try {
        const mod = (await server.ssrLoadModule("/server/services/agendaService.ts")) as {
          getWijAgenda: () => Promise<unknown>;
        };
        const body = JSON.stringify(await mod.getWijAgenda());
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Agenda-Via", "vite");
        if (req.method === "HEAD") res.end();
        else res.end(body);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agenda niet beschikbaar.";
        console.error(`[teunesen-tv] agenda via vite mislukt (${message}).`);
        next();
      }
    });
  };
  return {
    name: "agenda-dev-route",
    configureServer: handle,
  };
}

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:43124",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [agendaDevRoute(), tailwindcss(), react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
    proxy: apiProxy,
  },
});
