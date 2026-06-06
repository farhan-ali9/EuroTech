import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: isDev ? [react(), basicSsl()] : [react()],
  server: {
    port: 3001,
    host: "0.0.0.0",
    https: true,
    proxy: {
      // WebSocket — must be listed first with ws: true
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
      // REST endpoints
      "/report":      { target: "http://localhost:8000", changeOrigin: true },
      "/hazards":     { target: "http://localhost:8000", changeOrigin: true },
      "/weather":     { target: "http://localhost:8000", changeOrigin: true },
      "/stats":       { target: "http://localhost:8000", changeOrigin: true },
      "/government":  { target: "http://localhost:8000", changeOrigin: true },
      "/incidents":   { target: "http://localhost:8000", changeOrigin: true },
      "/hazards":     { target: "http://localhost:8000", changeOrigin: true },
      "/health":      { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
