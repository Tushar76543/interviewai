import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";

type RequestContext = {
  requestId: string;
  traceId: string;
  spanId: string;
  method: string;
  path: string;
  startedAtMs: number;
};

type LogLevel = "debug" | "info" | "warn" | "error";

type RouteMetricBucket = {
  count: number;
  errorCount: number;
  latenciesMs: number[];
  lastUpdatedAt: string;
};

const SERVICE_NAME = "interviewai-api";
const TRACEPARENT_VERSION = "00";
const TRACEPARENT_SAMPLED = "01";
const MAX_LATENCY_SAMPLES_PER_ROUTE = 3000;

const requestContextStore = new AsyncLocalStorage<RequestContext>();
const routeMetrics = new Map<string, RouteMetricBucket>();

const TRACKED_ROUTE_PATTERNS = new Set([
  "POST /api/interview/start",
  "POST /api/interview/feedback/jobs",
  "GET /api/interview/feedback/jobs/:jobId",
  "POST /api/interview/recording",
  "GET /api/interview/recording/:fileId",
]);

const toIso = () => new Date().toISOString();

const safeString = (value: unknown, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim() || fallback;
};

const randomHex = (bytes: number) => crypto.randomBytes(bytes).toString("hex");

const normalizeRequestId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return crypto.randomUUID();
  }
  return trimmed.slice(0, 96);
};

const TRACEPARENT_REGEX = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;

const parseTraceparent = (value: string) => {
  const match = value.match(TRACEPARENT_REGEX);
  if (!match) {
    return null;
  }

  return {
    traceId: match[1].toLowerCase(),
    parentSpanId: match[2].toLowerCase(),
    traceFlags: match[3].toLowerCase(),
  };
};

const asTraceparent = (traceId: string, spanId: string) =>
  `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${TRACEPARENT_SAMPLED}`;

const serializeError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "object" && value !== null) {
    return value;
  }

  return { message: String(value) };
};

const writeStructuredLog = (
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {}
) => {
  const context = requestContextStore.getStore();
  const payload = {
    timestamp: toIso(),
    level,
    message,
    service: SERVICE_NAME,
    requestId: context?.requestId,
    traceId: context?.traceId,
    spanId: context?.spanId,
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

const percentile = (values: number[], percentileRank: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[index] * 100) / 100;
};

const normalizeRoutePattern = (method: string, rawPath: string) => {
  const cleanMethod = safeString(method, "GET").toUpperCase();
  const onlyPath = rawPath.split("?")[0]?.replace(/\/+$/, "") || "/";

  if (/^\/api\/interview\/feedback\/jobs\/[^/]+$/i.test(onlyPath)) {
    return `${cleanMethod} /api/interview/feedback/jobs/:jobId`;
  }

  if (/^\/api\/interview\/recording\/[^/]+$/i.test(onlyPath)) {
    return `${cleanMethod} /api/interview/recording/:fileId`;
  }

  return `${cleanMethod} ${onlyPath}`;
};

export const shouldTrackRouteLatency = (routePattern: string) =>
  TRACKED_ROUTE_PATTERNS.has(routePattern);

export const recordRouteLatency = (params: {
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
}) => {
  const routePattern = normalizeRoutePattern(params.method, params.path);
  if (!shouldTrackRouteLatency(routePattern)) {
    return;
  }

  const latencyMs = Math.max(0, Number(params.latencyMs) || 0);
  const existing = routeMetrics.get(routePattern) ?? {
    count: 0,
    errorCount: 0,
    latenciesMs: [],
    lastUpdatedAt: toIso(),
  };

  existing.count += 1;
  if (params.statusCode >= 400) {
    existing.errorCount += 1;
  }

  existing.latenciesMs.push(latencyMs);
  if (existing.latenciesMs.length > MAX_LATENCY_SAMPLES_PER_ROUTE) {
    existing.latenciesMs.splice(
      0,
      existing.latenciesMs.length - MAX_LATENCY_SAMPLES_PER_ROUTE
    );
  }

  existing.lastUpdatedAt = toIso();
  routeMetrics.set(routePattern, existing);
};

export const getRouteLatencySnapshot = () => {
  return [...routeMetrics.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([route, bucket]) => {
      const p50 = percentile(bucket.latenciesMs, 50);
      const p95 = percentile(bucket.latenciesMs, 95);
      const p99 = percentile(bucket.latenciesMs, 99);
      const avg =
        bucket.latenciesMs.length === 0
          ? 0
          : Math.round(
              (bucket.latenciesMs.reduce((sum, value) => sum + value, 0) /
                bucket.latenciesMs.length) *
                100
            ) / 100;
      return {
        route,
        requests: bucket.count,
        errors: bucket.errorCount,
        errorRate: bucket.count === 0 ? 0 : Number((bucket.errorCount / bucket.count).toFixed(4)),
        p50Ms: p50,
        p95Ms: p95,
        p99Ms: p99,
        avgMs: avg,
        samples: bucket.latenciesMs.length,
        lastUpdatedAt: bucket.lastUpdatedAt,
      };
    });
};

export const buildPrometheusMetrics = () => {
  const lines: string[] = [];
  lines.push("# HELP interview_route_latency_ms_p95 p95 latency in milliseconds.");
  lines.push("# TYPE interview_route_latency_ms_p95 gauge");
  lines.push("# HELP interview_route_latency_ms_p99 p99 latency in milliseconds.");
  lines.push("# TYPE interview_route_latency_ms_p99 gauge");
  lines.push("# HELP interview_route_requests_total Total requests observed per route.");
  lines.push("# TYPE interview_route_requests_total counter");
  lines.push("# HELP interview_route_errors_total Total error responses observed per route.");
  lines.push("# TYPE interview_route_errors_total counter");

  for (const item of getRouteLatencySnapshot()) {
    const labelRoute = item.route.replace(/"/g, '\\"');
    lines.push(`interview_route_latency_ms_p95{route="${labelRoute}"} ${item.p95Ms}`);
    lines.push(`interview_route_latency_ms_p99{route="${labelRoute}"} ${item.p99Ms}`);
    lines.push(`interview_route_requests_total{route="${labelRoute}"} ${item.requests}`);
    lines.push(`interview_route_errors_total{route="${labelRoute}"} ${item.errors}`);
  }

  return `${lines.join("\n")}\n`;
};

export const createRequestContext = (params: {
  requestIdHeader: string;
  traceparentHeader: string;
  method: string;
  path: string;
}) => {
  const parsedTraceparent = parseTraceparent(params.traceparentHeader);

  return {
    requestId: normalizeRequestId(params.requestIdHeader),
    traceId: parsedTraceparent?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    method: safeString(params.method, "GET").toUpperCase(),
    path: safeString(params.path, "/"),
    startedAtMs: Date.now(),
  } satisfies RequestContext;
};

export const getRequestTraceparent = (context: {
  traceId: string;
  spanId: string;
}) => asTraceparent(context.traceId, context.spanId);

export const withRequestContext = <T>(
  context: RequestContext,
  callback: () => T
) => requestContextStore.run(context, callback);

export const getRequestContext = () => requestContextStore.getStore();

export const logger = {
  debug(message: string, fields?: Record<string, unknown>) {
    writeStructuredLog("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>) {
    writeStructuredLog("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>) {
    writeStructuredLog("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>) {
    writeStructuredLog("error", message, fields);
  },
  errorWithException(message: string, error: unknown, fields?: Record<string, unknown>) {
    writeStructuredLog("error", message, {
      ...fields,
      error: serializeError(error),
    });
  },
};

