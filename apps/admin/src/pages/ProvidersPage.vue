<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

import { gatewayFetch, useGatewayFetch } from "../composables/useGatewayFetch";
import UFormGroup from "../components/UFormGroup.vue";

type Provider = {
  id: number;
  name: string;
  protocol: "openai" | "anthropic" | "google" | "new-api";
  baseUrl: string;
  apiKey: string;
  balance: number;
  isActive: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
};

type ProviderResponse = {
  providers: Provider[];
};

const { data, pending, error, refresh } = useGatewayFetch<ProviderResponse>(
  "/admin/providers"
);

const providers = computed(() => data.value?.providers ?? []);
const empty = computed(() => !pending.value && providers.value.length === 0);

const { t } = useI18n();

const protocolOptions = computed(() => [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google", value: "google" },
  { label: "New API", value: "new-api" },
]);

const createOpen = ref(false);
const editOpen = ref(false);
const working = ref(false);
const formError = ref("");
const editingId = ref<number | null>(null);

const createForm = reactive({
  name: "",
  protocol: "openai" as Provider["protocol"],
  baseUrl: "",
  apiKey: "",
  balance: "0",
  isActive: true,
  priority: "1",
});

const editForm = reactive({
  name: "",
  protocol: "openai" as Provider["protocol"],
  baseUrl: "",
  apiKey: "",
  balance: "0",
  isActive: true,
  priority: "1",
});

const resetCreate = () => {
  createForm.name = "";
  createForm.protocol = "openai";
  createForm.baseUrl = "";
  createForm.apiKey = "";
  createForm.balance = "0";
  createForm.isActive = true;
  createForm.priority = "1";
};

const openEdit = (provider: Provider) => {
  editingId.value = provider.id;
  editForm.name = provider.name;
  editForm.protocol = provider.protocol;
  editForm.baseUrl = provider.baseUrl;
  editForm.apiKey = provider.apiKey;
  editForm.balance = provider.balance.toString();
  editForm.isActive = provider.isActive;
  editForm.priority = provider.priority.toString();
  formError.value = "";
  editOpen.value = true;
};

const normalizeNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const submitCreate = async () => {
  formError.value = "";
  if (!createForm.name.trim() || !createForm.baseUrl.trim()) {
    formError.value = t("providers.validation.required");
    return;
  }
  working.value = true;
  try {
    await gatewayFetch("/admin/providers", {
      method: "POST",
      body: {
        name: createForm.name.trim(),
        protocol: createForm.protocol,
        baseUrl: createForm.baseUrl.trim(),
        apiKey: createForm.apiKey.trim(),
        balance: normalizeNumber(createForm.balance, 0),
        isActive: createForm.isActive,
        priority: normalizeNumber(createForm.priority, 1),
      },
    });
    createOpen.value = false;
    resetCreate();
    await refresh();
  } catch (err) {
    formError.value = t("providers.error.create");
  } finally {
    working.value = false;
  }
};

const submitEdit = async () => {
  if (!editingId.value) return;
  formError.value = "";
  working.value = true;
  try {
    await gatewayFetch(`/admin/providers/${editingId.value}`, {
      method: "PATCH",
      body: {
        name: editForm.name.trim(),
        protocol: editForm.protocol,
        baseUrl: editForm.baseUrl.trim(),
        apiKey: editForm.apiKey.trim(),
        balance: normalizeNumber(editForm.balance, 0),
        isActive: editForm.isActive,
        priority: normalizeNumber(editForm.priority, 1),
      },
    });
    editOpen.value = false;
    editingId.value = null;
    await refresh();
  } catch (err) {
    formError.value = t("providers.error.update");
  } finally {
    working.value = false;
  }
};
</script>

<template>
  <section class="space-y-5">
    <header
      class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            {{ $t("nav.providers") }}
          </div>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900">
            {{ $t("providers.title") }}
          </h1>
          <p class="mt-3 text-base text-slate-600 leading-relaxed max-w-[65ch]">
            {{ $t("providers.intro") }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UButton class="action-press" color="primary" @click="createOpen = true">
            {{ $t("providers.add") }}
          </UButton>
        </div>
      </header>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel divide-y divide-slate-200/60">
      <div class="flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <div>
          <div class="text-sm font-medium text-slate-900">
            {{ $t("providers.roster") }}
          </div>
          <p class="text-sm text-slate-500">
            {{ $t("providers.rosterHint") }}
          </p>
        </div>
        <UButton class="action-press" variant="outline" @click="refresh">
          {{ $t("providers.refresh") }}
        </UButton>
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
          <table class="min-w-[860px] w-full text-sm">
            <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.name") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.protocol") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.balance") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.priority") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.status") }}
                </th>
                <th class="py-2.5 text-left font-medium">
                  {{ $t("providers.table.actions") }}
                </th>
              </tr>
            </thead>
          <tbody>
              <tr
                v-for="(provider, index) in providers"
                :key="provider.id"
                class="border-b border-slate-200/50 staggered"
                :style="{ '--index': index }"
              >
                <td class="py-3">
                  <div class="font-medium text-slate-900">
                    {{ provider.name }}
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ provider.baseUrl }}
                  </div>
                </td>
                <td class="py-3 text-slate-600 capitalize">
                  {{ provider.protocol }}
                </td>
                <td class="py-3 mono-numbers text-slate-900">
                  {{ provider.balance.toFixed(4) }}
                </td>
                <td class="py-3 mono-numbers text-slate-900">
                  {{ provider.priority }}
                </td>
                <td class="py-3">
                  <span
                    class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
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
                <td class="py-3">
                  <UButton
                    class="action-press"
                    size="sm"
                    variant="outline"
                    @click="openEdit(provider)"
                  >
                    {{ $t("providers.action.edit") }}
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <UModal v-model:open="createOpen">
      <template #content>
        <div class="surface radius-panel p-6 md:p-7 space-y-5">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.create.title") }}
            </div>
            <div class="mt-2 text-2xl font-semibold text-slate-900">
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
            <UFormGroup
              :label="$t('providers.form.active')"
              :help="$t('providers.form.help.active')"
            >
              <USwitch v-model="createForm.isActive" />
            </UFormGroup>
          </div>

          <p v-if="formError" class="text-sm text-rose-600">
            {{ formError }}
          </p>

          <div class="flex items-center justify-between">
            <UButton class="action-press" variant="outline" @click="createOpen = false">
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="working"
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
        <div class="surface radius-panel p-6 md:p-7 space-y-5">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("providers.edit.title") }}
            </div>
            <div class="mt-2 text-2xl font-semibold text-slate-900">
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

          <p v-if="formError" class="text-sm text-rose-600">
            {{ formError }}
          </p>

          <div class="flex items-center justify-between">
            <UButton class="action-press" variant="outline" @click="editOpen = false">
              {{ $t("providers.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="working"
              @click="submitEdit"
            >
              {{ $t("providers.edit.submit") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
