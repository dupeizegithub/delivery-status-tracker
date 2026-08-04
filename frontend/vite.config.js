import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to the backend, so the browser only ever talks
// same-origin. Inside docker-compose the target is the api service; when
// running `npm run dev` directly on the host it falls back to localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
