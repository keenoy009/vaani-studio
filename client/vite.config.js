import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, the browser talks to Vite (5173); /api calls are forwarded to the Express backend (3001).
// VITE_PORT, API_TARGET and VITE_CACHE_DIR exist so a second copy can be pointed at a test server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite", // a second dev server needs its own cache, or the two break each other
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:3001",
        // Tell the API which site the visitor is really on, so its cross-site check accepts the page's own requests.
        configure: (proxy) => proxy.on("proxyReq", (proxyReq, req) => { if (req.headers.host) proxyReq.setHeader("X-Forwarded-Host", req.headers.host); }),
      },
    },
  },
});
