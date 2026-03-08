type QuotaLimits = {
  dailyTokens?: number | null;
  monthlyTokens?: number | null;
  dailyBudgetUsd?: number | null;
  monthlyBudgetUsd?: number | null;
};

type QuotaUsage = {
  totalTokens: number;
  estimatedCostUsd: number;
};

type QuotaEntry = {
  day: string;
  month: string;
  dailyTokens: number;
  monthlyTokens: number;
  dailyCost: number;
  monthlyCost: number;
};

type QuotaConfig = {
  dailyTokensEnv: string;
  monthlyTokensEnv: string;
  dailyBudgetEnv: string;
  monthlyBudgetEnv: string;
  overridesEnv: string;
  logLabel: string;
};

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseOverrides(raw: string | undefined, label: string): Record<string, QuotaLimits> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, QuotaLimits>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (error) {
    console.warn(`[quota] invalid ${label}_QUOTA_OVERRIDES`, error);
    return {};
  }
}

function currentDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

class QuotaTracker {
  private readonly entries = new Map<string, QuotaEntry>();
  private cachedOverridesRaw: string | undefined;
  private cachedOverrides: Record<string, QuotaLimits> = {};

  constructor(private readonly config: QuotaConfig) {}

  private resolveOverrides() {
    const raw = process.env[this.config.overridesEnv];
    if (raw !== this.cachedOverridesRaw) {
      this.cachedOverridesRaw = raw;
      this.cachedOverrides = parseOverrides(raw, this.config.logLabel);
    }
    return this.cachedOverrides;
  }

  private resolveDefaultLimits(): QuotaLimits {
    return {
      dailyTokens: parseNumber(process.env[this.config.dailyTokensEnv]),
      monthlyTokens: parseNumber(process.env[this.config.monthlyTokensEnv]),
      dailyBudgetUsd: parseNumber(process.env[this.config.dailyBudgetEnv]),
      monthlyBudgetUsd: parseNumber(process.env[this.config.monthlyBudgetEnv]),
    };
  }

  private buildLimitsForKey(key: string, overrides: Record<string, QuotaLimits>): QuotaLimits {
    const defaults = this.resolveDefaultLimits();
    const override = overrides[key];
    if (!override) return defaults;
    return {
      dailyTokens: override.dailyTokens ?? defaults.dailyTokens,
      monthlyTokens: override.monthlyTokens ?? defaults.monthlyTokens,
      dailyBudgetUsd: override.dailyBudgetUsd ?? defaults.dailyBudgetUsd,
      monthlyBudgetUsd: override.monthlyBudgetUsd ?? defaults.monthlyBudgetUsd,
    };
  }

  private evaluate(key: string, usage: QuotaUsage, apply: boolean) {
    if (!key) return { allowed: true };
    const overrides = this.resolveOverrides();
    const limits = this.buildLimitsForKey(key, overrides);
    const hasLimits = Object.values(limits).some((value) => value !== null && value !== undefined);
    if (!hasLimits) return { allowed: true };

    const now = new Date();
    const dayKey = currentDayKey(now);
    const monthKey = currentMonthKey(now);
    const existing = this.entries.get(key);
    const entry: QuotaEntry = existing
      ? { ...existing }
      : {
          day: dayKey,
          month: monthKey,
          dailyTokens: 0,
          monthlyTokens: 0,
          dailyCost: 0,
          monthlyCost: 0,
        };

    if (entry.day !== dayKey) {
      entry.day = dayKey;
      entry.dailyTokens = 0;
      entry.dailyCost = 0;
    }
    if (entry.month !== monthKey) {
      entry.month = monthKey;
      entry.monthlyTokens = 0;
      entry.monthlyCost = 0;
    }

    const nextDailyTokens = entry.dailyTokens + usage.totalTokens;
    const nextMonthlyTokens = entry.monthlyTokens + usage.totalTokens;
    const nextDailyCost = entry.dailyCost + usage.estimatedCostUsd;
    const nextMonthlyCost = entry.monthlyCost + usage.estimatedCostUsd;

    if (limits.dailyTokens !== null && limits.dailyTokens !== undefined) {
      if (nextDailyTokens > limits.dailyTokens) return { allowed: false };
    }
    if (limits.monthlyTokens !== null && limits.monthlyTokens !== undefined) {
      if (nextMonthlyTokens > limits.monthlyTokens) return { allowed: false };
    }
    if (limits.dailyBudgetUsd !== null && limits.dailyBudgetUsd !== undefined) {
      if (nextDailyCost > limits.dailyBudgetUsd) return { allowed: false };
    }
    if (limits.monthlyBudgetUsd !== null && limits.monthlyBudgetUsd !== undefined) {
      if (nextMonthlyCost > limits.monthlyBudgetUsd) return { allowed: false };
    }

    if (apply) {
      entry.dailyTokens = nextDailyTokens;
      entry.monthlyTokens = nextMonthlyTokens;
      entry.dailyCost = nextDailyCost;
      entry.monthlyCost = nextMonthlyCost;
      this.entries.set(key, entry);
    }

    return { allowed: true };
  }

  canConsume(key: string, usage: QuotaUsage) {
    return this.evaluate(key, usage, false);
  }

  consume(key: string, usage: QuotaUsage) {
    return this.evaluate(key, usage, true);
  }

  reset() {
    this.entries.clear();
  }
}

export const keyQuotaTracker = new QuotaTracker({
  dailyTokensEnv: "KEY_DAILY_TOKENS",
  monthlyTokensEnv: "KEY_MONTHLY_TOKENS",
  dailyBudgetEnv: "KEY_DAILY_BUDGET_USD",
  monthlyBudgetEnv: "KEY_MONTHLY_BUDGET_USD",
  overridesEnv: "KEY_QUOTA_OVERRIDES",
  logLabel: "KEY",
});

export const userQuotaTracker = new QuotaTracker({
  dailyTokensEnv: "USER_DAILY_TOKENS",
  monthlyTokensEnv: "USER_MONTHLY_TOKENS",
  dailyBudgetEnv: "USER_DAILY_BUDGET_USD",
  monthlyBudgetEnv: "USER_MONTHLY_BUDGET_USD",
  overridesEnv: "USER_QUOTA_OVERRIDES",
  logLabel: "USER",
});

export const groupQuotaTracker = new QuotaTracker({
  dailyTokensEnv: "GROUP_DAILY_TOKENS",
  monthlyTokensEnv: "GROUP_MONTHLY_TOKENS",
  dailyBudgetEnv: "GROUP_DAILY_BUDGET_USD",
  monthlyBudgetEnv: "GROUP_MONTHLY_BUDGET_USD",
  overridesEnv: "GROUP_QUOTA_OVERRIDES",
  logLabel: "GROUP",
});
