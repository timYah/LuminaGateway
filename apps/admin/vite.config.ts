import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

export default defineConfig({
  plugins: [
    vue(),
    ui({
      fonts: false,
      colorMode: false,
      theme: {
        colors: ["primary", "neutral", "success", "info", "warning", "error"],
        transitions: true,
      },
      experimental: {
        componentDetection: true,
      },
      ui: {
        colors: {
          primary: "emerald",
          neutral: "slate",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
