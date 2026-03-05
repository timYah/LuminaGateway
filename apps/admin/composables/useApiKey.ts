import { useState } from "#app";
import { computed, watch } from "vue";

export function useApiKey() {
  const key = useState<string | null>("gateway-api-key", () => null);
  const ready = useState<boolean>("gateway-api-key-ready", () => false);

  if (process.client && !ready.value) {
    const stored = globalThis.localStorage?.getItem("lumina-admin-api-key");
    key.value = stored && stored.trim().length > 0 ? stored : null;
    ready.value = true;
  }

  watch(key, (value) => {
    if (!process.client || !ready.value) return;
    if (value && value.trim().length > 0) {
      globalThis.localStorage?.setItem("lumina-admin-api-key", value.trim());
    } else {
      globalThis.localStorage?.removeItem("lumina-admin-api-key");
    }
  });

  const authHeader = computed(() =>
    key.value ? `Bearer ${key.value}` : ""
  );

  const clear = () => {
    key.value = null;
  };

  return {
    key,
    ready,
    authHeader,
    clear,
  };
}
