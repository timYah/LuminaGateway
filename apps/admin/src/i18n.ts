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
      secureAccess: "Secure Access",
      connect: "Connect the gateway",
      description:
        "Enter the gateway API key to unlock provider and usage management. The key is stored locally in this browser.",
      label: "Gateway API key",
      help: "Paste the value of GATEWAY_API_KEY (without Bearer or variable name).",
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
      models: {
        title: "Model mappings",
        hint: "Map gateway model slugs to upstream names and pricing.",
        add: "Add mapping",
        errorTitle: "Model mappings failed to load.",
        errorHint: "Verify the API key and refresh.",
        emptyTitle: "No model mappings yet.",
        emptyHint: "Add a mapping to route requests to upstream models.",
        table: {
          provider: "Provider",
          slug: "Model slug",
          upstream: "Upstream name",
          inputPrice: "Input $/1M",
          outputPrice: "Output $/1M",
          actions: "Actions",
        },
        create: {
          title: "New model mapping",
          subtitle: "Map gateway slugs",
          submit: "Create mapping",
        },
        edit: {
          title: "Edit model mapping",
          subtitle: "Update routing pricing",
          submit: "Save changes",
        },
        form: {
          provider: "Provider",
          slug: "Model slug",
          upstreamName: "Upstream name",
          inputPrice: "Input price",
          outputPrice: "Output price",
          help: {
            provider: "Choose the provider this slug routes to.",
            slug: "Exact slug used by clients.",
            upstreamName: "Upstream model identifier.",
            inputPrice: "USD per 1M input tokens.",
            outputPrice: "USD per 1M output tokens.",
          },
          placeholder: {
            slug: "gpt-4o",
            upstreamName: "gpt-4o",
          },
        },
        validation: {
          required: "Provider, slug, and upstream name are required.",
        },
        error: {
          create: "Create failed. Check the inputs and try again.",
          update: "Update failed. Check the inputs and try again.",
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
      console: "管理控制台",
      tagline:
        "统一管理提供商、余额与用量活动。",
      language: "语言",
      languageOptions: {
        en: "English",
        zh: "简体中文",
      },
    },
    nav: {
      providers: "提供商",
      usage: "用量",
    },
    apiKey: {
      secureAccess: "安全访问",
      connect: "连接网关",
      description:
        "请输入网关 API key 以解锁提供商与用量管理。该 key 仅保存在本地浏览器。",
      label: "网关 API key",
      help: "仅粘贴 GATEWAY_API_KEY 的值，不要包含 Bearer 或变量名。",
      required: "API key 为必填。",
      save: "保存",
      localStorage: "存储在本地。",
    },
    providers: {
      title: "余额感知路由控制",
      intro:
        "查看提供商状态、更新余额，并保持路由优先级与策略一致。",
      add: "新增提供商",
      roster: "提供商列表",
      rosterHint: "变更将立即影响路由决策。",
      refresh: "刷新列表",
      errorTitle: "提供商列表加载失败。",
      errorHint: "请检查 API key 与网关地址后重试。",
      emptyTitle: "尚未配置提供商。",
      emptyHint: "添加提供商以开始路由。",
      table: {
        name: "名称",
        protocol: "协议",
        balance: "余额",
        priority: "优先级",
        status: "状态",
        actions: "操作",
      },
      status: {
        active: "启用",
        paused: "暂停",
      },
      action: {
        edit: "编辑",
      },
      create: {
        title: "新增提供商",
        subtitle: "添加路由目标",
        submit: "创建提供商",
      },
      edit: {
        title: "更新提供商",
        subtitle: "调整路由参数",
        submit: "保存变更",
      },
      form: {
        name: "名称",
        protocol: "协议",
        baseUrl: "基础 URL",
        apiKey: "API key",
        balance: "余额",
        priority: "优先级",
        active: "启用",
        help: {
          name: "用于路由列表的简短名称。",
          protocol: "提供商 API 协议类型。",
          baseUrl:
            "提供商接口根地址（new-api 等 OpenAI 兼容服务请使用 https://host/v1）。",
          apiKey: "用于上游鉴权的密钥。",
          balanceCreate: "初始余额（USD）。",
          balanceEdit: "当前余额（USD）。",
          priority: "数值越小优先级越高。",
          active: "启用的提供商可参与路由。",
        },
        placeholder: {
          name: "Lumen Arc",
          baseUrl: "https://api.example.com",
          apiKey: "sk-live-...",
        },
      },
      models: {
        title: "模型映射",
        hint: "将网关模型标识映射到上游名称与定价。",
        add: "新增映射",
        errorTitle: "模型映射加载失败。",
        errorHint: "请检查 API key 后重试。",
        emptyTitle: "尚未配置模型映射。",
        emptyHint: "添加映射以启用模型路由。",
        table: {
          provider: "提供商",
          slug: "模型标识",
          upstream: "上游名称",
          inputPrice: "输入 $/1M",
          outputPrice: "输出 $/1M",
          actions: "操作",
        },
        create: {
          title: "新增模型映射",
          subtitle: "绑定网关模型",
          submit: "创建映射",
        },
        edit: {
          title: "更新模型映射",
          subtitle: "调整路由定价",
          submit: "保存变更",
        },
        form: {
          provider: "提供商",
          slug: "模型标识",
          upstreamName: "上游名称",
          inputPrice: "输入单价",
          outputPrice: "输出单价",
          help: {
            provider: "选择该模型归属的提供商。",
            slug: "客户端使用的模型标识。",
            upstreamName: "上游实际模型名称。",
            inputPrice: "每 1M 输入 token 的美元成本。",
            outputPrice: "每 1M 输出 token 的美元成本。",
          },
          placeholder: {
            slug: "gpt-4o",
            upstreamName: "gpt-4o",
          },
        },
        validation: {
          required: "提供商、模型标识与上游名称为必填。",
        },
        error: {
          create: "创建失败，请检查输入后重试。",
          update: "更新失败，请检查输入后重试。",
        },
      },
      validation: {
        required: "名称与基础 URL 为必填。",
      },
      error: {
        create: "创建失败，请检查输入后重试。",
        update: "更新失败，请检查输入后重试。",
      },
      cancel: "取消",
    },
    usage: {
      title: "Token 流量与成本概览",
      intro:
        "按提供商、模型或时间范围筛选用量以核对成本。",
      refresh: "刷新用量",
      filters: "筛选",
      apply: "应用筛选",
      hint: "请求将使用当前 offset 与 limit。",
      log: "用量日志",
      logHint: "按最新时间排序。",
      previous: "上一页",
      next: "下一页",
      errorTitle: "用量数据加载失败。",
      errorHint: "请检查 API key 与筛选条件后重试。",
      emptyTitle: "当前筛选无匹配记录。",
      emptyHint: "调整筛选或稍后再试。",
      table: {
        time: "时间",
        provider: "提供商",
        model: "模型",
        input: "输入",
        output: "输出",
        cost: "成本",
      },
      form: {
        provider: "提供商",
        modelSlug: "模型标识",
        startDate: "开始日期",
        endDate: "结束日期",
        limit: "数量",
        offset: "偏移",
        help: {
          provider: "按提供商 ID 筛选。",
          modelSlug: "精确模型标识。",
          startDate: "包含起始日期，本地时间。",
          endDate: "包含结束日期，本地时间。",
          limit: "每次请求行数。",
          offset: "从 0 开始的偏移。",
        },
        placeholder: {
          modelSlug: "gpt-4o",
        },
      },
    },
    common: {
      allProviders: "全部提供商",
    },
  },
};

const defaultLocale = "en";
const resolveLocale = () => {
  const globalWindow =
    typeof globalThis !== "undefined"
      ? (globalThis as { window?: { localStorage?: Storage } }).window
      : undefined;
  if (!globalWindow?.localStorage) return defaultLocale;
  const stored = globalWindow.localStorage.getItem(localeStorageKey);
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
