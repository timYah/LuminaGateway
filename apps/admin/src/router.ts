import { createRouter, createWebHistory } from "vue-router";

import ProvidersPage from "./pages/ProvidersPage.vue";
import UsagePage from "./pages/UsagePage.vue";
import ModelPrioritiesPage from "./pages/ModelPrioritiesPage.vue";
import RequestsPage from "./pages/RequestsPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/providers" },
    { path: "/admin", redirect: "/admin/providers" },
    { path: "/providers", alias: ["/admin/providers"], component: ProvidersPage },
    {
      path: "/model-priorities",
      alias: ["/admin/model-priorities"],
      component: ModelPrioritiesPage,
    },
    { path: "/usage", alias: ["/admin/usage"], component: UsagePage },
    { path: "/requests", alias: ["/admin/requests"], component: RequestsPage },
  ],
});

export default router;
