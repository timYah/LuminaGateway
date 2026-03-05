import { $fetch, useFetch } from "#app";
import type { UseFetchOptions } from "nuxt/app";
import { computed } from "vue";

import { useApiKey } from "./useApiKey";

export function useGatewayFetch<T>(
  path: string,
  options: UseFetchOptions<T> = {}
) {
  const { authHeader } = useApiKey();
  const headers = computed(() => ({
    ...((options.headers as Record<string, string>) || {}),
    Authorization: authHeader.value,
  }));

  return useFetch<T>(`/api${path}`, {
    ...options,
    headers,
  });
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
