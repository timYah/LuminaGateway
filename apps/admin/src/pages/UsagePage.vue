<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import { gatewayFetch, useGatewayFetch } from "../composables/useGatewayFetch";
import { useApiKey } from "../composables/useApiKey";
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

const providers = ref<Provider[]>([]);
const providerOptions = computed(() => [
  { label: "All providers", value: "" },
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

const { data, pending, error, execute } = useGatewayFetch<UsageResponse>(
  "/admin/usage",
  {
    query,
    immediate: false,
    watch: false,
  }
);

const rows = computed(() => data.value?.usage ?? []);
const empty = computed(() => !pending.value && rows.value.length === 0);
const { authHeader } = useApiKey();

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

const canNext = computed(() => rows.value.length === normalizeNumber(filters.limit, 50));
const canPrev = computed(() => normalizeNumber(filters.offset, 0) > 0);

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

watch(
  authHeader,
  async (value) => {
    if (!value) return;
    await fetchProviders();
    await execute();
  },
  { immediate: true }
);
</script>

<template>
  <section class="space-y-5">
    <header
      class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
          Usage
        </div>
        <h1 class="mt-3 text-3xl font-semibold text-slate-900">
          Token flow and cost clarity
        </h1>
        <p class="mt-3 text-base text-slate-600 leading-relaxed max-w-[65ch]">
          Filter usage logs by provider, model, or time window to reconcile
          spend across the gateway.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <UButton class="action-press" variant="outline" @click="execute">
          Refresh usage
        </UButton>
      </div>
    </header>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel divide-y divide-slate-200/60">
      <div class="px-6 py-5 md:px-8 md:py-6">
        <div class="text-sm font-medium text-slate-900">Filters</div>
      </div>
      <div class="px-6 py-5 md:px-8 md:py-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <UFormGroup label="Provider" help="Filter by provider ID.">
            <USelect v-model="filters.providerId" :options="providerOptions" />
          </UFormGroup>
          <UFormGroup label="Model slug" help="Exact model slug value.">
            <UInput v-model="filters.modelSlug" placeholder="gpt-4o" />
          </UFormGroup>
          <UFormGroup label="Start date" help="Inclusive, local time.">
            <UInput v-model="filters.startDate" type="date" />
          </UFormGroup>
          <UFormGroup label="End date" help="Inclusive, local time.">
            <UInput v-model="filters.endDate" type="date" />
          </UFormGroup>
          <UFormGroup label="Limit" help="Rows per request.">
            <UInput v-model="filters.limit" type="number" min="1" step="1" />
          </UFormGroup>
          <UFormGroup label="Offset" help="Zero-based row offset.">
            <UInput v-model="filters.offset" type="number" min="0" step="1" />
          </UFormGroup>
        </div>
      </div>
      <div class="flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <UButton class="action-press" color="primary" @click="applyFilters">
          Apply filters
        </UButton>
        <div class="text-xs text-slate-500">
          Requests use the current offset and limit values.
        </div>
      </div>
    </div>

    <div class="surface radius-panel divide-y divide-slate-200/60">
      <div class="flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <div>
          <div class="text-sm font-medium text-slate-900">Usage log</div>
          <p class="text-sm text-slate-500">
            Sorted by newest entries first.
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
            Previous
          </UButton>
          <UButton
            class="action-press"
            size="sm"
            variant="outline"
            :disabled="!canNext"
            @click="nextPage"
          >
            Next
          </UButton>
        </div>
      </div>

      <div class="px-6 py-5 md:px-8 md:py-6">
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
            Usage data failed to load.
          </div>
          <p class="text-sm text-rose-600">
            Verify the API key and filters, then refresh.
          </p>
        </div>

        <div
          v-else-if="empty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            No usage records match the current filters.
          </div>
          <p class="text-sm text-slate-500 mt-2">
            Adjust the filters or check again after new requests.
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-[900px] w-full text-sm">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
              <th class="py-2.5 text-left font-medium">Time</th>
              <th class="py-2.5 text-left font-medium">Provider</th>
              <th class="py-2.5 text-left font-medium">Model</th>
              <th class="py-2.5 text-left font-medium">Input</th>
              <th class="py-2.5 text-left font-medium">Output</th>
              <th class="py-2.5 text-left font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="row.id"
                class="border-b border-slate-200/50 staggered"
                :style="{ '--index': index }"
              >
                <td class="py-3 text-slate-700">
                  {{ formatDate(row.createdAt) }}
                </td>
                <td class="py-3 text-slate-700">{{ row.providerId }}</td>
                <td class="py-3 text-slate-900">{{ row.modelSlug }}</td>
                <td class="py-3 mono-numbers text-slate-900">
                  {{ row.inputTokens }}
                </td>
                <td class="py-3 mono-numbers text-slate-900">
                  {{ row.outputTokens }}
                </td>
                <td class="py-3 mono-numbers text-slate-900">
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
