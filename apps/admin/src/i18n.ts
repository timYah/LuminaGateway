import { createI18n } from "vue-i18n";

export const localeStorageKey = "lumina-admin-locale";

const messages = {
  en: {
    app: {
      brand: "Lumina Gateway",
      console: "Admin Console",
      tagline:
        "Manage providers, balances, and usage activity with a single view.",
      language: "Language",
      languageOptions: {
        en: "English",
        zh: "简体中文",
      },
    },
    nav: {
      providers: "Providers",
      usage: "Usage",
    },
    apiKey: {
      session: "Session",
      stored: "API key stored for this browser.",
      clear: "Clear key",
      secureAccess: "Secure Access",
      connect: "Connect the gateway",
      description:
        "Enter the gateway API key to unlock provider and usage management. The key is stored locally in this browser.",
      label: "Gateway API key",
      help: "Paste the value of GATEWAY_API_KEY from the backend environment.",
      required: "API key is required.",
      save: "Save key",
      localStorage: "Stored in local storage.",
    },
    providers: {
      title: "Balance-aware routing control",
      intro:
        "Review provider health, update balances, and keep routing priorities aligned with your account strategy.",
      add: "Add provider",
      roster: "Provider roster",
      rosterHint: "Changes apply immediately to routing decisions.",
      refresh: "Refresh list",
      errorTitle: "Provider list failed to load.",
      errorHint: "Verify the API key and gateway URL, then refresh.",
      emptyTitle: "No providers configured yet.",
      emptyHint: "Add a provider to start routing traffic through the gateway.",
      table: {
        name: "Name",
        protocol: "Protocol",
        balance: "Balance",
        priority: "Priority",
        status: "Status",
        actions: "Actions",
      },
      status: {
        active: "Active",
        paused: "Paused",
      },
      action: {
        edit: "Edit",
      },
      create: {
        title: "New provider",
        subtitle: "Add a routing target",
        submit: "Create provider",
      },
      edit: {
        title: "Provider update",
        subtitle: "Adjust routing inputs",
        submit: "Save changes",
      },
      form: {
        name: "Name",
        protocol: "Protocol",
        baseUrl: "Base URL",
        apiKey: "API key",
        balance: "Balance",
        priority: "Priority",
        active: "Active",
        help: {
          name: "Short label used in the routing list.",
          protocol: "Provider API dialect.",
          baseUrl:
            "Root URL for the provider endpoint (OpenAI-compatible providers like new-api use https://host/v1).",
          apiKey: "Stored for upstream authentication.",
          balanceCreate: "Initial balance in USD.",
          balanceEdit: "Current balance in USD.",
          priority: "Lower values take precedence.",
          active: "Active providers are eligible for routing.",
        },
        placeholder: {
          name: "Lumen Arc",
          baseUrl: "https://api.example.com",
          apiKey: "sk-live-...",
        },
      },
      validation: {
        required: "Name and base URL are required.",
      },
      error: {
        create: "Create failed. Check the inputs and try again.",
        update: "Update failed. Check the inputs and try again.",
      },
      cancel: "Cancel",
    },
    usage: {
      title: "Token flow and cost clarity",
      intro:
        "Filter usage logs by provider, model, or time window to reconcile spend across the gateway.",
      refresh: "Refresh usage",
      filters: "Filters",
      apply: "Apply filters",
      hint: "Requests use the current offset and limit values.",
      log: "Usage log",
      logHint: "Sorted by newest entries first.",
      previous: "Previous",
      next: "Next",
      errorTitle: "Usage data failed to load.",
      errorHint: "Verify the API key and filters, then refresh.",
      emptyTitle: "No usage records match the current filters.",
      emptyHint: "Adjust the filters or check again after new requests.",
      table: {
        time: "Time",
        provider: "Provider",
        model: "Model",
        input: "Input",
        output: "Output",
        cost: "Cost",
      },
      form: {
        provider: "Provider",
        modelSlug: "Model slug",
        startDate: "Start date",
        endDate: "End date",
        limit: "Limit",
        offset: "Offset",
        help: {
          provider: "Filter by provider ID.",
          modelSlug: "Exact model slug value.",
          startDate: "Inclusive, local time.",
          endDate: "Inclusive, local time.",
          limit: "Rows per request.",
          offset: "Zero-based row offset.",
        },
        placeholder: {
          modelSlug: "gpt-4o",
        },
      },
    },
    common: {
      allProviders: "All providers",
    },
  },
  zh: {
    app: {
      brand: "Lumina Gateway",
      console: "Admin Console",
      tagline:
        "Manage providers, balances, and usage activity with a single view.",
      language: "Language",
      languageOptions: {
        en: "English",
        zh: "简体中文",
      },
    },
    nav: {
      providers: "Providers",
      usage: "Usage",
    },
    apiKey: {
      session: "Session",
      stored: "API key stored for this browser.",
      clear: "Clear key",
      secureAccess: "Secure Access",
      connect: "Connect the gateway",
      description:
        "Enter the gateway API key to unlock provider and usage management. The key is stored locally in this browser.",
      label: "Gateway API key",
      help: "Paste the value of GATEWAY_API_KEY from the backend environment.",
      required: "API key is required.",
      save: "Save key",
      localStorage: "Stored in local storage.",
    },
    providers: {
      title: "Balance-aware routing control",
      intro:
        "Review provider health, update balances, and keep routing priorities aligned with your account strategy.",
      add: "Add provider",
      roster: "Provider roster",
      rosterHint: "Changes apply immediately to routing decisions.",
      refresh: "Refresh list",
      errorTitle: "Provider list failed to load.",
      errorHint: "Verify the API key and gateway URL, then refresh.",
      emptyTitle: "No providers configured yet.",
      emptyHint: "Add a provider to start routing traffic through the gateway.",
      table: {
        name: "Name",
        protocol: "Protocol",
        balance: "Balance",
        priority: "Priority",
        status: "Status",
        actions: "Actions",
      },
      status: {
        active: "Active",
        paused: "Paused",
      },
      action: {
        edit: "Edit",
      },
      create: {
        title: "New provider",
        subtitle: "Add a routing target",
        submit: "Create provider",
      },
      edit: {
        title: "Provider update",
        subtitle: "Adjust routing inputs",
        submit: "Save changes",
      },
      form: {
        name: "Name",
        protocol: "Protocol",
        baseUrl: "Base URL",
        apiKey: "API key",
        balance: "Balance",
        priority: "Priority",
        active: "Active",
        help: {
          name: "Short label used in the routing list.",
          protocol: "Provider API dialect.",
          baseUrl:
            "Root URL for the provider endpoint (OpenAI-compatible providers like new-api use https://host/v1).",
          apiKey: "Stored for upstream authentication.",
          balanceCreate: "Initial balance in USD.",
          balanceEdit: "Current balance in USD.",
          priority: "Lower values take precedence.",
          active: "Active providers are eligible for routing.",
        },
        placeholder: {
          name: "Lumen Arc",
          baseUrl: "https://api.example.com",
          apiKey: "sk-live-...",
        },
      },
      validation: {
        required: "Name and base URL are required.",
      },
      error: {
        create: "Create failed. Check the inputs and try again.",
        update: "Update failed. Check the inputs and try again.",
      },
      cancel: "Cancel",
    },
    usage: {
      title: "Token flow and cost clarity",
      intro:
        "Filter usage logs by provider, model, or time window to reconcile spend across the gateway.",
      refresh: "Refresh usage",
      filters: "Filters",
      apply: "Apply filters",
      hint: "Requests use the current offset and limit values.",
      log: "Usage log",
      logHint: "Sorted by newest entries first.",
      previous: "Previous",
      next: "Next",
      errorTitle: "Usage data failed to load.",
      errorHint: "Verify the API key and filters, then refresh.",
      emptyTitle: "No usage records match the current filters.",
      emptyHint: "Adjust the filters or check again after new requests.",
      table: {
        time: "Time",
        provider: "Provider",
        model: "Model",
        input: "Input",
        output: "Output",
        cost: "Cost",
      },
      form: {
        provider: "Provider",
        modelSlug: "Model slug",
        startDate: "Start date",
        endDate: "End date",
        limit: "Limit",
        offset: "Offset",
        help: {
          provider: "Filter by provider ID.",
          modelSlug: "Exact model slug value.",
          startDate: "Inclusive, local time.",
          endDate: "Inclusive, local time.",
          limit: "Rows per request.",
          offset: "Zero-based row offset.",
        },
        placeholder: {
          modelSlug: "gpt-4o",
        },
      },
    },
    common: {
      allProviders: "All providers",
    },
  },
};

const defaultLocale = "en";
const resolveLocale = () => {
  if (typeof window === "undefined") return defaultLocale;
  const stored = window.localStorage.getItem(localeStorageKey);
  if (stored && Object.prototype.hasOwnProperty.call(messages, stored)) {
    return stored;
  }
  return defaultLocale;
};

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveLocale(),
  fallbackLocale: defaultLocale,
  messages,
});
