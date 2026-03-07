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

type UsageRow = {
  id: number;
  providerId: number;
  modelSlug: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
};

type UsageResponse = {
  usage: UsageRow[];
  limit: number;
  offset: number;
};

type UsageTrendPoint = {
  date: string;
  requestCount: number;
  totalCost: number;
};

type UsageProviderStat = {
  providerId: number;
  requestCount: number;
  totalCost: number;
};

type UsageModelStat = {
  modelSlug: string;
  requestCount: number;
  totalCost: number;
};

type UsageStatsResponse = {
  trend: UsageTrendPoint[];
  byProvider: UsageProviderStat[];
  byModel: UsageModelStat[];
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

const { t } = useI18n();
const providers = ref<Provider[]>([]);
const providerOptions = computed(() => [
  { label: t("common.allProviders"), value: "" },
  ...providers.value.map((provider) => ({
    label: provider.name,
    value: provider.id.toString(),
  })),
]);

const filters = reactive({
  providerId: "",
  modelSlug: "",
  startDate: "",
  endDate: "",
  limit: "50",
  offset: "0",
});

const requestFilters = reactive({
  providerId: "",
  modelSlug: "",
  startDate: "",
  endDate: "",
  errorType: "",
  limit: "50",
  offset: "0",
});

const normalizeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const query = computed(() => {
  const payload: Record<string, string | number> = {
    limit: normalizeNumber(filters.limit, 50),
    offset: normalizeNumber(filters.offset, 0),
  };
  if (filters.providerId) payload.providerId = filters.providerId;
  if (filters.modelSlug.trim()) payload.modelSlug = filters.modelSlug.trim();
  if (filters.startDate) payload.startDate = filters.startDate;
  if (filters.endDate) payload.endDate = filters.endDate;
  return payload;
});

const requestQuery = computed(() => {
  const payload: Record<string, string | number> = {
    limit: normalizeNumber(requestFilters.limit, 50),
    offset: normalizeNumber(requestFilters.offset, 0),
  };
  if (requestFilters.providerId) payload.providerId = requestFilters.providerId;
  if (requestFilters.modelSlug.trim()) {
    payload.modelSlug = requestFilters.modelSlug.trim();
  }
  if (requestFilters.startDate) payload.startDate = requestFilters.startDate;
  if (requestFilters.endDate) payload.endDate = requestFilters.endDate;
  if (requestFilters.errorType) payload.errorType = requestFilters.errorType;
  return payload;
});

const statsQuery = computed(() => {
  const payload: Record<string, string> = {};
  if (filters.startDate) payload.startDate = filters.startDate;
  if (filters.endDate) payload.endDate = filters.endDate;
  return payload;
});

const { data, pending, error, execute } = useGatewayFetch<UsageResponse>(
  "/admin/usage",
  {
    query,
    immediate: false,
    watch: false,
  }
);

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
  data: statsData,
  pending: statsPending,
  error: statsError,
  execute: executeStats,
} = useGatewayFetch<UsageStatsResponse>("/admin/usage/stats", {
  query: statsQuery,
  immediate: false,
  watch: false,
});

const rows = computed(() => data.value?.usage ?? []);
const empty = computed(() => !pending.value && rows.value.length === 0);
const trend = computed(() => statsData.value?.trend ?? []);
const providerStats = computed(() => statsData.value?.byProvider ?? []);
const modelStats = computed(() => statsData.value?.byModel ?? []);
const { authHeader } = useApiKey();

const requestRows = computed(() => requestData.value?.requests ?? []);
const requestEmpty = computed(
  () => !requestPending.value && requestRows.value.length === 0
);

const providerNameMap = computed(() => {
  return new Map(providers.value.map((provider) => [provider.id, provider.name]));
});

const maxTrend = computed(() =>
  trend.value.reduce((max, item) => Math.max(max, item.requestCount), 0)
);
const maxProvider = computed(() =>
  providerStats.value.reduce((max, item) => Math.max(max, item.requestCount), 0)
);
const maxModel = computed(() =>
  modelStats.value.reduce((max, item) => Math.max(max, item.requestCount), 0)
);

const ratio = (value: number, maxValue: number) => {
  if (!maxValue) return "0%";
  const percent = Math.max(6, Math.round((value / maxValue) * 100));
  return `${percent}%`;
};

const requestErrorTypeOptions = computed(() => [
  { label: t("usage.requests.errorType.all"), value: "" },
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

const applyFilters = async () => {
  filters.offset = "0";
  await execute();
  await executeStats();
};

const applyRequestFilters = async () => {
  requestFilters.offset = "0";
  await executeRequests();
};

const nextPage = async () => {
  const limit = normalizeNumber(filters.limit, 50);
  const offset = normalizeNumber(filters.offset, 0) + limit;
  filters.offset = offset.toString();
  await execute();
};

const prevPage = async () => {
  const limit = normalizeNumber(filters.limit, 50);
  const offset = Math.max(0, normalizeNumber(filters.offset, 0) - limit);
  filters.offset = offset.toString();
  await execute();
};

const nextRequestPage = async () => {
  const limit = normalizeNumber(requestFilters.limit, 50);
  const offset = normalizeNumber(requestFilters.offset, 0) + limit;
  requestFilters.offset = offset.toString();
  await executeRequests();
};

const prevRequestPage = async () => {
  const limit = normalizeNumber(requestFilters.limit, 50);
  const offset = Math.max(0, normalizeNumber(requestFilters.offset, 0) - limit);
  requestFilters.offset = offset.toString();
  await executeRequests();
};

const canNext = computed(() => rows.value.length === normalizeNumber(filters.limit, 50));
const canPrev = computed(() => normalizeNumber(filters.offset, 0) > 0);
const requestCanNext = computed(
  () => requestRows.value.length === normalizeNumber(requestFilters.limit, 50)
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

const formatShortDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
};

const formatCost = (value: number) => value.toFixed(4);
const formatLatency = (value?: number | null) =>
  value !== null && value !== undefined ? `${value}ms` : "—";

const requestResultLabel = (value: RequestLogRow["result"]) =>
  value === "success"
    ? t("usage.requests.result.success")
    : t("usage.requests.result.failure");

const refreshAll = async () => {
  await execute();
  await executeStats();
};

const refreshRequests = async () => {
  await executeRequests();
};

watch(
  authHeader,
  async (value) => {
    if (!value) return;
    await fetchProviders();
    await execute();
    await executeStats();
    await executeRequests();
  },
  { immediate: true }
);
</script>

<template>
  <section class="space-y-4 md:space-y-5">
    <PageHeader
      :eyebrow="$t('nav.usage')"
      :title="$t('usage.title')"
      :intro="$t('usage.intro')"
    >
      <template #actions>
        <UButton class="action-press" variant="outline" @click="refreshAll">
          {{ $t("usage.refresh") }}
        </UButton>
      </template>
    </PageHeader>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("usage.dashboard.title") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("usage.dashboard.subtitle") }}
          </p>
        </div>
      </div>
      <div class="section-shell__body pt-0">
        <div v-if="statsPending" class="space-y-3">
          <div class="h-10 radius-soft skeleton"></div>
          <div class="h-10 radius-soft skeleton"></div>
          <div class="h-10 radius-soft skeleton"></div>
        </div>

        <div
          v-else-if="statsError"
          class="radius-card border border-rose-200 bg-rose-50 p-4"
        >
          <div class="text-sm font-medium text-rose-700">
            {{ $t("usage.dashboard.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("usage.dashboard.errorHint") }}
          </p>
        </div>

        <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.95fr_0.95fr]">
          <div class="radius-card border border-slate-200/70 bg-slate-50/70 p-4 space-y-3">
            <div class="text-sm font-medium text-slate-900">
              {{ $t("usage.dashboard.trend") }}
            </div>
            <div v-if="trend.length === 0" class="text-sm text-slate-500">
              {{ $t("usage.dashboard.empty") }}
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="item in trend"
                :key="item.date"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-xs text-slate-600">
                  <span>{{ formatShortDate(item.date) }}</span>
                  <span class="mono-numbers">
                    {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                  </span>
                </div>
                <div class="h-2 rounded-full bg-slate-100">
                  <div
                    class="h-2 rounded-full bg-slate-900"
                    :style="{ width: ratio(item.requestCount, maxTrend) }"
                  ></div>
                </div>
                <div class="text-[11px] text-slate-500 mono-numbers">
                  ${{ formatCost(item.totalCost) }}
                </div>
              </div>
            </div>
          </div>

          <div class="radius-card border border-slate-200/70 bg-slate-50/70 p-4 space-y-3">
            <div class="text-sm font-medium text-slate-900">
              {{ $t("usage.dashboard.providers") }}
            </div>
            <div v-if="providerStats.length === 0" class="text-sm text-slate-500">
              {{ $t("usage.dashboard.empty") }}
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="item in providerStats"
                :key="item.providerId"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-xs text-slate-600">
                  <span>{{ providerNameMap.get(item.providerId) ?? item.providerId }}</span>
                  <span class="mono-numbers">
                    {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                  </span>
                </div>
                <div class="h-2 rounded-full bg-slate-100">
                  <div
                    class="h-2 rounded-full bg-slate-800"
                    :style="{ width: ratio(item.requestCount, maxProvider) }"
                  ></div>
                </div>
                <div class="text-[11px] text-slate-500 mono-numbers">
                  ${{ formatCost(item.totalCost) }}
                </div>
              </div>
            </div>
          </div>

          <div class="radius-card border border-slate-200/70 bg-slate-50/70 p-4 space-y-3">
            <div class="text-sm font-medium text-slate-900">
              {{ $t("usage.dashboard.models") }}
            </div>
            <div v-if="modelStats.length === 0" class="text-sm text-slate-500">
              {{ $t("usage.dashboard.empty") }}
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="item in modelStats"
                :key="item.modelSlug"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-xs text-slate-600">
                  <span>{{ item.modelSlug }}</span>
                  <span class="mono-numbers">
                    {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                  </span>
                </div>
                <div class="h-2 rounded-full bg-slate-100">
                  <div
                    class="h-2 rounded-full bg-slate-700"
                    :style="{ width: ratio(item.requestCount, maxModel) }"
                  ></div>
                </div>
                <div class="text-[11px] text-slate-500 mono-numbers">
                  ${{ formatCost(item.totalCost) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("usage.filters") }}
          </div>
        </div>
      </div>
      <div class="section-shell__body pt-0">
        <div class="toolbar-grid">
          <UFormGroup
            :label="$t('usage.form.provider')"
            :help="$t('usage.form.help.provider')"
          >
            <USelect v-model="filters.providerId" :items="providerOptions" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.modelSlug')"
            :help="$t('usage.form.help.modelSlug')"
          >
            <UInput
              v-model="filters.modelSlug"
              :placeholder="$t('usage.form.placeholder.modelSlug')"
            />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.startDate')"
            :help="$t('usage.form.help.startDate')"
          >
            <UInput v-model="filters.startDate" type="date" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.endDate')"
            :help="$t('usage.form.help.endDate')"
          >
            <UInput v-model="filters.endDate" type="date" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.limit')"
            :help="$t('usage.form.help.limit')"
          >
            <UInput v-model="filters.limit" type="number" min="1" step="1" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.offset')"
            :help="$t('usage.form.help.offset')"
          >
            <UInput v-model="filters.offset" type="number" min="0" step="1" />
          </UFormGroup>
        </div>
      </div>
      <div class="section-shell__footer">
        <UButton class="action-press" color="primary" @click="applyFilters">
          {{ $t("usage.apply") }}
        </UButton>
        <div class="text-xs text-slate-500">
          {{ $t("usage.hint") }}
        </div>
      </div>
    </div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("usage.log") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("usage.logHint") }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!canPrev"
            @click="prevPage"
          >
            {{ $t("usage.previous") }}
          </UButton>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!canNext"
            @click="nextPage"
          >
            {{ $t("usage.next") }}
          </UButton>
        </div>
      </div>

      <div class="section-shell__body pt-0">
        <div v-if="pending" class="space-y-2">
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
        </div>

        <div
          v-else-if="error"
          class="radius-card border border-rose-200 bg-rose-50 p-4"
        >
          <div class="text-sm font-medium text-rose-700">
            {{ $t("usage.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("usage.errorHint") }}
          </p>
        </div>

        <div
          v-else-if="empty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            {{ $t("usage.emptyTitle") }}
          </div>
          <p class="text-sm text-slate-500 mt-2">
            {{ $t("usage.emptyHint") }}
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-[900px] w-full text-sm">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.time") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.model") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.input") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.output") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.cost") }}
                </th>
              </tr>
            </thead>
          <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="row.id"
                class="border-b border-slate-200/50 staggered"
                :style="{ '--index': index }"
              >
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ formatDate(row.createdAt) }}
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-700">{{ row.providerId }}</td>
                <td class="py-2.5 pr-4 align-top text-slate-900">{{ row.modelSlug }}</td>
                <td class="py-2.5 pr-4 align-top mono-numbers text-slate-900">
                  {{ row.inputTokens }}
                </td>
                <td class="py-2.5 pr-4 align-top mono-numbers text-slate-900">
                  {{ row.outputTokens }}
                </td>
                <td class="py-2.5 pr-4 align-top mono-numbers text-slate-900">
                  {{ row.cost.toFixed(4) }}
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
        <UButton class="action-press" variant="outline" @click="refreshRequests">
          {{ $t("usage.requests.refresh") }}
        </UButton>
      </div>

      <div class="section-shell__body pt-0">
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
            <UInput v-model="requestFilters.limit" type="number" min="1" step="1" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.requests.form.offset')"
            :help="$t('usage.requests.form.help.offset')"
          >
            <UInput v-model="requestFilters.offset" type="number" min="0" step="1" />
          </UFormGroup>
        </div>
      </div>

      <div class="section-shell__footer">
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
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!requestCanPrev"
            @click="prevRequestPage"
          >
            {{ $t("usage.requests.previous") }}
          </UButton>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!requestCanNext"
            @click="nextRequestPage"
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
          <table class="min-w-[980px] w-full text-sm">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.time") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.model") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.result") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.error") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.requests.table.latency") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in requestRows"
                :key="row.id"
                class="border-b border-slate-200/50 staggered"
                :style="{ '--index': index }"
              >
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ formatDate(row.createdAt) }}
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ providerNameMap.get(row.providerId) ?? row.providerId }}
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-900">{{ row.modelSlug }}</td>
                <td class="py-2.5 align-top">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    :class="row.result === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'"
                  >
                    {{ requestResultLabel(row.result) }}
                  </span>
                </td>
                <td class="py-2.5 pr-4 align-top text-slate-700">
                  {{ row.errorType || "—" }}
                </td>
                <td class="py-2.5 align-top mono-numbers text-slate-700">
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
