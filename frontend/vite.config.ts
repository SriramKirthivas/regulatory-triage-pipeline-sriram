import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  // Lets `npm run build && npm run preview` exercise the production bundle
  // against a local API, the same shape Vercel serves in production.
  preview: {
    port: 4173,
    proxy: { "/api": "http://localhost:8787" },
  },
});
