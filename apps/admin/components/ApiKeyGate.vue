<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { useApiKey } from "~/composables/useApiKey";

const { key, ready, clear } = useApiKey();
const draft = ref("");
const error = ref("");

watchEffect(() => {
  if (!ready.value) return;
  if (key.value && draft.value !== key.value) {
    draft.value = key.value;
  }
});

const hasKey = computed(() => Boolean(key.value && key.value.trim().length > 0));

const saveKey = () => {
  const value = draft.value.trim();
  if (!value) {
    error.value = "API key is required.";
    return;
  }
  error.value = "";
  key.value = value;
};
</script>

<template>
  <div>
    <div v-if="!ready" class="space-y-4">
      <div class="h-6 w-56 rounded-xl skeleton"></div>
      <div class="h-32 rounded-2xl skeleton"></div>
      <div class="h-24 rounded-2xl skeleton"></div>
    </div>

    <div
      v-else-if="!hasKey"
      class="max-w-[560px] surface rounded-3xl p-8 space-y-6"
    >
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
          Secure Access
        </div>
        <h1 class="mt-3 text-3xl font-semibold text-slate-900">
          Connect the gateway
        </h1>
        <p class="mt-3 text-base text-slate-600 leading-relaxed">
          Enter the gateway API key to unlock provider and usage management.
          The key is stored locally in this browser.
        </p>
      </div>

      <div class="space-y-4">
        <UFormGroup
          label="Gateway API key"
          help="Paste the value of GATEWAY_API_KEY from the backend environment."
        >
          <UInput v-model="draft" type="password" placeholder="sk-live-..." />
        </UFormGroup>
        <p v-if="error" class="text-sm text-rose-600">
          {{ error }}
        </p>
      </div>

      <div class="flex items-center justify-between">
        <UButton class="action-press" color="primary" @click="saveKey">
          Save key
        </UButton>
        <span class="text-xs text-slate-500">
          Stored in local storage.
        </span>
      </div>
    </div>

    <div v-else class="space-y-6">
      <div class="glass-panel rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            Session
          </div>
          <div class="text-sm font-medium text-slate-700">
            API key stored for this browser.
          </div>
        </div>
        <UButton class="action-press" variant="outline" @click="clear">
          Clear key
        </UButton>
      </div>
      <slot />
    </div>
  </div>
</template>
