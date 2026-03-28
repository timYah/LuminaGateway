<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import { localeStorageKey } from "../i18n";

const { locale, t } = useI18n();
const route = useRoute();
const router = useRouter();
const navBaseClass =
  "block radius-card px-3 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-950 action-press";
const navActiveClass =
  "bg-white text-slate-950 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)]";

const localeOptions = computed(() => [
  { label: t("app.languageOptions.en"), value: "en" },
  { label: t("app.languageOptions.zh"), value: "zh" },
]);

const navPrefix = computed(() =>
  route.fullPath.startsWith("/admin") ? "/admin" : ""
);
const providersHref = computed(() => `${navPrefix.value}/providers`);
const modelPrioritiesHref = computed(() => `${navPrefix.value}/model-priorities`);
const usageHref = computed(() => `${navPrefix.value}/usage`);
const requestsHref = computed(() => `${navPrefix.value}/requests`);
const isProviders = computed(() => route.path === "/providers");
const isModelPriorities = computed(() => route.path === "/model-priorities");
const isUsage = computed(() => route.path === "/usage");
const isRequests = computed(() => route.path === "/requests");
const goProviders = () => {
  if (isProviders.value) return;
  router.push(providersHref.value);
};
const goModelPriorities = () => {
  if (isModelPriorities.value) return;
  router.push(modelPrioritiesHref.value);
};
const goUsage = () => {
  if (isUsage.value) return;
  router.push(usageHref.value);
};
const goRequests = () => {
  if (isRequests.value) return;
  router.push(requestsHref.value);
};

watch(
  locale,
  (value) => {
    const globalWindow =
      typeof globalThis !== "undefined"
        ? (globalThis as {
            localStorage?: Storage;
            document?: Document;
          })
        : undefined;
    if (!globalWindow?.localStorage || !globalWindow.document) return;
    globalWindow.localStorage.setItem(localeStorageKey, value);
    globalWindow.document.documentElement.lang = value;
  },
  { immediate: true }
);
</script>

<template>
  <div class="relative z-10">
    <div class="mx-auto max-w-[1480px] px-4 py-4 md:px-6 md:py-6 xl:px-10">
      <div class="grid gap-5 lg:grid-cols-[208px_minmax(0,1fr)] xl:gap-8">
        <aside class="lg:sticky lg:top-6 lg:self-start">
          <div class="space-y-4">
            <div class="glass-panel radius-panel p-4 subtle-ring md:p-5">
              <div class="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                {{ $t("app.brand") }}
              </div>
              <div class="mt-3 text-xl font-semibold tracking-tight text-slate-900">
                {{ $t("app.console") }}
              </div>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                {{ $t("app.tagline") }}
              </p>
            </div>

            <div class="surface radius-panel p-2.5">
              <nav class="space-y-1">
                <button
                  type="button"
                  :class="[navBaseClass, isProviders ? navActiveClass : '']"
                  @click="goProviders"
                >
                  {{ $t("nav.providers") }}
                </button>
                <button
                  type="button"
                  :class="[navBaseClass, isModelPriorities ? navActiveClass : '']"
                  @click="goModelPriorities"
                >
                  {{ $t("nav.modelPriorities") }}
                </button>
                <button
                  type="button"
                  :class="[navBaseClass, isUsage ? navActiveClass : '']"
                  @click="goUsage"
                >
                  {{ $t("nav.usage") }}
                </button>
                <button
                  type="button"
                  :class="[navBaseClass, isRequests ? navActiveClass : '']"
                  @click="goRequests"
                >
                  {{ $t("nav.requests") }}
                </button>
              </nav>
            </div>

            <div class="surface radius-panel p-3.5">
              <div class="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                {{ $t("app.language") }}
              </div>
              <div class="mt-3">
                <USelect v-model="locale" :items="localeOptions" />
              </div>
            </div>
          </div>
        </aside>

        <main class="min-w-0 space-y-5 md:space-y-6">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
