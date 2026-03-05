/* eslint-disable no-undef */
export default defineNuxtConfig({
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  devServer: {
    port: 3001,
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
    },
  },
  ui: {
    fonts: false,
    colorMode: false,
    theme: {
      colors: ["primary", "neutral", "success", "info", "warning", "error"],
      transitions: true,
    },
    experimental: {
      componentDetection: true,
    },
  },
});
