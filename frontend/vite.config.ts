import fs from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["VITE_", "API_PROXY_", "TLS_"]);
  const certFile = env.TLS_CERT_FILE || process.env.TLS_CERT_FILE;
  const keyFile = env.TLS_KEY_FILE || process.env.TLS_KEY_FILE;
  const https =
    certFile && keyFile
      ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
      : undefined;
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      https,
      allowedHosts: allowedHosts.length ? allowedHosts : true,
      fs: { allow: [".."] },
      watch: { usePolling: env.VITE_USE_POLLING === "true" },
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://localhost:8000",
          secure: false,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      https,
    },
  };
});
