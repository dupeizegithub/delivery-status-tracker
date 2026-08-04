import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to the backend, so the browser only ever talks
// same-origin. Inside docker-compose the target is the api service; when
// running `npm run dev` directly on the host it falls back to localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Polling is more reliable than inotify for bind-mounted sources under
    // Docker Desktop (macOS/Windows); slightly slower, much more consistent.
    watch: {
      usePolling: true,
      interval: 500,
    },
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
