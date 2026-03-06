import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
  const env = loadEnv(mode, envDir, "");
  const gatewayPort = env.PORT || "3000";
  const gatewayApiKey = env.VITE_GATEWAY_API_KEY || env.GATEWAY_API_KEY || "";
  const gatewayBaseUrl = env.VITE_API_BASE_URL || env.GATEWAY_BASE_URL || "";
  const normalizeGatewayTarget = (target: string) => {
    try {
      const url = new URL(target);
      if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
      }
      return url.toString().replace(/\/$/, "");
    } catch {
      return target;
    }
  };
  const gatewayTarget = normalizeGatewayTarget(
    env.GATEWAY_BASE_URL || `http://localhost:${gatewayPort}`
  );

  return {
    envDir,
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
    define: {
      __GATEWAY_API_KEY__: JSON.stringify(gatewayApiKey),
      __GATEWAY_BASE_URL__: JSON.stringify(gatewayBaseUrl),
    },
    server: {
      port: 3001,
      proxy: {
        "/api": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
