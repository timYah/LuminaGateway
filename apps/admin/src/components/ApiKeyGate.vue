<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";

import { useApiKey } from "../composables/useApiKey";
import UFormGroup from "./UFormGroup.vue";

const { t } = useI18n();
const { key, ready, clear } = useApiKey();
const draft = ref("");
const error = ref("");
const baseUrlKey = "lumina-admin-api-base";
const baseUrlDraft = ref("");

const normalizeKey = (raw: string) => {
  let value = raw.trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower.startsWith("authorization:")) {
    value = value.slice("authorization:".length).trim();
  }
  if (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice("bearer ".length).trim();
  }

  const match = value.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/i);
  if (match && match[1].toUpperCase() === "GATEWAY_API_KEY") {
    value = match[2].trim();
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
};

const normalizeBaseUrl = (raw: string) => {
  let value = raw.trim();
  if (!value) return "";
  return value.replace(/\/$/, "");
};

watchEffect(() => {
  if (!ready.value) return;
  if (key.value && draft.value !== key.value) {
    draft.value = key.value;
  }
  if (!baseUrlDraft.value) {
    const stored = globalThis.localStorage?.getItem(baseUrlKey) || "";
    baseUrlDraft.value = stored;
  }
});

const hasKey = computed(() => Boolean(key.value && key.value.trim().length > 0));

const saveKey = () => {
  const value = normalizeKey(draft.value);
  const baseUrl = normalizeBaseUrl(baseUrlDraft.value);
  if (!value) {
    error.value = t("apiKey.required");
    return;
  }
  if (baseUrl) {
    globalThis.localStorage?.setItem(baseUrlKey, baseUrl);
  }
  error.value = "";
  key.value = value;
};

const saveBaseUrl = () => {
  const baseUrl = normalizeBaseUrl(baseUrlDraft.value);
  if (!baseUrl) {
    globalThis.localStorage?.removeItem(baseUrlKey);
    return;
  }
  globalThis.localStorage?.setItem(baseUrlKey, baseUrl);
};
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="hasKey"
      class="glass-panel radius-card px-4 py-3 flex items-center justify-between"
    >
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
          {{ $t("apiKey.session") }}
        </div>
        <div class="text-sm font-medium text-slate-700">
          {{ $t("apiKey.stored") }}
        </div>
      </div>
      <UButton class="action-press" variant="outline" @click="clear">
        {{ $t("apiKey.clear") }}
      </UButton>
    </div>

    <div v-if="hasKey" class="glass-panel radius-card px-4 py-3 space-y-3">
      <UFormGroup :label="$t('apiKey.baseUrl')" :help="$t('apiKey.baseUrlHelp')">
        <UInput
          v-model="baseUrlDraft"
          :placeholder="$t('apiKey.baseUrlPlaceholder')"
        />
      </UFormGroup>
      <div class="flex items-center justify-between">
        <UButton class="action-press" variant="outline" @click="saveBaseUrl">
          {{ $t("apiKey.saveBaseUrl") }}
        </UButton>
        <span class="text-xs text-slate-500">
          {{ $t("apiKey.baseUrlHint") }}
        </span>
      </div>
    </div>

    <div class="relative">
      <div
        class="transition-all duration-300"
        :class="
          hasKey
            ? 'opacity-100'
            : 'opacity-30 blur-[1px] pointer-events-none select-none'
        "
      >
        <slot />
      </div>

      <div
        v-if="!ready"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="w-full max-w-[560px] space-y-4">
          <div class="h-6 w-56 radius-soft skeleton"></div>
          <div class="h-32 radius-soft skeleton"></div>
          <div class="h-24 radius-soft skeleton"></div>
        </div>
      </div>

      <div
        v-else-if="!hasKey"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="max-w-[560px] surface radius-panel p-6 md:p-7 space-y-5">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("apiKey.secureAccess") }}
            </div>
            <h1 class="mt-3 text-3xl font-semibold text-slate-900">
              {{ $t("apiKey.connect") }}
            </h1>
            <p class="mt-3 text-base text-slate-600 leading-relaxed">
              {{ $t("apiKey.description") }}
            </p>
          </div>

          <div class="space-y-3">
            <UFormGroup
              :label="$t('apiKey.label')"
              :help="$t('apiKey.help')"
            >
              <UInput
                v-model="draft"
                type="password"
                :placeholder="$t('providers.form.placeholder.apiKey')"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('apiKey.baseUrl')"
              :help="$t('apiKey.baseUrlHelp')"
            >
              <UInput
                v-model="baseUrlDraft"
                :placeholder="$t('apiKey.baseUrlPlaceholder')"
              />
            </UFormGroup>
            <p v-if="error" class="text-sm text-rose-600">
              {{ error }}
            </p>
          </div>

          <div class="flex items-center justify-between">
            <UButton class="action-press" color="primary" @click="saveKey">
              {{ $t("apiKey.save") }}
            </UButton>
            <span class="text-xs text-slate-500">
              {{ $t("apiKey.localStorage") }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
