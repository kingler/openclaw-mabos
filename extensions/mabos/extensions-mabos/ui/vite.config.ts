import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/mabos/dashboard/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/mabos/api": {
        target: "http://localhost:18789",
        changeOrigin: true,
        headers: {
          Authorization: "Bearer c917a097294acad9e5f654e08eb935fbc39f25b197161fd7a29ffb2aa4eba244",
        },
      },
      "/mabos/governance": {
        target: "http://localhost:18789",
        changeOrigin: true,
        headers: {
          Authorization: "Bearer c917a097294acad9e5f654e08eb935fbc39f25b197161fd7a29ffb2aa4eba244",
        },
      },
    },
  },
});
