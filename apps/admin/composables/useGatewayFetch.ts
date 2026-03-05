/* global $fetch */
import { useFetch } from "#app";
import type { UseFetchOptions } from "nuxt/app";
import { computed, watch } from "vue";

import { useApiKey } from "./useApiKey";

export function useGatewayFetch<T>(
  path: string,
  options: UseFetchOptions<T> = {}
) {
  const { authHeader } = useApiKey();
  const autoExecute = options.immediate !== false;
  const headers = computed(() => ({
    ...((options.headers as Record<string, string>) || {}),
    Authorization: authHeader.value,
  }));

  const state = useFetch<T>(`/api${path}`, {
    ...options,
    immediate: false,
    headers,
  });

  watch(
    authHeader,
    (value) => {
      if (value && autoExecute) {
        state.execute();
      }
    },
    { immediate: autoExecute }
  );

  return state;
}

export async function gatewayFetch<T>(
  path: string,
  options: Omit<UseFetchOptions<T>, "headers"> & { method?: string } = {}
) {
  const { authHeader } = useApiKey();
  return await $fetch<T>(`/api${path}`, {
    ...options,
    headers: {
      ...((options.headers as Record<string, string>) || {}),
      Authorization: authHeader.value,
    },
  });
}
