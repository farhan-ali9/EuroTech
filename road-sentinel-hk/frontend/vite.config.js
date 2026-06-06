import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS is required so the phone's motion/GPS sensors work (secure context).
// API calls use relative paths and are proxied to the backend on :8000.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    https: true,
    proxy: {
      "/report": { target: "http://localhost:8000", changeOrigin: true },
      "/hazards": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
