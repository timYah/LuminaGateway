<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { gatewayFetch, useGatewayFetch } from "../composables/useGatewayFetch";
import { useApiKey } from "../composables/useApiKey";
import PageHeader from "../components/PageHeader.vue";
import UFormGroup from "../components/UFormGroup.vue";

type Provider = {
  id: number;
  name: string;
};

type RequestLogRow = {
  id: number;
  providerId: number;
  modelSlug: string;
  result: "success" | "failure";
  errorType?: string | null;
  latencyMs?: number | null;
  createdAt: string;
};

type RequestLogResponse = {
  requests: RequestLogRow[];
  limit: number;
  offset: number;
};

type ActiveRequestAttempt = {
  providerId: number;
  providerName: string;
  status: "active" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  elapsedMs: number;
  errorType?: string | null;
};

type ActiveRequestRow = {
  requestId: string;
  path: string;
  modelSlug: string;
  startedAt: string;
  elapsedMs: number;
  currentProviderId?: number | null;
  currentProviderName?: string | null;
  attempts: ActiveRequestAttempt[];
};

type ActiveRequestResponse = {
  activeRequests: ActiveRequestRow[];
};

const { t } = useI18n();
const ALL_PROVIDERS = "all";
const ALL_ERROR_TYPES = "all";
const DEFAULT_LIMIT = 10;
const pageSizeOptions = [
  { label: "10", value: "10" },
  { label: "20", value: "20" },
  { label: "50", value: "50" },
  { label: "100", value: "100" },
];
const providers = ref<Provider[]>([]);
const providerOptions = computed(() => [
  { label: t("common.allProviders"), value: ALL_PROVIDERS },
  ...providers.value.map((provider) => ({
    label: provider.name,
    value: provider.id.toString(),
  })),
]);

const requestFilters = reactive({
  providerId: ALL_PROVIDERS,
  modelSlug: "",
  startDate: "",
  endDate: "",
  errorType: ALL_ERROR_TYPES,
  limit: DEFAULT_LIMIT.toString(),
  offset: "0",
});
const requestFiltersCollapsed = ref(true);

const normalizeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requestQuery = computed(() => {
  const payload: Record<string, string | number> = {
    limit: normalizeNumber(requestFilters.limit, DEFAULT_LIMIT),
    offset: normalizeNumber(requestFilters.offset, 0),
  };
  if (requestFilters.providerId !== ALL_PROVIDERS) {
    payload.providerId = requestFilters.providerId;
  }
  if (requestFilters.modelSlug.trim()) {
    payload.modelSlug = requestFilters.modelSlug.trim();
  }
  if (requestFilters.startDate) payload.startDate = requestFilters.startDate;
  if (requestFilters.endDate) payload.endDate = requestFilters.endDate;
  if (requestFilters.errorType !== ALL_ERROR_TYPES) {
    payload.errorType = requestFilters.errorType;
  }
  return payload;
});

const {
  data: requestData,
  pending: requestPending,
  error: requestError,
  execute: executeRequests,
} = useGatewayFetch<RequestLogResponse>("/admin/request-logs", {
  query: requestQuery,
  immediate: false,
  watch: false,
});

const {
  data: activeRequestData,
  pending: activeRequestPending,
  error: activeRequestError,
  execute: executeActiveRequests,
} = useGatewayFetch<ActiveRequestResponse>("/admin/active-requests", {
  immediate: false,
  watch: false,
});

const { authHeader } = useApiKey();

const requestRows = computed(() => requestData.value?.requests ?? []);
const requestEmpty = computed(
  () => !requestPending.value && requestRows.value.length === 0
);
const activeRequestRows = computed(() => activeRequestData.value?.activeRequests ?? []);
const activeRequestEmpty = computed(
  () => !activeRequestPending.value && activeRequestRows.value.length === 0
);

const providerNameMap = computed(() => {
  return new Map(providers.value.map((provider) => [provider.id, provider.name]));
});

const requestErrorTypeOptions = computed(() => [
  { label: t("usage.requests.errorType.all"), value: ALL_ERROR_TYPES },
  { label: t("usage.requests.errorType.quota"), value: "quota" },
  { label: t("usage.requests.errorType.rate_limit"), value: "rate_limit" },
  { label: t("usage.requests.errorType.server"), value: "server" },
  { label: t("usage.requests.errorType.auth"), value: "auth" },
  { label: t("usage.requests.errorType.model_not_found"), value: "model_not_found" },
  { label: t("usage.requests.errorType.network"), value: "network" },
  { label: t("usage.requests.errorType.unknown"), value: "unknown" },
]);

const fetchProviders = async () => {
  try {
    const response = await gatewayFetch<{ providers: Provider[] }>(
      "/admin/providers"
    );
    providers.value = response.providers;
  } catch {
    providers.value = [];
  }
};

const applyRequestFilters = async () => {
  requestFilters.offset = "0";
  await executeRequests();
};

const updateRequestLimit = async () => {
  requestFilters.offset = "0";
  await executeRequests();
};

const nextRequestPage = async () => {
  const limit = normalizeNumber(requestFilters.limit, DEFAULT_LIMIT);
  const offset = normalizeNumber(requestFilters.offset, 0) + limit;
  requestFilters.offset = offset.toString();
  await executeRequests();
};

const prevRequestPage = async () => {
  const limit = normalizeNumber(requestFilters.limit, DEFAULT_LIMIT);
  const offset = Math.max(0, normalizeNumber(requestFilters.offset, 0) - limit);
  requestFilters.offset = offset.toString();
  await executeRequests();
};

const requestCanNext = computed(
  () =>
    requestRows.value.length === normalizeNumber(requestFilters.limit, DEFAULT_LIMIT)
);
const requestCanPrev = computed(
  () => normalizeNumber(requestFilters.offset, 0) > 0
);

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatLatency = (value?: number | null) =>
  value !== null && value !== undefined ? `${value}ms` : "—";

const requestResultLabel = (value: RequestLogRow["result"]) =>
  value === "success"
    ? t("usage.requests.result.success")
    : t("usage.requests.result.failure");

const requestErrorTypeLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    quota: t("usage.requests.errorType.quota"),
    rate_limit: t("usage.requests.errorType.rate_limit"),
    server: t("usage.requests.errorType.server"),
    auth: t("usage.requests.errorType.auth"),
    model_not_found: t("usage.requests.errorType.model_not_found"),
    network: t("usage.requests.errorType.network"),
    unknown: t("usage.requests.errorType.unknown"),
  };
  if (!value) return "—";
  return map[value] ?? t("usage.requests.errorType.unknown");
};

const formatElapsed = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  if (value < 1000) return `${value}ms`;
  if (value < 10_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value / 1000)}s`;
};

const activeRequestProviderLabel = (row: ActiveRequestRow) =>
  row.currentProviderName || t("usage.activeRequests.routing");

const activeAttemptStatusLabel = (status: ActiveRequestAttempt["status"]) =>
  status === "active"
    ? t("usage.activeRequests.status.active")
    : t("usage.activeRequests.status.failed");

const activeAttemptStatusTone = (status: ActiveRequestAttempt["status"]) =>
  status === "active"
    ? "bg-sky-100 text-sky-700"
    : "bg-rose-100 text-rose-700";

const refreshAll = async () => {
  await executeRequests();
  await executeActiveRequests();
};

const refreshRequests = async () => {
  await executeRequests();
};

const refreshActiveRequests = async () => {
  await executeActiveRequests();
};

watch(
  authHeader,
  async (value) => {
    if (!value) return;
    await fetchProviders();
    await executeRequests();
    await executeActiveRequests();
  },
  { immediate: true }
);

watch(
  () => requestFilters.limit,
  async (value, prev) => {
    if (value === prev) return;
    await updateRequestLimit();
  }
);
</script>

<template>
  <section class="space-y-4 md:space-y-5">
    <PageHeader
      :eyebrow="$t('nav.requests')"
      :title="$t('requests.title')"
      :intro="$t('requests.intro')"
    >
      <template #actions>
        <UButton class="action-press" variant="outline" @click="refreshAll">
          {{ $t("requests.refresh") }}
        </UButton>
      </template>
    </PageHeader>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("usage.activeRequests.title") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("usage.activeRequests.subtitle") }}
          </p>
        </div>
        <UButton class="action-press" variant="outline" @click="refreshActiveRequests">
          {{ $t("usage.activeRequests.refresh") }}
        </UButton>
      </div>

      <div class="section-shell__body pt-0">
        <div v-if="activeRequestPending" class="space-y-2">
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
        </div>

        <div
          v-else-if="activeRequestError"
          class="radius-card border border-rose-200 bg-rose-50 p-4"
        >
          <div class="text-sm font-medium text-rose-700">
            {{ $t("usage.activeRequests.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("usage.activeRequests.errorHint") }}
          </p>
        </div>

        <div
          v-else-if="activeRequestEmpty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            {{ $t("usage.activeRequests.emptyTitle") }}
          </div>
          <p class="mt-2 text-sm text-slate-500">
            {{ $t("usage.activeRequests.emptyHint") }}
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-0 text-sm md:min-w-[1120px]">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.activeRequests.table.time") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.activeRequests.table.request") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("usage.activeRequests.table.model") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
                  {{ $t("usage.activeRequests.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.activeRequests.table.attempts") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.activeRequests.table.elapsed") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in activeRequestRows"
                :key="row.requestId"
                class="border-b border-slate-200/50 staggered transition-colors hover:bg-slate-50/70"
                :style="{ '--index': index }"
              >
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ formatDate(row.startedAt) }}
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-900">
                  <div class="font-medium text-slate-900">{{ row.path }}</div>
                  <div class="mt-1 break-all text-xs text-slate-500 mono-numbers">
                    {{ row.requestId }}
                  </div>
                  <div class="mt-1 text-xs text-slate-500 md:hidden">
                    {{ row.modelSlug }} · {{ activeRequestProviderLabel(row) }}
                  </div>
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-900 md:table-cell">
                  {{ row.modelSlug }}
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-700 lg:table-cell">
                  {{ activeRequestProviderLabel(row) }}
                </td>
                <td class="py-2.5 pr-4 align-top">
                  <div v-if="row.attempts.length === 0" class="text-xs text-slate-500">
                    {{ $t("usage.activeRequests.routing") }}
                  </div>
                  <div v-else class="flex flex-wrap gap-1.5">
                    <div
                      v-for="attempt in row.attempts"
                      :key="`${row.requestId}-${attempt.providerId}-${attempt.startedAt}`"
                      class="min-w-[10rem] rounded-2xl border border-slate-200/70 bg-slate-50 px-2.5 py-2"
                    >
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-slate-900">{{ attempt.providerName }}</span>
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                          :class="activeAttemptStatusTone(attempt.status)"
                        >
                          {{ activeAttemptStatusLabel(attempt.status) }}
                        </span>
                      </div>
                      <div class="mt-1 text-[11px] text-slate-500">
                        {{ formatElapsed(attempt.elapsedMs) }}
                        <span v-if="attempt.errorType">
                          · {{ requestErrorTypeLabel(attempt.errorType) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ formatElapsed(row.elapsedMs) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("usage.requests.title") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("usage.requests.subtitle") }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            type="button"
            @click="requestFiltersCollapsed = !requestFiltersCollapsed"
          >
            {{
              requestFiltersCollapsed
                ? $t("usage.filtersToggle.show")
                : $t("usage.filtersToggle.hide")
            }}
          </UButton>
          <UButton class="action-press" size="sm" variant="outline" @click="refreshRequests">
            {{ $t("usage.requests.refresh") }}
          </UButton>
        </div>
      </div>

      <div v-show="!requestFiltersCollapsed" class="section-shell__body pt-0">
        <div class="toolbar-grid">
          <UFormGroup
            :label="$t('usage.requests.form.provider')"
            :help="$t('usage.requests.form.help.provider')"
          >
            <USelect v-model="requestFilters.providerId" :items="providerOptions" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.modelSlug')"
            :help="$t('usage.requests.form.help.modelSlug')"
          >
            <UInput
              v-model="requestFilters.modelSlug"
              :placeholder="$t('usage.requests.form.placeholder.modelSlug')"
            />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.errorType.label')"
            :help="$t('usage.requests.errorType.help')"
          >
            <USelect v-model="requestFilters.errorType" :items="requestErrorTypeOptions" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.startDate')"
            :help="$t('usage.requests.form.help.startDate')"
          >
            <UInput v-model="requestFilters.startDate" type="date" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.endDate')"
            :help="$t('usage.requests.form.help.endDate')"
          >
            <UInput v-model="requestFilters.endDate" type="date" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.limit')"
            :help="$t('usage.requests.form.help.limit')"
          >
            <USelect v-model="requestFilters.limit" :items="pageSizeOptions" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.offset')"
            :help="$t('usage.requests.form.help.offset')"
          >
            <UInput v-model="requestFilters.offset" type="number" min="0" step="1" />
          </UFormGroup>
        </div>
      </div>

      <div v-show="!requestFiltersCollapsed" class="section-shell__footer">
        <UButton class="action-press" color="primary" @click="applyRequestFilters">
          {{ $t("usage.requests.apply") }}
        </UButton>
        <div class="text-xs text-slate-500">
          {{ $t("usage.requests.hint") }}
        </div>
      </div>

      <div class="section-shell__footer">
        <div class="text-sm font-medium text-slate-900">
          {{ $t("usage.requests.log") }}
        </div>
        <div class="flex items-center gap-2">
          <div class="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span>{{ $t("usage.requests.form.limit") }}</span>
            <USelect
              v-model="requestFilters.limit"
              :items="pageSizeOptions"
              class="w-24"
            />
          </div>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!requestCanPrev"
            type="button"
            @click.prevent="prevRequestPage"
          >
            {{ $t("usage.requests.previous") }}
          </UButton>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!requestCanNext"
            type="button"
            @click.prevent="nextRequestPage"
          >
            {{ $t("usage.requests.next") }}
          </UButton>
        </div>
      </div>

      <div class="section-shell__body pt-0">
        <div v-if="requestPending" class="space-y-2">
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
        </div>

        <div
          v-else-if="requestError"
          class="radius-card border border-rose-200 bg-rose-50 p-4"
        >
          <div class="text-sm font-medium text-rose-700">
            {{ $t("usage.requests.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("usage.requests.errorHint") }}
          </p>
        </div>

        <div
          v-else-if="requestEmpty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            {{ $t("usage.requests.emptyTitle") }}
          </div>
          <p class="text-sm text-slate-500 mt-2">
            {{ $t("usage.requests.emptyHint") }}
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-0 text-sm md:min-w-[980px]">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.time") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("usage.requests.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.model") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.result") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
                  {{ $t("usage.requests.table.error") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
                  {{ $t("usage.requests.table.latency") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in requestRows"
                :key="row.id"
                class="border-b border-slate-200/50 staggered transition-colors hover:bg-slate-50/70"
                :style="{ '--index': index }"
              >
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ formatDate(row.createdAt) }}
                  <div class="mt-1 text-xs text-slate-500 md:hidden">
                    {{ providerNameMap.get(row.providerId) ?? row.providerId }}
                  </div>
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-700 md:table-cell">
                  {{ providerNameMap.get(row.providerId) ?? row.providerId }}
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-900">{{ row.modelSlug }}</td>
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ requestResultLabel(row.result) }}
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-700 lg:table-cell">
                  {{ requestErrorTypeLabel(row.errorType) }}
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-700 lg:table-cell">
                  {{ formatLatency(row.latencyMs) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
