<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { gatewayFetch, useGatewayFetch } from "../composables/useGatewayFetch";
import PageHeader from "../components/PageHeader.vue";
import UFormGroup from "../components/UFormGroup.vue";

type Provider = {
  id: number;
  name: string;
  protocol: "openai" | "anthropic" | "google" | "new-api";
  baseUrl: string;
  apiKey: string;
  apiMode: "responses" | "chat";
  codexTransform: boolean;
  healthCheckModel?: string | null;
  balance: number;
  inputPrice: number | null;
  outputPrice: number | null;
  isActive: boolean;
  priority: number;
  healthStatus?: "healthy" | "unhealthy" | "unknown";
  lastHealthCheckAt?: string;
  recovery?: {
    state: "recovering";
    triggerErrorType: FailureReason;
    probeModel: string;
    startedAt: string;
    nextProbeAt: string;
    lastProbeAt?: string | null;
    lastProbeErrorType?: FailureReason | null;
    lastProbeMessage?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

type ProviderResponse = {
  providers: Provider[];
};

type FailureReason =
  | "quota"
  | "rate_limit"
  | "server"
  | "auth"
  | "model_not_found"
  | "network"
  | "unknown";

type FailureStats = Record<FailureReason, number>;

type FailureStatsResponse = {
  total: FailureStats;
  providers: Record<string, FailureStats>;
};

const { data, pending, error, refresh } = useGatewayFetch<ProviderResponse>(
  "/admin/providers"
);
const {
  data: failureStatsData,
  refresh: refreshFailureStats,
} = useGatewayFetch<FailureStatsResponse>("/admin/failure-stats");

const providers = computed(() => data.value?.providers ?? []);
const empty = computed(() => !pending.value && providers.value.length === 0);

const { t } = useI18n();

const protocolOptions = computed(() => [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google", value: "google" },
  { label: "New API", value: "new-api" },
]);

const failureKeys: FailureReason[] = [
  "quota",
  "rate_limit",
  "server",
  "auth",
  "model_not_found",
  "network",
  "unknown",
];

const failureSummary = computed(() => {
  const total = failureStatsData.value?.total;
  return failureKeys.map((key) => ({
    key,
    label: t(`providers.failures.${key}`),
    value: total?.[key] ?? 0,
  }));
});

const apiModeOptions = computed(() => [
  { label: t("providers.form.apiModeResponses"), value: "responses" },
  { label: t("providers.form.apiModeChat"), value: "chat" },
]);

const supportsApiMode = (protocol: Provider["protocol"]) =>
  protocol === "openai" || protocol === "new-api";

const canTestCreate = computed(
  () => createForm.baseUrl.trim().length > 0 && createForm.apiKey.trim().length > 0
);

const testModelStorageKey = "lumina-admin-test-model";
const testModel = ref("");
if (typeof window !== "undefined") {
  const stored = globalThis.localStorage?.getItem(testModelStorageKey);
  if (stored && stored.trim().length > 0) {
    testModel.value = stored.trim();
  }
}
watch(testModel, (value) => {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (trimmed) {
    globalThis.localStorage?.setItem(testModelStorageKey, trimmed);
  } else {
    globalThis.localStorage?.removeItem(testModelStorageKey);
  }
});

const createOpen = ref(false);
const editOpen = ref(false);
const createAdvancedOpen = ref(false);
const createWorking = ref(false);
const createTestWorking = ref(false);
const editWorking = ref(false);
const createError = ref("");
const editError = ref("");
const exportWorking = ref(false);
const exportError = ref("");
const importOpen = ref(false);
const importWorking = ref(false);
const importError = ref("");
const importPayload = ref("");
const importReplace = ref(true);
const importModelOverwrite = ref(true);
const editingId = ref<number | null>(null);
const deleteOpen = ref(false);
const deleteWorking = ref(false);
const deleteError = ref("");
const deleteTarget = ref<Provider | null>(null);

const testingId = ref<number | null>(null);
const healthWorking = ref(false);
const createTestResult = ref<{ ok: boolean; latencyMs?: number; errorType?: string } | null>(
  null
);
const testResults = reactive<
  Map<number, { ok: boolean; latencyMs?: number; errorType?: string; message?: string }>
>(new Map());

const createForm = reactive({
  name: "",
  protocol: "openai" as Provider["protocol"],
  baseUrl: "",
  apiKey: "",
  apiMode: "responses" as Provider["apiMode"],
  codexTransform: false,
  healthCheckModel: "",
  balance: "",
  inputPrice: "",
  outputPrice: "",
  isActive: true,
  priority: "1",
});

const editForm = reactive({
  name: "",
  protocol: "openai" as Provider["protocol"],
  baseUrl: "",
  apiKey: "",
  apiMode: "responses" as Provider["apiMode"],
  codexTransform: false,
  healthCheckModel: "",
  balance: "",
  inputPrice: "",
  outputPrice: "",
  isActive: true,
  priority: "1",
});

const resetCreate = () => {
  createForm.name = "";
  createForm.protocol = "openai";
  createForm.baseUrl = "";
  createForm.apiKey = "";
  createForm.apiMode = "responses";
  createForm.codexTransform = false;
  createForm.healthCheckModel = "";
  createForm.balance = "";
  createForm.inputPrice = "";
  createForm.outputPrice = "";
  createForm.isActive = true;
  createForm.priority = "1";
  createTestWorking.value = false;
  createTestResult.value = null;
  createAdvancedOpen.value = false;
};

const openEdit = (provider: Provider) => {
  editingId.value = provider.id;
  editForm.name = provider.name;
  editForm.protocol = provider.protocol;
  editForm.baseUrl = provider.baseUrl;
  editForm.apiKey = provider.apiKey;
  editForm.apiMode = provider.apiMode ?? "responses";
  editForm.codexTransform = provider.codexTransform ?? false;
  editForm.healthCheckModel = provider.healthCheckModel ?? "";
  editForm.balance = Number.isFinite(provider.balance)
    ? provider.balance.toString()
    : "";
  editForm.inputPrice =
    provider.inputPrice !== null && provider.inputPrice !== undefined
      ? provider.inputPrice.toString()
      : "";
  editForm.outputPrice =
    provider.outputPrice !== null && provider.outputPrice !== undefined
      ? provider.outputPrice.toString()
      : "";
  editForm.isActive = provider.isActive;
  editForm.priority = provider.priority.toString();
  editError.value = "";
  editOpen.value = true;
};

const openDelete = (provider: Provider) => {
  deleteTarget.value = provider;
  deleteError.value = "";
  deleteOpen.value = true;
};

const closeDelete = () => {
  deleteOpen.value = false;
  deleteTarget.value = null;
  deleteError.value = "";
};

const normalizeNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOptionalNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeNullableNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

watch(createOpen, (open) => {
  if (open) {
    createError.value = "";
    return;
  }
  createWorking.value = false;
  createError.value = "";
  resetCreate();
});

watch(editOpen, (open) => {
  if (open) {
    editError.value = "";
    return;
  }
  editWorking.value = false;
  editError.value = "";
  editingId.value = null;
});

watch(importOpen, (open) => {
  if (open) {
    importError.value = "";
    return;
  }
  importWorking.value = false;
  importError.value = "";
  importPayload.value = "";
  importReplace.value = true;
  importModelOverwrite.value = true;
});

const submitCreate = async () => {
  createError.value = "";
  if (!createForm.name.trim() || !createForm.baseUrl.trim()) {
    createError.value = t("providers.validation.required");
    return;
  }
  createWorking.value = true;
  try {
    const apiMode = supportsApiMode(createForm.protocol)
      ? createForm.apiMode
      : undefined;
    await gatewayFetch("/admin/providers", {
      method: "POST",
      body: {
        name: createForm.name.trim(),
        protocol: createForm.protocol,
        baseUrl: createForm.baseUrl.trim(),
        apiKey: createForm.apiKey.trim(),
        apiMode,
        codexTransform: createForm.codexTransform,
        healthCheckModel: normalizeOptionalText(createForm.healthCheckModel),
        balance: normalizeOptionalNumber(createForm.balance),
        inputPrice: normalizeNullableNumber(createForm.inputPrice),
        outputPrice: normalizeNullableNumber(createForm.outputPrice),
        isActive: createForm.isActive,
        priority: normalizeNumber(createForm.priority, 1),
      },
    });
    createOpen.value = false;
    resetCreate();
    await refresh();
  } catch (err) {
    createError.value = t("providers.error.create");
  } finally {
    createWorking.value = false;
  }
};

const testCreateProvider = async () => {
  if (!canTestCreate.value) return;
  createTestResult.value = null;
  createTestWorking.value = true;
  try {
    const apiMode = supportsApiMode(createForm.protocol)
      ? createForm.apiMode
      : undefined;
    const res = await gatewayFetch<{
      ok: boolean;
      latencyMs?: number;
      model?: string;
      errorType?: string;
      message?: string;
    }>("/admin/providers/test", {
      method: "POST",
      query: { model: testModel.value.trim() || undefined },
      body: {
        name: createForm.name.trim() || undefined,
        protocol: createForm.protocol,
        baseUrl: createForm.baseUrl.trim(),
        apiKey: createForm.apiKey.trim(),
        apiMode,
        codexTransform: createForm.codexTransform,
        healthCheckModel: normalizeOptionalText(createForm.healthCheckModel),
      },
    });
    createTestResult.value = {
      ok: res.ok,
      latencyMs: res.latencyMs,
      errorType: res.errorType,
    };
  } catch {
    createTestResult.value = { ok: false, errorType: "unknown" };
  } finally {
    createTestWorking.value = false;
    setTimeout(() => {
      createTestResult.value = null;
    }, 8000);
  }
};

const submitEdit = async () => {
  if (!editingId.value) return;
  editError.value = "";
  editWorking.value = true;
  try {
    const apiMode = supportsApiMode(editForm.protocol)
      ? editForm.apiMode
      : undefined;
    await gatewayFetch(`/admin/providers/${editingId.value}`, {
      method: "PATCH",
      body: {
        name: editForm.name.trim(),
        protocol: editForm.protocol,
        baseUrl: editForm.baseUrl.trim(),
        apiKey: editForm.apiKey.trim(),
        apiMode,
        codexTransform: editForm.codexTransform,
        healthCheckModel: normalizeOptionalText(editForm.healthCheckModel),
        balance: normalizeOptionalNumber(editForm.balance),
        inputPrice: normalizeNullableNumber(editForm.inputPrice),
        outputPrice: normalizeNullableNumber(editForm.outputPrice),
        isActive: editForm.isActive,
        priority: normalizeNumber(editForm.priority, 1),
      },
    });
    editOpen.value = false;
    editingId.value = null;
    await refresh();
  } catch (err) {
    editError.value = t("providers.error.update");
  } finally {
    editWorking.value = false;
  }
};

const submitDelete = async () => {
  if (!deleteTarget.value) return;
  deleteError.value = "";
  deleteWorking.value = true;
  try {
    await gatewayFetch(`/admin/providers/${deleteTarget.value.id}`, {
      method: "DELETE",
    });
    closeDelete();
    await refresh();
  } catch (err) {
    deleteError.value = t("providers.error.delete");
  } finally {
    deleteWorking.value = false;
  }
};

const exportConfig = async () => {
  exportError.value = "";
  exportWorking.value = true;
  try {
    const payload = await gatewayFetch("/admin/config/export");
    const content = JSON.stringify(payload, null, 2);
    if (typeof window !== "undefined") {
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lumina-config-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    exportError.value = t("providers.config.exportError");
  } finally {
    exportWorking.value = false;
  }
};

const submitImport = async () => {
  importError.value = "";
  let payload: unknown;
  try {
    payload = JSON.parse(importPayload.value || "{}");
  } catch (err) {
    importError.value = t("providers.config.importInvalid");
    return;
  }

  importWorking.value = true;
  try {
    await gatewayFetch("/admin/config/import", {
      method: "POST",
      body: {
        ...(payload as Record<string, unknown>),
        mode: importReplace.value ? "replace" : "merge",
        modelConflictPolicy: importModelOverwrite.value ? "overwrite" : "skip",
      },
    });
    importOpen.value = false;
    await Promise.all([refresh(), refreshFailureStats()]);
  } catch (err) {
    importError.value = t("providers.config.importError");
  } finally {
    importWorking.value = false;
  }
};

const testProvider = async (provider: Provider) => {
  testingId.value = provider.id;
  testResults.delete(provider.id);
  try {
    const res = await gatewayFetch<{
      ok: boolean;
      latencyMs?: number;
      model?: string;
      errorType?: string;
      message?: string;
    }>(`/admin/providers/${provider.id}/test`, {
      method: "POST",
      query: { model: testModel.value.trim() || undefined },
    });
    testResults.set(provider.id, res);
  } catch {
    testResults.set(provider.id, { ok: false, errorType: "unknown" });
  } finally {
    testingId.value = null;
    setTimeout(() => testResults.delete(provider.id), 8000);
  }
};

const checkHealth = async () => {
  healthWorking.value = true;
  try {
    await gatewayFetch("/admin/providers/health", {
      method: "POST",
      query: { model: testModel.value.trim() || undefined },
    });
    await Promise.all([refresh(), refreshFailureStats()]);
  } catch {
    // silent: surface via refresh error state if needed
  } finally {
    healthWorking.value = false;
  }
};

const testResultLabel = (result: { ok: boolean; latencyMs?: number; errorType?: string }) => {
  if (result.ok) return t("providers.test.success", { latency: result.latencyMs ?? 0 });
  const map: Record<string, string> = {
    model_not_found: t("providers.test.modelNotFound"),
    auth: t("providers.test.authError"),
    quota: t("providers.test.quotaError"),
    rate_limit: t("providers.test.rateLimitError"),
    server: t("providers.test.serverError"),
    network: t("providers.test.networkError"),
  };
  return map[result.errorType ?? ""] ?? t("providers.test.unknownError");
};

const recoveryReasonLabel = (reason?: string | null) => {
  const map: Record<string, string> = {
    quota: t("providers.failures.quota"),
    rate_limit: t("providers.failures.rate_limit"),
    server: t("providers.failures.server"),
    auth: t("providers.failures.auth"),
    model_not_found: t("providers.failures.model_not_found"),
    network: t("providers.failures.network"),
    unknown: t("providers.failures.unknown"),
  };
  return map[reason ?? ""] ?? t("providers.failures.unknown");
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toLocaleString();
};

const recoverySummary = (provider: Provider) => {
  const recovery = provider.recovery;
  if (!recovery) return "";
  return t("providers.recovery.summary", {
    reason: recoveryReasonLabel(recovery.triggerErrorType),
    model: recovery.probeModel,
    time: formatTimestamp(recovery.nextProbeAt),
  });
};

const recoveryLastResult = (provider: Provider) => {
  const recovery = provider.recovery;
  if (!recovery?.lastProbeAt) return "";
  return t("providers.recovery.lastResult", {
    reason: recoveryReasonLabel(recovery.lastProbeErrorType),
    time: formatTimestamp(recovery.lastProbeAt),
  });
};

const recoveryTone = () => "bg-amber-100 text-amber-700";

const healthLabel = (provider: Provider) => {
  const status = provider.healthStatus ?? "unknown";
  if (status === "healthy") return t("providers.health.healthy");
  if (status === "unhealthy") return t("providers.health.unhealthy");
  return t("providers.health.unknown");
};

const healthTone = (provider: Provider) => {
  const status = provider.healthStatus ?? "unknown";
  if (status === "healthy") return "bg-emerald-100 text-emerald-700";
  if (status === "unhealthy") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-600";
};

const codexModeLabel = (provider: Provider) =>
  provider.codexTransform
    ? t("providers.codex.transform")
    : t("providers.codex.passthrough");

const codexModeTooltip = (provider: Provider) =>
  provider.codexTransform
    ? t("providers.codex.tooltip.transform")
    : t("providers.codex.tooltip.passthrough");

const codexModeIconTone = (provider: Provider) =>
  provider.codexTransform
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-sky-200 bg-sky-50 text-sky-700";

const refreshAll = async () => {
  await Promise.all([refresh(), refreshFailureStats()]);
};
</script>

<template>
  <section class="space-y-4 md:space-y-5">
    <PageHeader
      :eyebrow="$t('nav.providers')"
      :title="$t('providers.title')"
      :intro="$t('providers.intro')"
    >
      <template #actions>
        <UButton
          class="action-press"
          variant="outline"
          :loading="exportWorking"
          @click="exportConfig"
        >
          {{ $t("providers.config.export") }}
        </UButton>
        <UButton
          class="action-press"
          variant="outline"
          @click="importOpen = true"
        >
          {{ $t("providers.config.import") }}
        </UButton>
        <UButton class="action-press" color="primary" @click="createOpen = true">
          {{ $t("providers.add") }}
        </UButton>
      </template>
      <template #meta>
        <p v-if="exportError">{{ exportError }}</p>
      </template>
    </PageHeader>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("providers.roster") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("providers.rosterHint") }}
          </p>
          <p class="section-shell__note">
            {{ $t("providers.rosterNote") }}
          </p>
          <div class="mt-4">
            <div class="text-xs uppercase tracking-[0.25em] text-slate-400">
              {{ $t("providers.failures.title") }}
            </div>
            <div class="summary-strip mt-3">
              <span
                v-for="item in failureSummary"
                :key="item.key"
                class="summary-pill"
              >
                <span class="summary-pill__label">{{ item.label }}</span>
                <span class="summary-pill__value">{{ item.value }}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="w-full max-w-sm space-y-3 lg:max-w-[22rem]">
          <div class="radius-card border border-slate-200/70 bg-slate-50/80 p-3.5">
            <UFormGroup
              :label="$t('providers.testModel.label')"
              :help="$t('providers.testModel.help')"
            >
              <UInput
                v-model="testModel"
                :placeholder="$t('providers.testModel.placeholder')"
                class="w-full"
              />
            </UFormGroup>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              class="action-press"
              variant="outline"
              :loading="healthWorking"
              @click="checkHealth"
            >
              {{ $t("providers.health.check") }}
            </UButton>
            <UButton class="action-press" variant="outline" @click="refreshAll">
              {{ $t("providers.refresh") }}
            </UButton>
          </div>
          <p class="text-xs text-slate-500">
            {{ $t("providers.recovery.hint") }}
          </p>
        </div>
      </div>

      <div class="section-shell__body pt-0 md:pt-0">
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
            {{ $t("providers.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("providers.errorHint") }}
          </p>
        </div>

        <div
          v-else-if="empty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            {{ $t("providers.emptyTitle") }}
          </div>
          <p class="text-sm text-slate-500 mt-2">
            {{ $t("providers.emptyHint") }}
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-0 text-sm md:min-w-[920px]">
            <thead class="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("providers.table.name") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("providers.table.protocol") }}
                </th>
                <th class="hidden py-2 text-left font-medium lg:table-cell">
                  {{ $t("providers.table.balance") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("providers.table.priority") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("providers.table.health") }}
                </th>
                <th class="hidden py-2 text-left font-medium md:table-cell">
                  {{ $t("providers.table.status") }}
                </th>
                <th class="py-2 text-right font-medium">
                  {{ $t("providers.table.actions") }}
                </th>
              </tr>
            </thead>
          <tbody class="[&_tr+tr_td]:pt-1 md:[&_tr+tr_td]:pt-1.5">
              <template v-for="(provider, index) in providers" :key="provider.id">
                <tr
                  class="group border-b border-slate-200/50 staggered hover:bg-slate-50/70"
                  :style="{ '--index': index }"
                >
                  <td class="py-2 pr-4 align-middle">
                    <div class="flex min-h-[3.25rem] flex-col justify-center">
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="font-medium text-slate-900">{{ provider.name }}</div>
                        <span
                          v-if="testResults.has(provider.id)"
                          class="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                          :class="testResults.get(provider.id)?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'"
                        >
                          {{ testResultLabel(testResults.get(provider.id)!) }}
                        </span>
                      </div>
                      <div class="mt-0.5 flex max-w-[30rem] items-end gap-2 text-xs text-slate-500">
                        <span class="min-w-0 break-all">{{ provider.baseUrl }}</span>
                        <span
                          :title="codexModeTooltip(provider)"
                          :aria-label="codexModeTooltip(provider)"
                          class="inline-flex h-5 w-5 shrink-0 self-end cursor-help items-center justify-center rounded-md border"
                          :class="codexModeIconTone(provider)"
                        >
                          <svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5" aria-hidden="true">
                            <path
                              d="M7.25 6.5 4.5 10l2.75 3.5M12.75 6.5 15.5 10l-2.75 3.5M11 4.5 9 15.5"
                              stroke="currentColor"
                              stroke-width="1.6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </span>
                      </div>
                      <div class="mt-1 flex flex-wrap gap-1.5 md:hidden">
                        <span class="summary-pill">
                          <span class="summary-pill__label">{{ provider.protocol }}</span>
                        </span>
                        <span class="summary-pill">
                          <span class="summary-pill__label">P{{ provider.priority }}</span>
                        </span>
                        <span class="summary-pill" :class="healthTone(provider)">
                          <span class="summary-pill__label">{{ healthLabel(provider) }}</span>
                        </span>
                        <span v-if="provider.recovery" class="summary-pill" :class="recoveryTone()">
                          <span class="summary-pill__label">{{ $t("providers.recovery.badge") }}</span>
                        </span>
                        <span
                          class="summary-pill"
                          :class="provider.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'"
                        >
                          <span class="summary-pill__label">
                            {{ provider.isActive ? $t("providers.status.active") : $t("providers.status.paused") }}
                          </span>
                        </span>
                      </div>
                    </div>
                  </td>
                <td class="hidden py-2 pr-4 align-middle text-slate-600 capitalize md:table-cell">
                  {{ provider.protocol }}
                </td>
                <td class="hidden py-2 pr-4 align-middle mono-numbers text-slate-900 lg:table-cell">
                  {{ provider.balance.toFixed(4) }}
                </td>
                <td class="hidden py-2 pr-4 align-middle mono-numbers text-slate-900 md:table-cell">
                  {{ provider.priority }}
                </td>
                <td class="hidden py-2 align-middle md:table-cell">
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      :class="healthTone(provider)"
                    >
                      {{ healthLabel(provider) }}
                    </span>
                    <span
                      v-if="provider.recovery"
                      class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      :class="recoveryTone()"
                    >
                      {{ $t("providers.recovery.badge") }}
                    </span>
                  </div>
                </td>
                <td class="hidden py-2 align-middle md:table-cell">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    :class="
                      provider.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    "
                  >
                    {{
                      provider.isActive
                        ? $t("providers.status.active")
                        : $t("providers.status.paused")
                    }}
                  </span>
                </td>
                <td class="py-2 align-middle">
                  <div class="flex flex-wrap justify-start gap-1.5 md:justify-end">
                    <UButton
                      class="action-press"
                      size="xs"
                      variant="outline"
                      :loading="testingId === provider.id"
                      @click="testProvider(provider)"
                    >
                      {{ $t("providers.action.test") }}
                    </UButton>
                    <UButton
                      class="action-press"
                      size="xs"
                      variant="outline"
                      @click="openEdit(provider)"
                    >
                      {{ $t("providers.action.edit") }}
                    </UButton>
                    <UButton
                      class="action-press text-rose-600 hover:text-rose-700"
                      size="xs"
                      variant="outline"
                      @click="openDelete(provider)"
                    >
                      {{ $t("providers.action.delete") }}
                    </UButton>
                  </div>
                </td>
                </tr>
                <tr v-if="provider.recovery" class="border-b border-slate-200/50">
                  <td colspan="7" class="pb-3 pt-0">
                    <div class="rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-800">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                          {{ $t("providers.recovery.badge") }}
                        </span>
                        <span class="text-amber-900">{{ recoverySummary(provider) }}</span>
                      </div>
                      <div v-if="provider.recovery.lastProbeAt" class="mt-1 text-amber-700">
                        {{ recoveryLastResult(provider) }}
                      </div>
                      <div v-if="provider.recovery.lastProbeMessage" class="mt-1 break-all text-[11px] text-amber-700/70">
                        {{ provider.recovery.lastProbeMessage }}
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <UModal v-model:open="createOpen">
      <template #content>
        <div class="surface radius-panel max-h-[85vh] overflow-y-auto p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.create.title") }}
            </div>
            <div class="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              {{ $t("providers.create.subtitle") }}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <UFormGroup
              :label="$t('providers.form.name')"
              :help="$t('providers.form.help.name')"
            >
              <UInput
                v-model="createForm.name"
                :placeholder="$t('providers.form.placeholder.name')"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.protocol')"
              :help="$t('providers.form.help.protocol')"
            >
              <USelect
                v-model="createForm.protocol"
                :items="protocolOptions"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              v-if="supportsApiMode(createForm.protocol)"
              :label="$t('providers.form.apiMode')"
              :help="$t('providers.form.help.apiMode')"
            >
              <USelect
                v-model="createForm.apiMode"
                :items="apiModeOptions"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.codexTransform')"
              :help="$t('providers.form.help.codexTransform')"
            >
              <USwitch v-model="createForm.codexTransform" />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.baseUrl')"
              :help="$t('providers.form.help.baseUrl')"
            >
              <UInput
                v-model="createForm.baseUrl"
                :placeholder="$t('providers.form.placeholder.baseUrl')"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.apiKey')"
              :help="$t('providers.form.help.apiKey')"
            >
              <UInput
                v-model="createForm.apiKey"
                type="password"
                :placeholder="$t('providers.form.placeholder.apiKey')"
                class="w-full"
              />
            </UFormGroup>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 md:p-4">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 text-left"
              @click="createAdvancedOpen = !createAdvancedOpen"
            >
              <div>
                <div class="text-sm font-medium text-slate-900">
                  {{ $t("providers.advanced.title") }}
                </div>
                <p class="mt-1 text-xs text-slate-500">
                  {{ $t("providers.advanced.hint") }}
                </p>
              </div>
              <span class="text-xs font-medium text-slate-500">
                {{
                  createAdvancedOpen
                    ? $t("providers.advanced.hide")
                    : $t("providers.advanced.show")
                }}
              </span>
            </button>

            <div
              v-if="createAdvancedOpen"
              class="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200/70 pt-3 md:grid-cols-2 md:gap-4"
            >
              <UFormGroup
                :label="$t('providers.form.priority')"
                :help="$t('providers.form.help.priority')"
              >
                <UInput
                  v-model="createForm.priority"
                  type="number"
                  min="1"
                  step="1"
                  class="w-full"
                />
              </UFormGroup>
              <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-3 md:col-span-2">
                <div>
                  <div class="text-sm font-medium text-slate-900">
                    {{ $t("providers.pricing.title") }}
                  </div>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ $t("providers.pricing.hint") }}
                  </p>
                </div>

                <div
                  class="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200/70 pt-3 md:grid-cols-2 md:gap-4"
                >
                  <UFormGroup
                    :label="$t('providers.form.balance')"
                    :help="$t('providers.form.help.balanceCreate')"
                  >
                    <UInput
                      v-model="createForm.balance"
                      type="number"
                      min="0"
                      step="0.01"
                      class="w-full"
                    />
                  </UFormGroup>
                  <UFormGroup
                    :label="$t('providers.form.inputPrice')"
                    :help="$t('providers.form.help.inputPrice')"
                  >
                    <UInput
                      v-model="createForm.inputPrice"
                      type="number"
                      min="0"
                      step="0.0001"
                      class="w-full"
                    />
                  </UFormGroup>
                  <UFormGroup
                    :label="$t('providers.form.outputPrice')"
                    :help="$t('providers.form.help.outputPrice')"
                  >
                    <UInput
                      v-model="createForm.outputPrice"
                      type="number"
                      min="0"
                      step="0.0001"
                      class="w-full"
                    />
                  </UFormGroup>
                  <UFormGroup
                    :label="$t('providers.form.healthCheckModel')"
                    :help="$t('providers.form.help.healthCheckModel')"
                    class="md:col-span-2"
                  >
                    <UInput
                      v-model="createForm.healthCheckModel"
                      :placeholder="$t('providers.form.placeholder.healthCheckModel')"
                      class="w-full"
                    />
                  </UFormGroup>
                </div>
              </div>
            </div>
          </div>

          <p
            v-if="createTestResult"
            class="text-sm"
            :class="createTestResult.ok ? 'text-emerald-600' : 'text-rose-600'"
          >
            {{ testResultLabel(createTestResult) }}
          </p>
          <p v-if="createError" class="text-sm text-rose-600">
            {{ createError }}
          </p>

          <div class="flex flex-wrap items-center justify-end gap-3">
            <UButton class="action-press" variant="outline" @click="createOpen = false">
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              variant="outline"
              :loading="createTestWorking"
              :disabled="!canTestCreate || createWorking"
              @click="testCreateProvider"
            >
              {{ $t("providers.action.test") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="createWorking"
              @click="submitCreate"
            >
              {{ $t("providers.create.submit") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editOpen">
      <template #content>
        <div class="surface radius-panel max-h-[85vh] overflow-y-auto p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.edit.title") }}
            </div>
            <div class="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              {{ $t("providers.edit.subtitle") }}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <UFormGroup
              :label="$t('providers.form.name')"
              :help="$t('providers.form.help.name')"
            >
              <UInput
                v-model="editForm.name"
                :placeholder="$t('providers.form.placeholder.name')"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.protocol')"
              :help="$t('providers.form.help.protocol')"
            >
              <USelect
                v-model="editForm.protocol"
                :items="protocolOptions"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              v-if="supportsApiMode(editForm.protocol)"
              :label="$t('providers.form.apiMode')"
              :help="$t('providers.form.help.apiMode')"
            >
              <USelect
                v-model="editForm.apiMode"
                :items="apiModeOptions"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.codexTransform')"
              :help="$t('providers.form.help.codexTransform')"
            >
              <USwitch v-model="editForm.codexTransform" />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.baseUrl')"
              :help="$t('providers.form.help.baseUrl')"
            >
              <UInput
                v-model="editForm.baseUrl"
                :placeholder="$t('providers.form.placeholder.baseUrl')"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.apiKey')"
              :help="$t('providers.form.help.apiKey')"
            >
              <UInput
                v-model="editForm.apiKey"
                type="password"
                :placeholder="$t('providers.form.placeholder.apiKey')"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.priority')"
              :help="$t('providers.form.help.priority')"
            >
              <UInput
                v-model="editForm.priority"
                type="number"
                min="1"
                step="1"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup
              :label="$t('providers.form.active')"
              :help="$t('providers.form.help.active')"
            >
              <USwitch v-model="editForm.isActive" />
            </UFormGroup>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 md:p-4">
            <div>
              <div class="text-sm font-medium text-slate-900">
                {{ $t("providers.pricing.title") }}
              </div>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("providers.pricing.hint") }}
              </p>
            </div>

            <div
              class="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200/70 pt-3 md:grid-cols-2 md:gap-4"
            >
              <UFormGroup
                :label="$t('providers.form.balance')"
                :help="$t('providers.form.help.balanceEdit')"
              >
                <UInput
                  v-model="editForm.balance"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full"
                />
              </UFormGroup>
              <UFormGroup
                :label="$t('providers.form.inputPrice')"
                :help="$t('providers.form.help.inputPrice')"
              >
                <UInput
                  v-model="editForm.inputPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  class="w-full"
                />
              </UFormGroup>
              <UFormGroup
                :label="$t('providers.form.outputPrice')"
                :help="$t('providers.form.help.outputPrice')"
              >
                <UInput
                  v-model="editForm.outputPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  class="w-full"
                />
              </UFormGroup>
              <UFormGroup
                :label="$t('providers.form.healthCheckModel')"
                :help="$t('providers.form.help.healthCheckModel')"
                class="md:col-span-2"
              >
                <UInput
                  v-model="editForm.healthCheckModel"
                  :placeholder="$t('providers.form.placeholder.healthCheckModel')"
                  class="w-full"
                />
              </UFormGroup>
            </div>
          </div>

          <p v-if="editError" class="text-sm text-rose-600">
            {{ editError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton class="action-press" variant="outline" @click="editOpen = false">
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="editWorking"
              @click="submitEdit"
            >
              {{ $t("providers.edit.submit") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen">
      <template #content>
        <div class="surface radius-panel p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.delete.title") }}
            </div>
            <div class="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              {{ deleteTarget?.name ?? "" }}
            </div>
            <p class="mt-2 text-sm text-slate-600">
              {{ $t("providers.delete.subtitle") }}
            </p>
            <p class="mt-1 text-xs text-rose-600">
              {{ $t("providers.delete.warning") }}
            </p>
          </div>

          <div
            v-if="deleteTarget"
            class="radius-soft border border-slate-200/60 p-3"
          >
            <div class="text-sm font-medium text-slate-900">
              {{ deleteTarget.name }}
            </div>
            <div class="text-xs text-slate-500">
              {{ deleteTarget.baseUrl }}
            </div>
          </div>

          <p v-if="deleteError" class="text-sm text-rose-600">
            {{ deleteError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton class="action-press" variant="outline" @click="closeDelete">
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press bg-rose-600 text-white hover:bg-rose-700"
              :loading="deleteWorking"
              @click="submitDelete"
            >
              {{ $t("providers.delete.confirm") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="importOpen">
      <template #content>
        <div class="surface radius-panel p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.config.importTitle") }}
            </div>
            <p class="mt-2 text-sm text-slate-600">
              {{ $t("providers.config.importSubtitle") }}
            </p>
          </div>

          <div class="space-y-2">
            <div class="text-xs uppercase tracking-[0.2em] text-slate-500">
              {{ $t("providers.config.importLabel") }}
            </div>
            <textarea
              v-model="importPayload"
              class="w-full min-h-[180px] radius-card border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
              :placeholder="$t('providers.config.importPlaceholder')"
            ></textarea>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input
              v-model="importReplace"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>{{ $t("providers.config.replace") }}</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input
              v-model="importModelOverwrite"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>{{ $t("providers.config.modelOverwrite") }}</span>
          </label>

          <p v-if="importError" class="text-sm text-rose-600">
            {{ importError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton
              class="action-press"
              variant="outline"
              @click="importOpen = false"
            >
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="importWorking"
              @click="submitImport"
            >
              {{ $t("providers.config.importSubmit") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

  </section>
</template>
