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
  usageSource: "actual" | "estimated";
  routePath: string | null;
  requestId: string | null;
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
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
};

type UsageProviderStat = {
  providerId: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
};

type UsageModelStat = {
  modelSlug: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
};

type UsageStatsSummary = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
};

type UsageStatsResponse = {
  summary: UsageStatsSummary;
  trend: UsageTrendPoint[];
  byProvider: UsageProviderStat[];
  byModel: UsageModelStat[];
};

const { t } = useI18n();
const ALL_PROVIDERS = "all";
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

const filters = reactive({
  providerId: ALL_PROVIDERS,
  modelSlug: "",
  startDate: "",
  endDate: "",
  limit: DEFAULT_LIMIT.toString(),
  offset: "0",
});
const filtersCollapsed = ref(true);

const normalizeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const query = computed(() => {
  const payload: Record<string, string | number> = {
    limit: normalizeNumber(filters.limit, DEFAULT_LIMIT),
    offset: normalizeNumber(filters.offset, 0),
  };
  if (filters.providerId !== ALL_PROVIDERS) {
    payload.providerId = filters.providerId;
  }
  if (filters.modelSlug.trim()) payload.modelSlug = filters.modelSlug.trim();
  if (filters.startDate) payload.startDate = filters.startDate;
  if (filters.endDate) payload.endDate = filters.endDate;
  return payload;
});

const statsQuery = computed(() => {
  const payload: Record<string, string> = {};
  if (filters.providerId !== ALL_PROVIDERS) {
    payload.providerId = filters.providerId;
  }
  if (filters.modelSlug.trim()) {
    payload.modelSlug = filters.modelSlug.trim();
  }
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
const summary = computed<UsageStatsSummary>(() => {
  return (
    statsData.value?.summary ?? {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    }
  );
});
const trend = computed(() => statsData.value?.trend ?? []);
const providerStats = computed(() => statsData.value?.byProvider ?? []);
const modelStats = computed(() => statsData.value?.byModel ?? []);
const { authHeader } = useApiKey();

const providerNameMap = computed(() => {
  return new Map(providers.value.map((provider) => [provider.id, provider.name]));
});

const maxTrend = computed(() =>
  trend.value.reduce((max, item) => Math.max(max, item.totalTokens), 0)
);
const maxProvider = computed(() =>
  providerStats.value.reduce((max, item) => Math.max(max, item.totalTokens), 0)
);
const maxModel = computed(() =>
  modelStats.value.reduce((max, item) => Math.max(max, item.totalTokens), 0)
);

const ratio = (value: number, maxValue: number) => {
  if (!maxValue) return "0%";
  const percent = Math.max(6, Math.round((value / maxValue) * 100));
  return `${percent}%`;
};

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

const updateUsageLimit = async () => {
  filters.offset = "0";
  await execute();
};

const nextPage = async () => {
  const limit = normalizeNumber(filters.limit, DEFAULT_LIMIT);
  const offset = normalizeNumber(filters.offset, 0) + limit;
  filters.offset = offset.toString();
  await execute();
};

const prevPage = async () => {
  const limit = normalizeNumber(filters.limit, DEFAULT_LIMIT);
  const offset = Math.max(0, normalizeNumber(filters.offset, 0) - limit);
  filters.offset = offset.toString();
  await execute();
};

const canNext = computed(
  () => rows.value.length === normalizeNumber(filters.limit, DEFAULT_LIMIT)
);
const canPrev = computed(() => normalizeNumber(filters.offset, 0) > 0);

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
const formatInteger = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatTokenCompact = (value: number) => {
  if (Math.abs(value) < 1_000_000) {
    return formatInteger(value);
  }

  const unit = Math.abs(value) >= 1_000_000_000 ? "B" : "M";
  const divisor = unit === "B" ? 1_000_000_000 : 1_000_000;
  const scaled = value / divisor;
  const minimumFractionDigits = Math.abs(scaled) < 10 ? 1 : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits: 1,
  }).format(scaled);
  return `${formatted}${unit}`;
};
const formatUsageSource = (value: UsageRow["usageSource"]) => t(`usage.source.${value}`);
const usageSourceBadgeClass = (value: UsageRow["usageSource"]) =>
  value === "actual"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

const refreshAll = async () => {
  await execute();
  await executeStats();
};

watch(
  authHeader,
  async (value) => {
    if (!value) return;
    await fetchProviders();
    await execute();
    await executeStats();
  },
  { immediate: true }
);

watch(
  () => filters.limit,
  async (value, prev) => {
    if (value === prev) return;
    await updateUsageLimit();
  }
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
        <div v-if="statsPending" class="space-y-2">
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
          <div class="h-9 radius-soft skeleton"></div>
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

        <div v-else class="grid gap-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div class="metric-card p-3 space-y-1">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">
                {{ $t("usage.dashboard.summary.totalTokens") }}
              </div>
              <div class="text-2xl font-semibold text-slate-950 mono-numbers">
                {{ formatTokenCompact(summary.totalTokens) }}
              </div>
              <div class="text-[11px] text-slate-500">
                {{ formatInteger(summary.requestCount) }}
                {{ $t("usage.dashboard.requests") }}
              </div>
            </div>
            <div class="metric-card p-3 space-y-1">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">
                {{ $t("usage.dashboard.summary.inputTokens") }}
              </div>
              <div class="text-2xl font-semibold text-slate-950 mono-numbers">
                {{ formatTokenCompact(summary.inputTokens) }}
              </div>
            </div>
            <div class="metric-card p-3 space-y-1">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">
                {{ $t("usage.dashboard.summary.outputTokens") }}
              </div>
              <div class="text-2xl font-semibold text-slate-950 mono-numbers">
                {{ formatTokenCompact(summary.outputTokens) }}
              </div>
            </div>
            <div class="metric-card p-3 space-y-1">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">
                {{ $t("usage.dashboard.summary.cost") }}
              </div>
              <div class="text-2xl font-semibold text-slate-950 mono-numbers">
                ${{ formatCost(summary.totalCost) }}
              </div>
            </div>
            <div class="metric-card p-3 space-y-1">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">
                {{ $t("usage.dashboard.summary.ioRatio") }}
              </div>
              <div class="text-sm font-medium text-slate-900 mono-numbers">
                {{ formatTokenCompact(summary.inputTokens) }} / {{ formatTokenCompact(summary.outputTokens) }}
              </div>
              <div class="text-[11px] text-slate-500">
                {{ $t("usage.dashboard.summary.ioRatioHint") }}
              </div>
            </div>
          </div>

          <div class="metric-card p-3 space-y-2">
            <div class="text-sm font-medium text-slate-900">
              {{ $t("usage.dashboard.trend") }}
            </div>
            <div v-if="trend.length === 0" class="text-sm text-slate-500">
              {{ $t("usage.dashboard.empty") }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="item in trend"
                :key="item.date"
                class="space-y-1"
              >
                <div class="flex items-center justify-between text-xs text-slate-600">
                  <span>{{ formatShortDate(item.date) }}</span>
                  <span class="mono-numbers">
                    {{ formatTokenCompact(item.totalTokens) }} {{ $t("usage.dashboard.tokens") }}
                  </span>
                </div>
                <div class="metric-card__bar">
                  <div
                    class="metric-card__bar-fill"
                    :style="{ width: ratio(item.totalTokens, maxTrend) }"
                  ></div>
                </div>
                <div class="flex items-center justify-between gap-3 text-[11px] text-slate-500 mono-numbers">
                  <span>
                    {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                  </span>
                  <span>
                    {{ formatTokenCompact(item.inputTokens) }} / {{ formatTokenCompact(item.outputTokens) }}
                  </span>
                  <span>${{ formatCost(item.totalCost) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="metric-card p-3 space-y-2">
              <div class="text-sm font-medium text-slate-900">
                {{ $t("usage.dashboard.providers") }}
              </div>
              <div v-if="providerStats.length === 0" class="text-sm text-slate-500">
                {{ $t("usage.dashboard.empty") }}
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in providerStats"
                  :key="item.providerId"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between text-xs text-slate-600">
                    <span>{{ providerNameMap.get(item.providerId) ?? item.providerId }}</span>
                    <span class="mono-numbers">
                      {{ formatTokenCompact(item.totalTokens) }} {{ $t("usage.dashboard.tokens") }}
                    </span>
                  </div>
                  <div class="metric-card__bar">
                    <div
                      class="metric-card__bar-fill"
                      :style="{ width: ratio(item.totalTokens, maxProvider) }"
                    ></div>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-[11px] text-slate-500 mono-numbers">
                    <span>
                      {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                    </span>
                    <span>
                      {{ formatTokenCompact(item.inputTokens) }} / {{ formatTokenCompact(item.outputTokens) }}
                    </span>
                    <span>${{ formatCost(item.totalCost) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="metric-card p-3 space-y-2">
              <div class="text-sm font-medium text-slate-900">
                {{ $t("usage.dashboard.models") }}
              </div>
              <div v-if="modelStats.length === 0" class="text-sm text-slate-500">
                {{ $t("usage.dashboard.empty") }}
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in modelStats"
                  :key="item.modelSlug"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between text-xs text-slate-600">
                    <span>{{ item.modelSlug }}</span>
                    <span class="mono-numbers">
                      {{ formatTokenCompact(item.totalTokens) }} {{ $t("usage.dashboard.tokens") }}
                    </span>
                  </div>
                  <div class="metric-card__bar">
                    <div
                      class="metric-card__bar-fill"
                      :style="{ width: ratio(item.totalTokens, maxModel) }"
                    ></div>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-[11px] text-slate-500 mono-numbers">
                    <span>
                      {{ item.requestCount }} {{ $t("usage.dashboard.requests") }}
                    </span>
                    <span>
                      {{ formatTokenCompact(item.inputTokens) }} / {{ formatTokenCompact(item.outputTokens) }}
                    </span>
                    <span>${{ formatCost(item.totalCost) }}</span>
                  </div>
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
        <UButton
          class="action-press"
          size="sm"
          variant="outline"
          type="button"
          @click="filtersCollapsed = !filtersCollapsed"
        >
          {{
            filtersCollapsed
              ? $t("usage.filtersToggle.show")
              : $t("usage.filtersToggle.hide")
          }}
        </UButton>
      </div>
      <div v-show="!filtersCollapsed" class="section-shell__body pt-0">
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
            <USelect v-model="filters.limit" :items="pageSizeOptions" />
          </UFormGroup>
          <UFormGroup
            :label="$t('usage.form.offset')"
            :help="$t('usage.form.help.offset')"
          >
            <UInput v-model="filters.offset" type="number" min="0" step="1" />
          </UFormGroup>
        </div>
      </div>
      <div v-show="!filtersCollapsed" class="section-shell__footer">
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
          <div class="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span>{{ $t("usage.form.limit") }}</span>
            <USelect
              v-model="filters.limit"
              :items="pageSizeOptions"
              class="w-24"
            />
          </div>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!canPrev"
            type="button"
            @click.prevent="prevPage"
          >
            {{ $t("usage.previous") }}
          </UButton>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!canNext"
            type="button"
            @click.prevent="nextPage"
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
          <table class="w-full min-w-0 text-sm md:min-w-[900px]">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.time") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("usage.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("usage.table.model") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("usage.table.source") }}
                </th>
                <th class="hidden py-2 text-left font-medium xl:table-cell">
                  {{ $t("usage.table.route") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
                  {{ $t("usage.table.input") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
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
                <td class="py-2.5 pr-4 align-top text-slate-900">
                  <div>{{ row.modelSlug }}</div>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs md:hidden">
                    <span
                      class="inline-flex items-center rounded-full border px-2 py-0.5 font-medium"
                      :class="usageSourceBadgeClass(row.usageSource)"
                    >
                      {{ formatUsageSource(row.usageSource) }}
                    </span>
                    <span class="text-slate-500">{{ row.routePath ?? "-" }}</span>
                  </div>
                  <div class="mt-1 text-xs text-slate-500 md:hidden">
                    {{ $t("usage.table.requestId") }}: {{ row.requestId ?? "-" }}
                  </div>
                </td>
                <td class="hidden py-2.5 pr-4 align-top md:table-cell">
                  <span
                    class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                    :class="usageSourceBadgeClass(row.usageSource)"
                  >
                    {{ formatUsageSource(row.usageSource) }}
                  </span>
                </td>
                <td class="hidden py-2.5 pr-4 align-top text-slate-700 xl:table-cell">
                  <div class="font-mono text-xs text-slate-700">
                    {{ row.routePath ?? "-" }}
                  </div>
                  <div class="mt-1 text-xs text-slate-500">
                    {{ $t("usage.table.requestId") }}: {{ row.requestId ?? "-" }}
                  </div>
                </td>
                <td class="hidden py-2.5 pr-4 align-top mono-numbers text-slate-900 lg:table-cell">
                  {{ formatTokenCompact(row.inputTokens) }}
                </td>
                <td class="hidden py-2.5 pr-4 align-top mono-numbers text-slate-900 lg:table-cell">
                  {{ formatTokenCompact(row.outputTokens) }}
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

  </section>
</template>
