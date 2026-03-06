import { computed, ref, watch } from "vue";

declare const __GATEWAY_API_KEY__: string;

const storageKey = "lumina-admin-api-key";
const key = ref<string | null>(null);
const ready = ref(false);
let initialized = false;
const envKey =
  typeof __GATEWAY_API_KEY__ === "string" ? __GATEWAY_API_KEY__.trim() : "";
const fromEnv = envKey.length > 0;

const init = () => {
  if (initialized) return;
  initialized = true;
  if (fromEnv) {
    key.value = envKey;
    ready.value = true;
    return;
  }
  if (typeof window !== "undefined") {
    const stored = globalThis.localStorage?.getItem(storageKey);
    key.value = stored && stored.trim().length > 0 ? stored : null;
    ready.value = true;
  }

  watch(key, (value) => {
    if (typeof window === "undefined" || !ready.value) return;
    if (value && value.trim().length > 0) {
      globalThis.localStorage?.setItem(storageKey, value.trim());
    } else {
      globalThis.localStorage?.removeItem(storageKey);
    }
  });
};

export function useApiKey() {
  init();

  const authHeader = computed(() => (key.value ? `Bearer ${key.value}` : ""));

  const clear = () => {
    if (fromEnv) return;
    key.value = null;
  };

  return {
    key,
    ready,
    authHeader,
    clear,
    fromEnv,
  };
}
