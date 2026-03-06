import { computed, ref, watch } from "vue";

const storageKey = "lumina-admin-api-key";
const key = ref<string | null>(null);
const ready = ref(false);
let initialized = false;

const init = () => {
  if (initialized) return;
  initialized = true;
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
    key.value = null;
  };

  return {
    key,
    ready,
    authHeader,
    clear,
  };
}
