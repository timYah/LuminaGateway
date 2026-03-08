import { createRouter, createWebHistory } from "vue-router";

const normalizeBase = (value: string) => {
  if (!value || value === "/") return "/";
  return value.endsWith("/") ? value : `${value}/`;
};

const resolveBase = () => {
  const envBase = import.meta.env.BASE_URL;
  if (envBase && envBase !== "/") {
    return normalizeBase(envBase);
  }
  if (typeof globalThis === "undefined") {
    return "/";
  }
  const path =
    (globalThis as { location?: { pathname?: string } }).location?.pathname ?? "/";
  const knownRoutes = ["/providers", "/usage"];
  for (const route of knownRoutes) {
    if (path.endsWith(route)) {
      const base = path.slice(0, -route.length);
      return normalizeBase(base);
    }
  }
  return normalizeBase(path);
};

import ProvidersPage from "./pages/ProvidersPage.vue";
import UsagePage from "./pages/UsagePage.vue";

const router = createRouter({
  history: createWebHistory(resolveBase()),
  routes: [
    { path: "/", redirect: "/providers" },
    { path: "/providers", component: ProvidersPage },
    { path: "/usage", component: UsagePage },
  ],
});

export default router;
