<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { gatewayFetch, useGatewayFetch } from "../composables/useGatewayFetch";
import PageHeader from "../components/PageHeader.vue";
import UFormGroup from "../components/UFormGroup.vue";

type Provider = {
  id: number;
  name: string;
};

type ProviderResponse = {
  providers: Provider[];
};

type ModelPriority = {
  id: number;
  providerId: number;
  providerName?: string | null;
  modelSlug: string;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
};

type ModelPriorityResponse = {
  modelPriorities: ModelPriority[];
};

const { t } = useI18n();
const ALL_PROVIDERS = "all";

const filters = reactive({
  providerId: ALL_PROVIDERS,
  modelSlug: "",
});

const query = computed(() => {
  const payload: Record<string, string | number> = {};
  if (filters.providerId !== ALL_PROVIDERS) {
    payload.providerId = filters.providerId;
  }
  if (filters.modelSlug.trim()) payload.modelSlug = filters.modelSlug.trim();
  return payload;
});

const { data, pending, error, refresh } = useGatewayFetch<ModelPriorityResponse>(
  "/admin/model-priorities",
  { query }
);
const { data: providersData } = useGatewayFetch<ProviderResponse>("/admin/providers");

const providers = computed(() => providersData.value?.providers ?? []);
const modelPriorities = computed(() => data.value?.modelPriorities ?? []);
const empty = computed(() => !pending.value && modelPriorities.value.length === 0);

const providerFilterOptions = computed(() => [
  { label: t("common.allProviders"), value: ALL_PROVIDERS },
  ...providers.value.map((provider) => ({
    label: provider.name,
    value: provider.id.toString(),
  })),
]);

const providerOptions = computed(() =>
  providers.value.map((provider) => ({
    label: provider.name,
    value: provider.id.toString(),
  }))
);

const createOpen = ref(false);
const editOpen = ref(false);
const deleteOpen = ref(false);
const createWorking = ref(false);
const editWorking = ref(false);
const deleteWorking = ref(false);
const createError = ref("");
const editError = ref("");
const deleteError = ref("");
const editingId = ref<number | null>(null);
const deleteTarget = ref<ModelPriority | null>(null);

const createForm = reactive({
  providerId: "",
  modelSlug: "",
  priority: "1",
});

const editForm = reactive({
  providerId: "",
  modelSlug: "",
  priority: "1",
});

const resetCreate = () => {
  createForm.providerId = "";
  createForm.modelSlug = "";
  createForm.priority = "1";
};

const openEdit = (row: ModelPriority) => {
  editingId.value = row.id;
  editForm.providerId = row.providerId.toString();
  editForm.modelSlug = row.modelSlug;
  editForm.priority = row.priority.toString();
  editError.value = "";
  editOpen.value = true;
};

const openDelete = (row: ModelPriority) => {
  deleteTarget.value = row;
  deleteError.value = "";
  deleteOpen.value = true;
};

const closeDelete = () => {
  deleteTarget.value = null;
  deleteError.value = "";
  deleteOpen.value = false;
};

const normalizeNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const submitCreate = async () => {
  createError.value = "";
  if (!createForm.providerId || !createForm.modelSlug.trim()) {
    createError.value = t("modelPriorities.validation.required");
    return;
  }
  createWorking.value = true;
  try {
    await gatewayFetch("/admin/model-priorities", {
      method: "POST",
      body: {
        providerId: normalizeNumber(createForm.providerId),
        modelSlug: createForm.modelSlug.trim(),
        priority: normalizeNumber(createForm.priority, 1),
      },
    });
    createOpen.value = false;
    await refresh();
  } catch (err) {
    createError.value =
      err instanceof Error && err.message
        ? err.message
        : t("modelPriorities.error.create");
  } finally {
    createWorking.value = false;
  }
};

const submitEdit = async () => {
  if (!editingId.value) return;
  editError.value = "";
  editWorking.value = true;
  try {
    await gatewayFetch(`/admin/model-priorities/${editingId.value}`, {
      method: "PATCH",
      body: {
        providerId: normalizeNumber(editForm.providerId),
        modelSlug: editForm.modelSlug.trim(),
        priority: normalizeNumber(editForm.priority, 1),
      },
    });
    editOpen.value = false;
    editingId.value = null;
    await refresh();
  } catch (err) {
    editError.value =
      err instanceof Error && err.message
        ? err.message
        : t("modelPriorities.error.update");
  } finally {
    editWorking.value = false;
  }
};

const submitDelete = async () => {
  if (!deleteTarget.value) return;
  deleteError.value = "";
  deleteWorking.value = true;
  try {
    await gatewayFetch(`/admin/model-priorities/${deleteTarget.value.id}`, {
      method: "DELETE",
    });
    closeDelete();
    await refresh();
  } catch (err) {
    deleteError.value =
      err instanceof Error && err.message
        ? err.message
        : t("modelPriorities.error.delete");
  } finally {
    deleteWorking.value = false;
  }
};
</script>

<template>
  <section class="space-y-4 md:space-y-5">
    <PageHeader
      :eyebrow="$t('nav.modelPriorities')"
      :title="$t('modelPriorities.title')"
      :intro="$t('modelPriorities.intro')"
    >
      <template #actions>
        <UButton class="action-press" variant="outline" @click="refresh">
          {{ $t("modelPriorities.refresh") }}
        </UButton>
        <UButton class="action-press" color="primary" @click="createOpen = true">
          {{ $t("modelPriorities.add") }}
        </UButton>
      </template>
    </PageHeader>

    <div class="border-b border-slate-200/70"></div>

    <div class="surface radius-panel section-shell divide-y divide-slate-200/60">
      <div class="section-shell__header">
        <div class="section-shell__headline">
          <div class="section-shell__title">
            {{ $t("modelPriorities.roster") }}
          </div>
          <p class="section-shell__subtitle">
            {{ $t("modelPriorities.rosterHint") }}
          </p>
        </div>
        <div class="w-full max-w-sm space-y-3 lg:max-w-[22rem]">
          <div class="radius-card border border-slate-200/70 bg-slate-50/80 p-3.5">
            <UFormGroup
              :label="$t('modelPriorities.filters.provider')"
              :help="$t('modelPriorities.filters.help.provider')"
            >
              <USelect v-model="filters.providerId" :items="providerFilterOptions" />
            </UFormGroup>
            <UFormGroup
              class="mt-3"
              :label="$t('modelPriorities.filters.modelSlug')"
              :help="$t('modelPriorities.filters.help.modelSlug')"
            >
              <UInput
                v-model="filters.modelSlug"
                :placeholder="$t('modelPriorities.filters.placeholder.modelSlug')"
              />
            </UFormGroup>
          </div>
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
            {{ $t("modelPriorities.errorTitle") }}
          </div>
          <p class="text-sm text-rose-600">
            {{ $t("modelPriorities.errorHint") }}
          </p>
        </div>

        <div
          v-else-if="empty"
          class="radius-card border border-slate-200/60 p-5"
        >
          <div class="text-sm font-medium text-slate-800">
            {{ $t("modelPriorities.emptyTitle") }}
          </div>
          <p class="text-sm text-slate-500 mt-2">
            {{ $t("modelPriorities.emptyHint") }}
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-0 text-sm md:min-w-[780px]">
            <thead class="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <tr class="border-b border-slate-200/60">
                <th class="py-2 text-left font-medium">
                  {{ $t("modelPriorities.table.model") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("modelPriorities.table.provider") }}
                </th>
                <th class="py-2 text-left font-medium">
                  {{ $t("modelPriorities.table.priority") }}
                </th>
                <th class="py-2 text-right font-medium">
                  {{ $t("modelPriorities.table.actions") }}
                </th>
              </tr>
            </thead>
            <tbody class="[&_tr+tr_td]:pt-1 md:[&_tr+tr_td]:pt-1.5">
              <tr
                v-for="(row, index) in modelPriorities"
                :key="row.id"
                class="group border-b border-slate-200/50 staggered hover:bg-slate-50/70"
                :style="{ '--index': index }"
              >
                <td class="py-2 pr-4 align-middle">
                  <div class="font-medium text-slate-900">
                    {{ row.modelSlug }}
                  </div>
                </td>
                <td class="py-2 pr-4 align-middle text-slate-700">
                  {{ row.providerName || row.providerId }}
                </td>
                <td class="py-2 pr-4 align-middle text-slate-700">
                  {{ row.priority }}
                </td>
                <td class="py-2 text-right align-middle">
                  <div class="flex items-center justify-end gap-2">
                    <UButton
                      class="action-press"
                      size="xs"
                      variant="ghost"
                      @click="openEdit(row)"
                    >
                      {{ $t("modelPriorities.action.edit") }}
                    </UButton>
                    <UButton
                      class="action-press text-rose-600 hover:text-rose-700"
                      size="xs"
                      variant="ghost"
                      @click="openDelete(row)"
                    >
                      {{ $t("modelPriorities.action.delete") }}
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <UModal v-model:open="createOpen">
      <template #content>
        <div class="surface radius-panel p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("modelPriorities.create.title") }}
            </div>
            <p class="mt-2 text-sm text-slate-600">
              {{ $t("modelPriorities.create.subtitle") }}
            </p>
          </div>

          <div class="grid grid-cols-1 gap-3 md:gap-4">
            <UFormGroup :label="$t('modelPriorities.form.provider')">
              <USelect
                v-model="createForm.providerId"
                :items="providerOptions"
                class="w-full"
              />
            </UFormGroup>
          </div>

          <div
            class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] md:gap-4"
          >
            <UFormGroup
              :label="$t('modelPriorities.form.modelSlug')"
              :help="$t('modelPriorities.form.help.modelSlug')"
            >
              <UInput
                v-model="createForm.modelSlug"
                :placeholder="$t('modelPriorities.form.placeholder.modelSlug')"
                class="w-full"
              />
            </UFormGroup>

            <UFormGroup
              :label="$t('modelPriorities.form.priority')"
              :help="$t('modelPriorities.form.help.priority')"
            >
              <UInput v-model="createForm.priority" class="w-full" />
            </UFormGroup>
          </div>

          <p v-if="createError" class="text-sm text-rose-600">
            {{ createError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton
              class="action-press"
              variant="outline"
              @click="createOpen = false"
            >
              {{ $t("modelPriorities.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="createWorking"
              @click="submitCreate"
            >
              {{ $t("modelPriorities.create.submit") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editOpen">
      <template #content>
        <div class="surface radius-panel p-5 md:p-6 space-y-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              {{ $t("modelPriorities.edit.title") }}
            </div>
            <p class="mt-2 text-sm text-slate-600">
              {{ $t("modelPriorities.edit.subtitle") }}
            </p>
          </div>

          <div class="grid grid-cols-1 gap-3 md:gap-4">
            <UFormGroup :label="$t('modelPriorities.form.provider')">
              <USelect
                v-model="editForm.providerId"
                :items="providerOptions"
                class="w-full"
              />
            </UFormGroup>
          </div>

          <div
            class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] md:gap-4"
          >
            <UFormGroup
              :label="$t('modelPriorities.form.modelSlug')"
              :help="$t('modelPriorities.form.help.modelSlug')"
            >
              <UInput
                v-model="editForm.modelSlug"
                :placeholder="$t('modelPriorities.form.placeholder.modelSlug')"
                class="w-full"
              />
            </UFormGroup>

            <UFormGroup
              :label="$t('modelPriorities.form.priority')"
              :help="$t('modelPriorities.form.help.priority')"
            >
              <UInput v-model="editForm.priority" class="w-full" />
            </UFormGroup>
          </div>

          <p v-if="editError" class="text-sm text-rose-600">
            {{ editError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton
              class="action-press"
              variant="outline"
              @click="editOpen = false"
            >
              {{ $t("modelPriorities.cancel") }}
            </UButton>
            <UButton
              class="action-press"
              color="primary"
              :loading="editWorking"
              @click="submitEdit"
            >
              {{ $t("modelPriorities.edit.submit") }}
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
              {{ $t("modelPriorities.delete.title") }}
            </div>
            <p class="mt-2 text-sm text-slate-600">
              {{ $t("modelPriorities.delete.subtitle") }}
            </p>
          </div>

          <p v-if="deleteError" class="text-sm text-rose-600">
            {{ deleteError }}
          </p>

          <div class="flex items-center justify-end gap-2">
            <UButton class="action-press" variant="outline" @click="closeDelete">
              {{ $t("modelPriorities.cancel") }}
            </UButton>
            <UButton
              class="action-press bg-rose-600 text-white hover:bg-rose-700"
              :loading="deleteWorking"
              @click="submitDelete"
            >
              {{ $t("modelPriorities.delete.confirm") }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
