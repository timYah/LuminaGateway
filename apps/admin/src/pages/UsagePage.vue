<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

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
            {{ $t("nav.usage") }}
          </div>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900">
            {{ $t("usage.title") }}
          </h1>
          <p class="mt-3 text-base text-slate-600 leading-relaxed max-w-[65ch]">
            {{ $t("usage.intro") }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UButton class="action-press" variant="outline" @click="execute">
            {{ $t("usage.refresh") }}
          </UButton>
        </div>
      </header>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel divide-y divide-slate-200/60">
      <div class="px-6 py-5 md:px-8 md:py-6">
        <div class="text-sm font-medium text-slate-900">
          {{ $t("usage.filters") }}
        </div>
      </div>
      <div class="px-6 py-5 md:px-8 md:py-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <UFormGroup
            :label="$t('usage.form.provider')"
            :help="$t('usage.form.help.provider')"
          >
            <USelect v-model="filters.providerId" :options="providerOptions" />
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
      <div class="flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <UButton class="action-press" color="primary" @click="applyFilters">
          {{ $t("usage.apply") }}
        </UButton>
        <div class="text-xs text-slate-500">
          {{ $t("usage.hint") }}
        </div>
      </div>
    </div>

    <div class="surface radius-panel divide-y divide-slate-200/60">
      <div class="flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <div>
          <div class="text-sm font-medium text-slate-900">
            {{ $t("usage.log") }}
          </div>
          <p class="text-sm text-slate-500">
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
                <th class="py-2.5 text-left font-medium">
                  {{ $t("usage.table.time") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("usage.table.provider") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("usage.table.model") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("usage.table.input") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("usage.table.output") }}
                </th>
                <th class="py-2.5 text-left font-medium">
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
