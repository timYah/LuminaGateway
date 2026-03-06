import { createRouter, createWebHistory } from "vue-router";

import ProvidersPage from "./pages/ProvidersPage.vue";
import UsagePage from "./pages/UsagePage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/providers" },
    { path: "/providers", component: ProvidersPage },
    { path: "/usage", component: UsagePage },
  ],
});

export default router;
