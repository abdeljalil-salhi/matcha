import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", ["VITE_", "API_PROXY_"]);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: [".."] },
      watch: { usePolling: env.VITE_USE_POLLING === "true" },
      proxy: {
        "/api": { target: env.API_PROXY_TARGET || "http://localhost:8000" },
      },
    },
    preview: {
      port: 5173,
      strictPort: true,
    },
  };
});
