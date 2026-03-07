type LabelValues = Record<string, string>;

type MetricEntry = {
  name: string;
  labels: LabelValues;
  value: number;
};

const counters = new Map<string, MetricEntry>();

function formatLabels(labels: LabelValues) {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const parts = keys.map((key) => `${key}="${labels[key]}"`);
  return `{${parts.join(",")}}`;
}

function buildKey(name: string, labels: LabelValues) {
  return `${name}${formatLabels(labels)}`;
}

function inc(name: string, labels: LabelValues, amount = 1) {
  const key = buildKey(name, labels);
  const entry = counters.get(key);
  if (!entry) {
    counters.set(key, { name, labels, value: amount });
    return;
  }
  entry.value += amount;
}

export function recordRequestMetric(params: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}) {
  const baseLabels = {
    method: params.method,
    path: params.path,
    status: String(params.status),
  };
  inc("gateway_requests_total", baseLabels);
  if (params.status >= 400) {
    inc("gateway_request_errors_total", baseLabels);
  }
  inc(
    "gateway_request_duration_ms_sum",
    { method: params.method, path: params.path },
    params.durationMs
  );
  inc("gateway_request_duration_ms_count", { method: params.method, path: params.path });
}

export function renderMetrics() {
  const lines: string[] = [
    "# HELP gateway_requests_total Total gateway requests",
    "# TYPE gateway_requests_total counter",
    "# HELP gateway_request_errors_total Total gateway error responses",
    "# TYPE gateway_request_errors_total counter",
    "# HELP gateway_request_duration_ms_sum Sum of request durations in ms",
    "# TYPE gateway_request_duration_ms_sum counter",
    "# HELP gateway_request_duration_ms_count Count of request durations",
    "# TYPE gateway_request_duration_ms_count counter",
  ];

  for (const entry of counters.values()) {
    lines.push(`${entry.name}${formatLabels(entry.labels)} ${entry.value}`);
  }

  return `${lines.join("\n")}\n`;
}

export function resetMetrics() {
  counters.clear();
}
