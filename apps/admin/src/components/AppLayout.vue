<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";

import { localeStorageKey } from "../i18n";

const { locale, t } = useI18n();

const localeOptions = computed(() => [
  { label: t("app.languageOptions.en"), value: "en" },
  { label: t("app.languageOptions.zh"), value: "zh" },
]);

watch(
  locale,
  (value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(localeStorageKey, value);
    document.documentElement.lang = value;
  },
  { immediate: true }
);
</script>

<template>
  <div class="relative z-10">
    <div class="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
      <div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
        <aside class="space-y-6">
          <div class="glass-panel radius-panel p-4 subtle-ring">
            <div class="text-xs uppercase tracking-[0.32em] text-slate-500">
              {{ $t("app.brand") }}
            </div>
            <div class="mt-3 text-2xl font-semibold text-slate-900">
              {{ $t("app.console") }}
            </div>
            <p class="mt-2 text-sm text-slate-600 leading-relaxed">
              {{ $t("app.tagline") }}
            </p>
          </div>
          <nav class="space-y-1">
            <RouterLink
              to="/providers"
              class="block radius-card px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-white/70 hover:text-slate-900 action-press"
              active-class="bg-white text-slate-900 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.4)]"
            >
              {{ $t("nav.providers") }}
            </RouterLink>
            <RouterLink
              to="/usage"
              class="block radius-card px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-white/70 hover:text-slate-900 action-press"
              active-class="bg-white text-slate-900 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.4)]"
            >
              {{ $t("nav.usage") }}
            </RouterLink>
          </nav>
          <div class="pt-4 border-t border-slate-200/60 space-y-2">
            <div class="text-xs uppercase tracking-[0.32em] text-slate-500">
              {{ $t("app.language") }}
            </div>
            <USelect v-model="locale" :options="localeOptions" />
          </div>
        </aside>

        <main class="space-y-6">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
