import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.VITE_API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Proxying keeps the browser same-origin in dev, so nothing breaks if the
    // reviewer's browser is strict about CORS.
    //
    // Keys starting with ^ are treated as regular expressions by Vite. They are
    // anchored deliberately: a plain "/api" prefix rule also captures the
    // client-side route /api-health, which would forward a page navigation to the
    // backend and 404. "^/api/" only matches real API calls.
    proxy: {
      "^/api/": { target, changeOrigin: true },
      "^/health$": { target, changeOrigin: true },
    },
  },
});
