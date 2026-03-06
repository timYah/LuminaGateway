import { computed, ref, unref, watch } from "vue";
import type { Ref } from "vue";

import { useApiKey } from "./useApiKey";

declare const __GATEWAY_BASE_URL__: string;

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

type GatewayFetchOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: QueryParams | Ref<QueryParams>;
  expectJson?: boolean;
};

type UseGatewayFetchOptions = GatewayFetchOptions & {
  immediate?: boolean;
  watch?: boolean;
};

const envBase =
  typeof __GATEWAY_BASE_URL__ === "string" ? __GATEWAY_BASE_URL__.trim() : "";
const apiBase = (
  envBase || import.meta.env.VITE_API_BASE_URL || "/api"
).replace(/\/$/, "");

const buildUrl = (path: string, query?: QueryParams) => {
  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;
  const base = path.startsWith("http") ? "" : apiBase;
  const url = path.startsWith("http") ? path : `${base}${normalizedPath}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
};

export function useGatewayFetch<T>(
  path: string,
  options: UseGatewayFetchOptions = {}
) {
  const { authHeader, ready } = useApiKey();
  const { immediate, watch: watchOption, ...requestOptions } = options;
  const data = ref<T | null>(null);
  const pending = ref(false);
  const error = ref<Error | null>(null);
  const autoExecute = immediate !== false;
  const watchQuery = watchOption !== false;
  const resolvedQuery = computed(() => unref(options.query));

  const execute = async () => {
    if (!ready.value) return;
    pending.value = true;
    error.value = null;
    try {
      data.value = await gatewayFetch<T>(path, {
        ...requestOptions,
        query: resolvedQuery.value,
      });
    } catch (err) {
      error.value = err as Error;
    } finally {
      pending.value = false;
    }
  };

  watch(
    authHeader,
    (value) => {
      if (value && autoExecute) {
        execute();
      }
    },
    { immediate: autoExecute }
  );

  if (watchQuery) {
    watch(resolvedQuery, () => {
      if (authHeader.value && autoExecute) {
        execute();
      }
    });
  }

  return {
    data,
    pending,
    error,
    refresh: execute,
    execute,
  };
}

export async function gatewayFetch<T>(
  path: string,
  options: GatewayFetchOptions = {}
) {
  const { authHeader } = useApiKey();
  const headers = {
    ...options.headers,
  };
  if (authHeader.value) {
    headers.Authorization = authHeader.value;
  }
  const hasBody = options.body !== undefined;
  const body =
    hasBody && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : (options.body as string | undefined);

  if (hasBody && typeof options.body !== "string") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method || (hasBody ? "POST" : "GET"),
    headers,
    body,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      message = payload?.error?.message || payload?.message || message;
    } catch {
      // ignore parsing errors
    }
    throw new Error(message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") || "";
  const expectJson = options.expectJson !== false;
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  if (expectJson) {
    throw new Error("Unexpected response type");
  }

  return (await response.text()) as T;
}
