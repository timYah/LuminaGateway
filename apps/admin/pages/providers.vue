<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import { gatewayFetch, useGatewayFetch } from "~/composables/useGatewayFetch";

type Provider = {
  id: number;
  name: string;
  protocol: "openai" | "anthropic" | "google";
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

const protocolOptions = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google", value: "google" },
];

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
    formError.value = "Name and base URL are required.";
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
    formError.value = "Create failed. Check the inputs and try again.";
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
    formError.value = "Update failed. Check the inputs and try again.";
  } finally {
    working.value = false;
  }
};
</script>

<template>
  <section class="space-y-6">
    <div class="glass-panel rounded-3xl p-6 md:p-8">
      <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            Providers
          </div>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900">
            Balance-aware routing control
          </h1>
          <p class="mt-3 text-base text-slate-600 leading-relaxed max-w-[65ch]">
            Review provider health, update balances, and keep routing priorities
            aligned with your account strategy.
          </p>
        </div>
        <div class="flex items-start justify-end">
          <UButton class="action-press" color="primary" @click="createOpen = true">
            Add provider
          </UButton>
        </div>
      </div>
    </div>

    <div class="surface rounded-3xl p-6 md:p-8 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-slate-900">Provider roster</div>
          <p class="text-sm text-slate-500">
            Changes apply immediately to routing decisions.
          </p>
        </div>
        <UButton class="action-press" variant="outline" @click="refresh">
          Refresh list
        </UButton>
      </div>

      <div v-if="pending" class="space-y-3">
        <div class="h-10 rounded-xl skeleton"></div>
        <div class="h-10 rounded-xl skeleton"></div>
        <div class="h-10 rounded-xl skeleton"></div>
      </div>

      <div v-else-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <div class="text-sm font-medium text-rose-700">
          Provider list failed to load.
        </div>
        <p class="text-sm text-rose-600">
          Verify the API key and gateway URL, then refresh.
        </p>
      </div>

      <div v-else-if="empty" class="rounded-2xl border border-slate-200/60 p-6">
        <div class="text-sm font-medium text-slate-800">
          No providers configured yet.
        </div>
        <p class="text-sm text-slate-500 mt-2">
          Add a provider to start routing traffic through the gateway.
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-[860px] w-full text-sm">
          <thead class="text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr class="border-b border-slate-200/60">
              <th class="py-3 text-left font-medium">Name</th>
              <th class="py-3 text-left font-medium">Protocol</th>
              <th class="py-3 text-left font-medium">Balance</th>
              <th class="py-3 text-left font-medium">Priority</th>
              <th class="py-3 text-left font-medium">Status</th>
              <th class="py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(provider, index) in providers"
              :key="provider.id"
              class="border-b border-slate-200/50 staggered"
              :style="{ '--index': index }"
            >
              <td class="py-4">
                <div class="font-medium text-slate-900">
                  {{ provider.name }}
                </div>
                <div class="text-xs text-slate-500">{{ provider.baseUrl }}</div>
              </td>
              <td class="py-4 text-slate-600 capitalize">
                {{ provider.protocol }}
              </td>
              <td class="py-4 mono-numbers text-slate-900">
                {{ provider.balance.toFixed(4) }}
              </td>
              <td class="py-4 mono-numbers text-slate-900">
                {{ provider.priority }}
              </td>
              <td class="py-4">
                <span
                  class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                  :class="
                    provider.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  "
                >
                  {{ provider.isActive ? "Active" : "Paused" }}
                </span>
              </td>
              <td class="py-4">
                <UButton
                  class="action-press"
                  size="sm"
                  variant="outline"
                  @click="openEdit(provider)"
                >
                  Edit
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model="createOpen">
      <div class="surface rounded-3xl p-6 md:p-8 space-y-6">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            New provider
          </div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">
            Add a routing target
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormGroup label="Name" help="Short label used in the routing list.">
            <UInput v-model="createForm.name" placeholder="Lumen Arc" />
          </UFormGroup>
          <UFormGroup label="Protocol" help="Provider API dialect.">
            <USelect v-model="createForm.protocol" :options="protocolOptions" />
          </UFormGroup>
          <UFormGroup label="Base URL" help="Root URL for the provider endpoint.">
            <UInput v-model="createForm.baseUrl" placeholder="https://api.example.com" />
          </UFormGroup>
          <UFormGroup label="API key" help="Stored for upstream authentication.">
            <UInput v-model="createForm.apiKey" type="password" placeholder="sk-live-..." />
          </UFormGroup>
          <UFormGroup label="Balance" help="Initial balance in USD.">
            <UInput v-model="createForm.balance" type="number" min="0" step="0.01" />
          </UFormGroup>
          <UFormGroup label="Priority" help="Lower values take precedence.">
            <UInput v-model="createForm.priority" type="number" min="1" step="1" />
          </UFormGroup>
          <UFormGroup label="Active" help="Active providers are eligible for routing.">
            <USwitch v-model="createForm.isActive" />
          </UFormGroup>
        </div>

        <p v-if="formError" class="text-sm text-rose-600">
          {{ formError }}
        </p>

        <div class="flex items-center justify-between">
          <UButton class="action-press" variant="outline" @click="createOpen = false">
            Cancel
          </UButton>
          <UButton
            class="action-press"
            color="primary"
            :loading="working"
            @click="submitCreate"
          >
            Create provider
          </UButton>
        </div>
      </div>
    </UModal>

    <UModal v-model="editOpen">
      <div class="surface rounded-3xl p-6 md:p-8 space-y-6">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            Provider update
          </div>
          <div class="mt-2 text-2xl font-semibold text-slate-900">
            Adjust routing inputs
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormGroup label="Name" help="Short label used in the routing list.">
            <UInput v-model="editForm.name" placeholder="Lumen Arc" />
          </UFormGroup>
          <UFormGroup label="Protocol" help="Provider API dialect.">
            <USelect v-model="editForm.protocol" :options="protocolOptions" />
          </UFormGroup>
          <UFormGroup label="Base URL" help="Root URL for the provider endpoint.">
            <UInput v-model="editForm.baseUrl" placeholder="https://api.example.com" />
          </UFormGroup>
          <UFormGroup label="API key" help="Stored for upstream authentication.">
            <UInput v-model="editForm.apiKey" type="password" placeholder="sk-live-..." />
          </UFormGroup>
          <UFormGroup label="Balance" help="Current balance in USD.">
            <UInput v-model="editForm.balance" type="number" min="0" step="0.01" />
          </UFormGroup>
          <UFormGroup label="Priority" help="Lower values take precedence.">
            <UInput v-model="editForm.priority" type="number" min="1" step="1" />
          </UFormGroup>
          <UFormGroup label="Active" help="Active providers are eligible for routing.">
            <USwitch v-model="editForm.isActive" />
          </UFormGroup>
        </div>

        <p v-if="formError" class="text-sm text-rose-600">
          {{ formError }}
        </p>

        <div class="flex items-center justify-between">
          <UButton class="action-press" variant="outline" @click="editOpen = false">
            Cancel
          </UButton>
          <UButton
            class="action-press"
            color="primary"
            :loading="working"
            @click="submitEdit"
          >
            Save changes
          </UButton>
        </div>
      </div>
    </UModal>
  </section>
</template>
