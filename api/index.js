var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// backend/src/lib/observability.ts
import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
var SERVICE_NAME, TRACEPARENT_VERSION, TRACEPARENT_SAMPLED, MAX_LATENCY_SAMPLES_PER_ROUTE, requestContextStore, routeMetrics, TRACKED_ROUTE_PATTERNS, toIso, safeString, randomHex, normalizeRequestId, TRACEPARENT_REGEX, parseTraceparent, asTraceparent, serializeError, writeStructuredLog, percentile, normalizeRoutePattern, shouldTrackRouteLatency, recordRouteLatency, getRouteLatencySnapshot, buildPrometheusMetrics, createRequestContext, getRequestTraceparent, withRequestContext, logger;
var init_observability = __esm({
  "backend/src/lib/observability.ts"() {
    "use strict";
    SERVICE_NAME = "interviewai-api";
    TRACEPARENT_VERSION = "00";
    TRACEPARENT_SAMPLED = "01";
    MAX_LATENCY_SAMPLES_PER_ROUTE = 3e3;
    requestContextStore = new AsyncLocalStorage();
    routeMetrics = /* @__PURE__ */ new Map();
    TRACKED_ROUTE_PATTERNS = /* @__PURE__ */ new Set([
      "POST /api/interview/start",
      "POST /api/interview/feedback/jobs",
      "GET /api/interview/feedback/jobs/:jobId",
      "POST /api/interview/recording",
      "GET /api/interview/recording/:fileId"
    ]);
    toIso = () => (/* @__PURE__ */ new Date()).toISOString();
    safeString = (value, fallback = "") => {
      if (typeof value !== "string") {
        return fallback;
      }
      return value.trim() || fallback;
    };
    randomHex = (bytes) => crypto.randomBytes(bytes).toString("hex");
    normalizeRequestId = (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return crypto.randomUUID();
      }
      return trimmed.slice(0, 96);
    };
    TRACEPARENT_REGEX = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;
    parseTraceparent = (value) => {
      const match = value.match(TRACEPARENT_REGEX);
      if (!match) {
        return null;
      }
      return {
        traceId: match[1].toLowerCase(),
        parentSpanId: match[2].toLowerCase(),
        traceFlags: match[3].toLowerCase()
      };
    };
    asTraceparent = (traceId, spanId) => `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${TRACEPARENT_SAMPLED}`;
    serializeError = (value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      if (typeof value === "object" && value !== null) {
        return value;
      }
      return { message: String(value) };
    };
    writeStructuredLog = (level, message, fields = {}) => {
      const context = requestContextStore.getStore();
      const payload = {
        timestamp: toIso(),
        level,
        message,
        service: SERVICE_NAME,
        requestId: context?.requestId,
        traceId: context?.traceId,
        spanId: context?.spanId,
        ...fields
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
    percentile = (values, percentileRank) => {
      if (values.length === 0) {
        return 0;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(percentileRank / 100 * sorted.length) - 1)
      );
      return Math.round(sorted[index] * 100) / 100;
    };
    normalizeRoutePattern = (method, rawPath) => {
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
    shouldTrackRouteLatency = (routePattern) => TRACKED_ROUTE_PATTERNS.has(routePattern);
    recordRouteLatency = (params) => {
      const routePattern = normalizeRoutePattern(params.method, params.path);
      if (!shouldTrackRouteLatency(routePattern)) {
        return;
      }
      const latencyMs = Math.max(0, Number(params.latencyMs) || 0);
      const existing = routeMetrics.get(routePattern) ?? {
        count: 0,
        errorCount: 0,
        latenciesMs: [],
        lastUpdatedAt: toIso()
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
    getRouteLatencySnapshot = () => {
      return [...routeMetrics.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([route, bucket]) => {
        const p50 = percentile(bucket.latenciesMs, 50);
        const p95 = percentile(bucket.latenciesMs, 95);
        const p99 = percentile(bucket.latenciesMs, 99);
        const avg = bucket.latenciesMs.length === 0 ? 0 : Math.round(
          bucket.latenciesMs.reduce((sum, value) => sum + value, 0) / bucket.latenciesMs.length * 100
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
          lastUpdatedAt: bucket.lastUpdatedAt
        };
      });
    };
    buildPrometheusMetrics = () => {
      const lines = [];
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
      return `${lines.join("\n")}
`;
    };
    createRequestContext = (params) => {
      const parsedTraceparent = parseTraceparent(params.traceparentHeader);
      return {
        requestId: normalizeRequestId(params.requestIdHeader),
        traceId: parsedTraceparent?.traceId ?? randomHex(16),
        spanId: randomHex(8),
        method: safeString(params.method, "GET").toUpperCase(),
        path: safeString(params.path, "/"),
        startedAtMs: Date.now()
      };
    };
    getRequestTraceparent = (context) => asTraceparent(context.traceId, context.spanId);
    withRequestContext = (context, callback) => requestContextStore.run(context, callback);
    logger = {
      debug(message, fields) {
        writeStructuredLog("debug", message, fields);
      },
      info(message, fields) {
        writeStructuredLog("info", message, fields);
      },
      warn(message, fields) {
        writeStructuredLog("warn", message, fields);
      },
      error(message, fields) {
        writeStructuredLog("error", message, fields);
      },
      errorWithException(message, error, fields) {
        writeStructuredLog("error", message, {
          ...fields,
          error: serializeError(error)
        });
      }
    };
  }
});

// backend/src/lib/aiResilience.ts
var FAILURE_WINDOW_MS, ERROR_BUDGET_MAX_FAILURE_RATE, BREAKER_CONSECUTIVE_FAILURES, BREAKER_COOLDOWN_MS, MAX_BACKOFF_MS, operationState, getState, sleep, markSuccess, markFailure, isCircuitOpen, listModels, getAiResilienceSnapshot, executeWithAiResilience;
var init_aiResilience = __esm({
  "backend/src/lib/aiResilience.ts"() {
    "use strict";
    init_observability();
    FAILURE_WINDOW_MS = Number.parseInt(process.env.AI_ERROR_BUDGET_WINDOW_MS ?? "60000", 10);
    ERROR_BUDGET_MAX_FAILURE_RATE = Number.parseFloat(
      process.env.AI_ERROR_BUDGET_MAX_FAILURE_RATE ?? "0.35"
    );
    BREAKER_CONSECUTIVE_FAILURES = Number.parseInt(
      process.env.AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "5",
      10
    );
    BREAKER_COOLDOWN_MS = Number.parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS ?? "20000", 10);
    MAX_BACKOFF_MS = 2e3;
    operationState = /* @__PURE__ */ new Map();
    getState = (operation) => {
      const now = Date.now();
      const existing = operationState.get(operation);
      if (existing) {
        if (now - existing.windowStartedAtMs > FAILURE_WINDOW_MS) {
          existing.windowStartedAtMs = now;
          existing.windowFailureCount = 0;
          existing.windowRequestCount = 0;
        }
        return existing;
      }
      const created = {
        consecutiveFailures: 0,
        circuitOpenUntilMs: 0,
        windowStartedAtMs: now,
        windowRequestCount: 0,
        windowFailureCount: 0,
        totalRequests: 0,
        totalFailures: 0
      };
      operationState.set(operation, created);
      return created;
    };
    sleep = (ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
    markSuccess = (operation) => {
      const state = getState(operation);
      state.totalRequests += 1;
      state.windowRequestCount += 1;
      state.consecutiveFailures = 0;
    };
    markFailure = (operation) => {
      const state = getState(operation);
      state.totalRequests += 1;
      state.totalFailures += 1;
      state.windowRequestCount += 1;
      state.windowFailureCount += 1;
      state.consecutiveFailures += 1;
      const windowFailureRate = state.windowRequestCount > 0 ? state.windowFailureCount / state.windowRequestCount : 0;
      if (state.consecutiveFailures >= BREAKER_CONSECUTIVE_FAILURES || windowFailureRate > ERROR_BUDGET_MAX_FAILURE_RATE) {
        state.circuitOpenUntilMs = Date.now() + BREAKER_COOLDOWN_MS;
      }
    };
    isCircuitOpen = (operation) => {
      const state = getState(operation);
      return state.circuitOpenUntilMs > Date.now();
    };
    listModels = (primaryModel, fallbackModels = []) => [primaryModel, ...fallbackModels].map((item) => item.trim()).filter(Boolean).filter((item, index, list) => list.indexOf(item) === index);
    getAiResilienceSnapshot = () => {
      const snapshot = {};
      for (const [operation, state] of operationState.entries()) {
        snapshot[operation] = {
          consecutiveFailures: state.consecutiveFailures,
          circuitOpenUntil: state.circuitOpenUntilMs ? new Date(state.circuitOpenUntilMs).toISOString() : null,
          windowRequestCount: state.windowRequestCount,
          windowFailureCount: state.windowFailureCount,
          totalRequests: state.totalRequests,
          totalFailures: state.totalFailures,
          errorBudgetFailureRate: state.windowRequestCount > 0 ? state.windowFailureCount / state.windowRequestCount : 0
        };
      }
      return snapshot;
    };
    executeWithAiResilience = async (options) => {
      const models = listModels(options.primaryModel, options.fallbackModels);
      const maxRetries = Math.max(0, Math.min(4, Math.trunc(options.maxRetries ?? 2)));
      const operation = options.operation;
      if (isCircuitOpen(operation)) {
        logger.warn("ai.circuit_open", {
          operation,
          circuitState: getAiResilienceSnapshot()[operation]
        });
        throw new Error("AI provider circuit breaker is open");
      }
      let lastError = null;
      for (const model of models) {
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            const result = await options.execute(model);
            markSuccess(operation);
            return {
              result,
              model,
              attempt
            };
          } catch (error) {
            lastError = error;
            const retriable = options.isRetriableError(error);
            const hasAttemptsLeft = attempt < maxRetries;
            logger.warn("ai.call_failed", {
              operation,
              model,
              attempt,
              retriable,
              hasAttemptsLeft
            });
            if (!retriable || !hasAttemptsLeft) {
              break;
            }
            const backoffMs = Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt + Math.floor(Math.random() * 120));
            await sleep(backoffMs);
          }
        }
      }
      markFailure(operation);
      throw lastError instanceof Error ? lastError : new Error("AI provider call failed");
    };
  }
});

// backend/src/services/openai.service.ts
import axios from "axios";
async function generateQuestion(role, difficulty, previousQuestions = [], category = MIXED_CATEGORY, previousCategories = []) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("AI_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured", 500);
  }
  const safeRole = cleanText(role || "Software Engineer", 80) || "Software Engineer";
  const safeDifficulty = cleanText(difficulty || "Medium", 20) || "Medium";
  const resolvedDifficulty = SUPPORTED_DIFFICULTIES.find(
    (item) => item.toLowerCase() === safeDifficulty.toLowerCase()
  ) ? (safeDifficulty[0].toUpperCase() + safeDifficulty.slice(1).toLowerCase()).replace(
    "Faang",
    "FAANG"
  ) : "Medium";
  const safePrevious = previousQuestions.filter((item) => typeof item === "string").map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 20);
  const safePreviousCategories = previousCategories.filter((item) => typeof item === "string").map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 20);
  const categoryPool = getCategoryPool(safeRole);
  const requestedCategory = cleanText(category || MIXED_CATEGORY, 60) || MIXED_CATEGORY;
  const resolvedCategory = resolveCategory(
    requestedCategory,
    categoryPool,
    safePreviousCategories,
    safePrevious.length
  );
  const previousPromptGuidance = safePrevious.length ? `Avoid repeating these previous prompts:
${safePrevious.join("\n")}` : "No previous prompts are provided yet.";
  const previousCategoryGuidance = safePreviousCategories.length ? `Recent categories used: ${safePreviousCategories.join(", ")}. Prefer a different angle when possible.` : "";
  const prompt = `
You are a senior interviewer running a realistic mock interview.

Candidate role: ${safeRole}
Difficulty: ${resolvedDifficulty}
Focus category: ${resolvedCategory}

Question requirements:
- Ask exactly one realistic interview question in 1 to 3 sentences.
- Use practical context (trade-offs, incidents, constraints, metrics, timelines, collaboration).
- Avoid trivia and yes/no-only prompts.
- Keep the question interview-ready and conversational.
- Match the challenge level to difficulty.

${previousPromptGuidance}
${previousCategoryGuidance}

Return JSON only in this format:
{"qid":"q1","category":"<category>","prompt":"<question>","expectedPoints":["point1","point2","point3"]}
`;
  const referer = process.env.FRONTEND_URL?.startsWith("http") ? process.env.FRONTEND_URL : "https://interviewpilot.app";
  try {
    const { result: response, model: selectedModel } = await executeWithAiResilience({
      operation: "question_generation",
      primaryModel: QUESTION_PRIMARY_MODEL,
      fallbackModels: QUESTION_FALLBACK_MODELS,
      maxRetries: 2,
      execute: async (model) => axios.post(
        OPENROUTER_ENDPOINT,
        {
          model,
          messages: [
            { role: "system", content: "You are the InterviewPilot AI Interview Coach." },
            { role: "user", content: prompt }
          ],
          temperature: 0.5,
          max_tokens: RESPONSE_MAX_TOKENS
        },
        {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": referer,
            "X-Title": "InterviewPilot Coach",
            "Content-Type": "application/json"
          }
        }
      ),
      isRetriableError: isRetriableProviderError
    });
    logger.info("ai.question_model_selected", {
      model: selectedModel,
      role: safeRole,
      difficulty: resolvedDifficulty,
      category: resolvedCategory
    });
    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return buildFallbackQuestion(
        safeRole,
        resolvedDifficulty,
        resolvedCategory,
        safePrevious.length
      );
    }
    const parsed = parseQuestion(text, resolvedCategory, resolvedDifficulty);
    if (!parsed) {
      return buildFallbackQuestion(
        safeRole,
        resolvedDifficulty,
        resolvedCategory,
        safePrevious.length
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    if (error instanceof Error && /circuit breaker is open/i.test(error.message)) {
      return buildFallbackQuestion(
        safeRole,
        resolvedDifficulty,
        resolvedCategory,
        safePrevious.length
      );
    }
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const rawPayload = error.response?.data;
      const providerMessage = typeof rawPayload === "string" ? rawPayload : typeof rawPayload === "object" && rawPayload !== null ? JSON.stringify(rawPayload) : "";
      logger.error("ai.question_generation_error", {
        status,
        axiosCode: error.code,
        message: error.message,
        providerMessage
      });
      if (status === 401 || status === 403) {
        throw new AiProviderError("AI_AUTH_FAILED", "AI API key rejected by provider", 502);
      }
      if (status === 429 || error.code === "ECONNABORTED" || !status || status >= 500) {
        return buildFallbackQuestion(
          safeRole,
          resolvedDifficulty,
          resolvedCategory,
          safePrevious.length
        );
      }
      throw new AiProviderError("AI_PROVIDER_ERROR", "AI provider request failed", 502);
    }
    logger.errorWithException("ai.question_generation_unexpected_error", error);
    return buildFallbackQuestion(
      safeRole,
      resolvedDifficulty,
      resolvedCategory,
      safePrevious.length
    );
  }
}
var AiProviderError, OPENROUTER_ENDPOINT, DEFAULT_MODEL, REQUEST_TIMEOUT_MS, RESPONSE_MAX_TOKENS, MIXED_CATEGORY, SUPPORTED_DIFFICULTIES, QUESTION_PRIMARY_MODEL, QUESTION_FALLBACK_MODELS, isRetriableProviderError, cleanText, defaultTimeLimitByDifficulty, getCategoryPool, resolveCategory, extractJson, parseQuestion, categoryFallbacks, buildFallbackQuestion;
var init_openai_service = __esm({
  "backend/src/services/openai.service.ts"() {
    "use strict";
    init_aiResilience();
    init_observability();
    AiProviderError = class extends Error {
      constructor(code, message, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
      }
    };
    OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
    REQUEST_TIMEOUT_MS = 7e3;
    RESPONSE_MAX_TOKENS = 320;
    MIXED_CATEGORY = "Mixed";
    SUPPORTED_DIFFICULTIES = ["Easy", "Medium", "FAANG"];
    QUESTION_PRIMARY_MODEL = process.env.OPENROUTER_QUESTION_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    QUESTION_FALLBACK_MODELS = (process.env.OPENROUTER_QUESTION_FALLBACK_MODELS || process.env.OPENROUTER_MODEL_FALLBACKS || "").split(",").map((item) => item.trim()).filter(Boolean);
    isRetriableProviderError = (error) => {
      if (!axios.isAxiosError(error)) {
        return false;
      }
      const status = error.response?.status;
      if (!status) {
        return true;
      }
      return status === 429 || status >= 500 || error.code === "ECONNABORTED";
    };
    cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
    defaultTimeLimitByDifficulty = (difficulty) => {
      if (difficulty === "Easy") return 120;
      if (difficulty === "FAANG") return 240;
      return 180;
    };
    getCategoryPool = (role) => {
      const normalizedRole = role.toLowerCase();
      const base = [
        "Behavioral",
        "Communication",
        "Problem Solving",
        "Project Deep Dive"
      ];
      const engineering = [
        "Technical Fundamentals",
        "System Design",
        "Debugging",
        "Testing and Quality",
        "Performance",
        "Security"
      ];
      const aiData = [
        "ML Fundamentals",
        "Data Modeling",
        "Experimentation",
        "Model Evaluation",
        "Responsible AI"
      ];
      const product = [
        "Product Sense",
        "Prioritization",
        "Stakeholder Management",
        "Execution Planning"
      ];
      const leadership = [
        "Leadership and Ownership",
        "Mentoring",
        "Conflict Resolution",
        "Cross-functional Collaboration"
      ];
      const includeEngineering = /(engineer|developer|sre|devops|architect|qa|test|programmer)/i.test(
        normalizedRole
      );
      const includeAiData = /(ai|ml|machine learning|data scientist|data engineer|analytics)/i.test(
        normalizedRole
      );
      const includeProduct = /(product|pm|program manager|analyst)/i.test(normalizedRole);
      const includeLeadership = /(manager|lead|director|head|principal|staff)/i.test(normalizedRole);
      const pool = [
        ...base,
        ...includeEngineering ? engineering : [],
        ...includeAiData ? aiData : [],
        ...includeProduct ? product : [],
        ...includeLeadership ? leadership : []
      ];
      return Array.from(new Set(pool));
    };
    resolveCategory = (requestedCategory, categoryPool, previousCategories, previousQuestionCount) => {
      if (!requestedCategory || requestedCategory.toLowerCase() === MIXED_CATEGORY.toLowerCase()) {
        const recent = previousCategories.slice(-3).map((item) => item.toLowerCase());
        const available = categoryPool.filter((item) => !recent.includes(item.toLowerCase()));
        const rotationPool = available.length > 0 ? available : categoryPool;
        const index = previousQuestionCount % rotationPool.length;
        return rotationPool[index];
      }
      const matched = categoryPool.find(
        (item) => item.toLowerCase() === requestedCategory.toLowerCase()
      );
      return matched ?? (cleanText(requestedCategory, 60) || MIXED_CATEGORY);
    };
    extractJson = (value) => {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
      }
      const match = trimmed.match(/\{[\s\S]*\}/);
      return match ? match[0] : "";
    };
    parseQuestion = (raw, fallbackCategory, fallbackDifficulty) => {
      try {
        const parsed = JSON.parse(extractJson(raw));
        if (!parsed || typeof parsed.prompt !== "string") {
          return null;
        }
        const prompt = cleanText(parsed.prompt, 1e3);
        const category = typeof parsed.category === "string" && parsed.category.trim() ? cleanText(parsed.category, 60) : fallbackCategory;
        const expectedPoints = Array.isArray(parsed.expectedPoints) ? parsed.expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 6) : [];
        return {
          qid: typeof parsed.qid === "string" && parsed.qid.trim() ? parsed.qid.trim() : "q1",
          category,
          prompt,
          expectedPoints,
          timeLimitSec: typeof parsed.timeLimitSec === "number" && parsed.timeLimitSec > 0 ? Math.min(parsed.timeLimitSec, 600) : defaultTimeLimitByDifficulty(fallbackDifficulty)
        };
      } catch {
        return null;
      }
    };
    categoryFallbacks = {
      "System Design": {
        prompt: "Design a service to support 1M daily users. Explain your architecture, data model, scaling approach, and reliability strategy.",
        expectedPoints: [
          "high-level architecture and components",
          "data model or storage strategy",
          "scaling and bottleneck handling",
          "reliability, monitoring, and failure handling"
        ]
      },
      Debugging: {
        prompt: "A production endpoint latency doubled after a release. Walk through your debugging plan from detection to permanent fix.",
        expectedPoints: [
          "reproduce and isolate the issue",
          "metrics/logging based root-cause analysis",
          "rollback or mitigation plan",
          "permanent fix and prevention steps"
        ]
      },
      Behavioral: {
        prompt: "Tell me about a time you disagreed with a team decision. How did you handle it, and what was the final outcome?",
        expectedPoints: [
          "clear context and conflict",
          "actions taken with stakeholders",
          "measurable outcome",
          "lesson learned"
        ]
      },
      Communication: {
        prompt: "How would you explain a complex technical trade-off to a non-technical stakeholder who needs to decide quickly?",
        expectedPoints: [
          "plain-language explanation",
          "options with trade-offs",
          "recommendation and rationale",
          "risk communication"
        ]
      },
      Security: {
        prompt: "You discover sensitive user data is accessible due to a configuration mistake. What are your first steps and long-term safeguards?",
        expectedPoints: [
          "containment and incident response",
          "impact assessment and communication",
          "root cause and remediation",
          "long-term preventive controls"
        ]
      }
    };
    buildFallbackQuestion = (role, difficulty, category, previousQuestionCount) => {
      const categoryTemplate = categoryFallbacks[category];
      const genericPrompts = [
        `For a ${role} role, describe a challenging problem you solved recently and the trade-offs in your approach.`,
        `As a ${role}, how would you plan and execute a feature from requirements to production rollout?`,
        `In a ${difficulty} interview, explain how you would detect and improve a performance bottleneck in a live system.`
      ];
      const genericExpectedPoints = [
        "problem framing and assumptions",
        "step-by-step approach",
        "trade-offs and risks",
        "validation and measurable outcomes"
      ];
      const fallbackPrompt = categoryTemplate ? categoryTemplate.prompt : genericPrompts[previousQuestionCount % genericPrompts.length];
      const fallbackExpectedPoints = categoryTemplate ? categoryTemplate.expectedPoints : genericExpectedPoints;
      return {
        qid: `q${previousQuestionCount + 1}`,
        category,
        prompt: cleanText(fallbackPrompt, 1e3),
        expectedPoints: fallbackExpectedPoints.map((item) => cleanText(item, 240)).slice(0, 6),
        timeLimitSec: defaultTimeLimitByDifficulty(difficulty)
      };
    };
  }
});

// backend/src/models/user.ts
import mongoose, { Schema } from "mongoose";
var UserSchema, user_default;
var init_user = __esm({
  "backend/src/models/user.ts"() {
    "use strict";
    UserSchema = new Schema(
      {
        name: { type: String, trim: true, maxlength: 60 },
        email: {
          type: String,
          required: true,
          unique: true,
          lowercase: true,
          trim: true,
          index: true
        },
        passwordHash: { type: String },
        passwordHistory: { type: [String], default: [] },
        passwordResetTokenHash: { type: String, index: true },
        passwordResetExpiresAt: { type: Date },
        authProvider: {
          type: String,
          enum: ["local", "google"],
          default: "local",
          required: true
        },
        googleId: {
          type: String,
          trim: true,
          unique: true,
          sparse: true,
          index: true
        },
        avatarUrl: { type: String, trim: true },
        lastLoginAt: { type: Date },
        lastLoginFingerprint: { type: String },
        rolePreferences: { type: [String], default: [] },
        interviewHistory: { type: [String], default: [] }
      },
      { timestamps: true }
    );
    UserSchema.pre("save", function normalizeUser(next) {
      if (this.email) {
        this.email = this.email.toLowerCase().trim();
      }
      if (this.googleId) {
        this.googleId = this.googleId.trim();
      }
      next();
    });
    UserSchema.index({ lastLoginAt: -1 });
    user_default = mongoose.models.User || mongoose.model("User", UserSchema);
  }
});

// backend/src/config/env.ts
import "dotenv/config";
var MIN_JWT_SECRET_LENGTH, asRuntimeEnvironment, normalizeOrigin, parseOrigins, parseVercelOrigins, readEnv, isOriginAllowedForRuntime, isUrlAllowedForRuntime, cachedConfig, getEnvConfig;
var init_env = __esm({
  "backend/src/config/env.ts"() {
    "use strict";
    MIN_JWT_SECRET_LENGTH = 32;
    asRuntimeEnvironment = (value) => {
      if (value === "production" || value === "test") {
        return value;
      }
      return "development";
    };
    normalizeOrigin = (origin) => {
      const trimmed = origin.trim();
      if (!trimmed) {
        return "";
      }
      try {
        const url = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
        return url.origin;
      } catch {
        return "";
      }
    };
    parseOrigins = (value) => value.split(",").map((entry) => normalizeOrigin(entry)).filter(Boolean);
    parseVercelOrigins = () => [
      process.env.VERCEL_URL ?? "",
      process.env.VERCEL_BRANCH_URL ?? "",
      process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""
    ].map((entry) => normalizeOrigin(entry)).filter(Boolean);
    readEnv = (key) => (process.env[key] ?? "").trim();
    isOriginAllowedForRuntime = (origin, isProduction4) => !origin || !isProduction4 || origin.startsWith("https://");
    isUrlAllowedForRuntime = (value, isProduction4) => {
      if (!value || !isProduction4) {
        return true;
      }
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    };
    cachedConfig = null;
    getEnvConfig = () => {
      if (cachedConfig) {
        return cachedConfig;
      }
      const nodeEnv = asRuntimeEnvironment((process.env.NODE_ENV ?? "development").trim().toLowerCase());
      const isProduction4 = nodeEnv === "production";
      const mongoUri = readEnv("MONGO_URI");
      const jwtSecret = readEnv("JWT_SECRET");
      const openRouterApiKey = readEnv("OPENROUTER_API_KEY");
      if (jwtSecret && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
        console.warn(`JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
      }
      const frontendOriginCandidate = normalizeOrigin(readEnv("FRONTEND_URL"));
      const vercelOrigins = parseVercelOrigins();
      const allowedCorsOrigins = Array.from(
        new Set([
          frontendOriginCandidate,
          ...parseOrigins(process.env.CORS_ORIGINS ?? ""),
          ...vercelOrigins
        ].filter((origin) => isOriginAllowedForRuntime(origin, isProduction4)))
      );
      const frontendOrigin = frontendOriginCandidate && allowedCorsOrigins.includes(frontendOriginCandidate) ? frontendOriginCandidate : "";
      const redisRestUrlCandidate = readEnv("REDIS_REST_URL");
      const redisRestTokenCandidate = readEnv("REDIS_REST_TOKEN");
      const redisPairProvided = Boolean(redisRestUrlCandidate && redisRestTokenCandidate);
      const redisPairAllowed = redisPairProvided && isUrlAllowedForRuntime(redisRestUrlCandidate, isProduction4);
      const redisRestUrl = redisPairAllowed ? redisRestUrlCandidate : "";
      const redisRestToken = redisPairAllowed ? redisRestTokenCandidate : "";
      const redisKeyPrefixCandidate = readEnv("REDIS_KEY_PREFIX").replace(/[:\s]+$/g, "");
      const redisKeyPrefix3 = redisKeyPrefixCandidate || "ip";
      cachedConfig = {
        nodeEnv,
        isProduction: isProduction4,
        mongoUri,
        jwtSecret,
        openRouterApiKey,
        frontendOrigin,
        allowedCorsOrigins,
        redisRestUrl,
        redisRestToken,
        redisConfigured: Boolean(redisRestUrl && redisRestToken),
        redisKeyPrefix: redisKeyPrefix3,
        redisMemoryPolicy: readEnv("REDIS_MEMORY_POLICY") || "allkeys-lfu",
        redisPersistenceMode: readEnv("REDIS_PERSISTENCE_MODE") || "cache-only",
        metricsApiKey: readEnv("METRICS_API_KEY")
      };
      return cachedConfig;
    };
  }
});

// backend/src/lib/runtimeStore.ts
var toFiniteNumber, toInt, nowMs, InMemoryRuntimeStore, UpstashRuntimeStore, singletonStore, getRuntimeStore;
var init_runtimeStore = __esm({
  "backend/src/lib/runtimeStore.ts"() {
    "use strict";
    init_env();
    toFiniteNumber = (value, fallback = 0) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      return fallback;
    };
    toInt = (value, fallback = 0) => Math.trunc(toFiniteNumber(value, fallback));
    nowMs = () => Date.now();
    InMemoryRuntimeStore = class {
      constructor() {
        this.isDistributed = false;
        this.strings = /* @__PURE__ */ new Map();
        this.lists = /* @__PURE__ */ new Map();
        this.sortedSets = /* @__PURE__ */ new Map();
        this.expiresAtByKey = /* @__PURE__ */ new Map();
      }
      hasAnyValue(key) {
        return this.strings.has(key) || this.lists.has(key) || this.sortedSets.has(key);
      }
      clearKey(key) {
        this.strings.delete(key);
        this.lists.delete(key);
        this.sortedSets.delete(key);
        this.expiresAtByKey.delete(key);
      }
      cleanupKeyIfExpired(key) {
        const expiresAt = this.expiresAtByKey.get(key);
        if (!expiresAt) {
          return;
        }
        if (expiresAt <= nowMs()) {
          this.clearKey(key);
        }
      }
      cleanupExpired() {
        const now = nowMs();
        for (const [key, expiresAt] of this.expiresAtByKey.entries()) {
          if (expiresAt <= now) {
            this.clearKey(key);
          }
        }
      }
      async get(key) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        return this.strings.get(key)?.value ?? null;
      }
      async setEx(key, value, ttlSec) {
        this.cleanupExpired();
        const ttlMs = Math.max(1, ttlSec) * 1e3;
        this.strings.set(key, {
          value,
          expiresAt: null
        });
        this.expiresAtByKey.set(key, nowMs() + ttlMs);
      }
      async setNxEx(key, value, ttlSec) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const existing = this.strings.get(key);
        if (existing) {
          return false;
        }
        await this.setEx(key, value, ttlSec);
        return true;
      }
      async del(key) {
        this.clearKey(key);
      }
      async incrWithTtl(key, ttlSec) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const existing = this.strings.get(key);
        if (!existing) {
          await this.setEx(key, "1", ttlSec);
          return 1;
        }
        const count = toInt(existing.value, 0) + 1;
        this.strings.set(key, {
          value: `${count}`,
          expiresAt: null
        });
        return count;
      }
      async rpush(key, value) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const list = this.lists.get(key) ?? [];
        list.push(value);
        this.lists.set(key, list);
        return list.length;
      }
      async lpop(key) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const list = this.lists.get(key);
        if (!list || list.length === 0) {
          return null;
        }
        const item = list.shift() ?? null;
        if (list.length === 0) {
          this.lists.delete(key);
        } else {
          this.lists.set(key, list);
        }
        return item;
      }
      async zadd(key, score, member) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const set = this.sortedSets.get(key) ?? [];
        const filtered = set.filter((item) => item.member !== member);
        filtered.push({ score, member });
        filtered.sort((a, b) => a.score - b.score);
        this.sortedSets.set(key, filtered);
      }
      async zrangeByScore(key, maxScore, limit) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const set = this.sortedSets.get(key) ?? [];
        return set.filter((item) => item.score <= maxScore).slice(0, Math.max(1, limit)).map((item) => item.member);
      }
      async zrem(key, member) {
        this.cleanupExpired();
        this.cleanupKeyIfExpired(key);
        const set = this.sortedSets.get(key) ?? [];
        const filtered = set.filter((item) => item.member !== member);
        if (filtered.length === 0) {
          this.sortedSets.delete(key);
          return;
        }
        this.sortedSets.set(key, filtered);
      }
      async expire(key, ttlSec) {
        this.cleanupExpired();
        if (!this.hasAnyValue(key)) {
          return;
        }
        this.expiresAtByKey.set(key, nowMs() + Math.max(1, ttlSec) * 1e3);
      }
    };
    UpstashRuntimeStore = class {
      constructor(endpoint, token) {
        this.isDistributed = true;
        this.endpoint = endpoint.replace(/\/+$/, "");
        this.token = token;
      }
      async runPipeline(commands) {
        const response = await fetch(`${this.endpoint}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(commands)
        });
        if (!response.ok) {
          throw new Error(`Redis pipeline failed with status ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.some((entry) => entry?.error)) {
          throw new Error("Redis pipeline response is invalid");
        }
        return payload.map((entry) => entry?.result);
      }
      async get(key) {
        const [result] = await this.runPipeline([["GET", key]]);
        return typeof result === "string" ? result : null;
      }
      async setEx(key, value, ttlSec) {
        await this.runPipeline([["SET", key, value, "EX", `${Math.max(1, ttlSec)}`]]);
      }
      async setNxEx(key, value, ttlSec) {
        const [result] = await this.runPipeline([
          ["SET", key, value, "EX", `${Math.max(1, ttlSec)}`, "NX"]
        ]);
        return typeof result === "string" && result.toUpperCase() === "OK";
      }
      async del(key) {
        await this.runPipeline([["DEL", key]]);
      }
      async incrWithTtl(key, ttlSec) {
        const [countResult] = await this.runPipeline([
          ["INCR", key],
          ["EXPIRE", key, `${Math.max(1, ttlSec)}`, "NX"]
        ]);
        return Math.max(1, toInt(countResult, 1));
      }
      async rpush(key, value) {
        const [result] = await this.runPipeline([["RPUSH", key, value]]);
        return Math.max(0, toInt(result, 0));
      }
      async lpop(key) {
        const [result] = await this.runPipeline([["LPOP", key]]);
        return typeof result === "string" ? result : null;
      }
      async zadd(key, score, member) {
        await this.runPipeline([["ZADD", key, `${Math.trunc(score)}`, member]]);
      }
      async zrangeByScore(key, maxScore, limit) {
        const [result] = await this.runPipeline([
          ["ZRANGEBYSCORE", key, "-inf", `${Math.trunc(maxScore)}`, "LIMIT", "0", `${Math.max(1, limit)}`]
        ]);
        if (!Array.isArray(result)) {
          return [];
        }
        return result.filter((item) => typeof item === "string");
      }
      async zrem(key, member) {
        await this.runPipeline([["ZREM", key, member]]);
      }
      async expire(key, ttlSec) {
        await this.runPipeline([["EXPIRE", key, `${Math.max(1, ttlSec)}`]]);
      }
    };
    singletonStore = null;
    getRuntimeStore = () => {
      if (singletonStore) {
        return singletonStore;
      }
      const { redisRestUrl, redisRestToken } = getEnvConfig();
      if (redisRestUrl && redisRestToken) {
        singletonStore = new UpstashRuntimeStore(redisRestUrl, redisRestToken);
        return singletonStore;
      }
      singletonStore = new InMemoryRuntimeStore();
      return singletonStore;
    };
  }
});

// backend/src/lib/authRuntimeStore.ts
import crypto2 from "crypto";
var redisKeyPrefix, AUTH_NAMESPACE, REFRESH_SESSION_PREFIX, TOKEN_REVOKE_PREFIX, SUSPICIOUS_LOGIN_PREFIX, runtimeStore, stableHash, safeText, buildRefreshSessionKey, buildRevokedTokenKey, suspiciousIdentityKey, hashAuthToken, buildLoginFingerprint, storeRefreshSession, getRefreshSession, deleteRefreshSession, revokeTokenByJti, isTokenRevoked, incrementSuspiciousLogin;
var init_authRuntimeStore = __esm({
  "backend/src/lib/authRuntimeStore.ts"() {
    "use strict";
    init_runtimeStore();
    init_env();
    ({ redisKeyPrefix } = getEnvConfig());
    AUTH_NAMESPACE = `${redisKeyPrefix}:auth`;
    REFRESH_SESSION_PREFIX = `${AUTH_NAMESPACE}:refresh`;
    TOKEN_REVOKE_PREFIX = `${AUTH_NAMESPACE}:revoked`;
    SUSPICIOUS_LOGIN_PREFIX = `${AUTH_NAMESPACE}:suspicious`;
    runtimeStore = getRuntimeStore();
    stableHash = (value) => crypto2.createHash("sha256").update(value).digest("hex");
    safeText = (value) => value.trim().toLowerCase();
    buildRefreshSessionKey = (sessionId) => `${REFRESH_SESSION_PREFIX}:${sessionId}`;
    buildRevokedTokenKey = (jti) => `${TOKEN_REVOKE_PREFIX}:${jti}`;
    suspiciousIdentityKey = (email, ipAddress) => `${SUSPICIOUS_LOGIN_PREFIX}:${stableHash(`${safeText(email)}|${safeText(ipAddress)}`)}`;
    hashAuthToken = (token) => stableHash(token.trim());
    buildLoginFingerprint = (params) => stableHash(safeText(params.userAgent) || safeText(params.ipAddress));
    storeRefreshSession = async (params) => {
      const payload = {
        sessionId: params.sessionId,
        userId: params.userId,
        refreshTokenHash: params.refreshTokenHash,
        fingerprint: params.fingerprint,
        createdAt: Date.now(),
        rotatedAt: Date.now()
      };
      await runtimeStore.setEx(
        buildRefreshSessionKey(params.sessionId),
        JSON.stringify(payload),
        Math.max(60, params.ttlSec)
      );
    };
    getRefreshSession = async (sessionId) => {
      const raw = await runtimeStore.get(buildRefreshSessionKey(sessionId));
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.sessionId !== "string" || typeof parsed.userId !== "string" || typeof parsed.refreshTokenHash !== "string" || typeof parsed.fingerprint !== "string") {
          return null;
        }
        return {
          sessionId: parsed.sessionId,
          userId: parsed.userId,
          refreshTokenHash: parsed.refreshTokenHash,
          fingerprint: parsed.fingerprint,
          createdAt: typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : Date.now(),
          rotatedAt: typeof parsed.rotatedAt === "number" && Number.isFinite(parsed.rotatedAt) ? parsed.rotatedAt : Date.now()
        };
      } catch {
        return null;
      }
    };
    deleteRefreshSession = async (sessionId) => {
      await runtimeStore.del(buildRefreshSessionKey(sessionId));
    };
    revokeTokenByJti = async (params) => {
      if (!params.jti.trim()) {
        return;
      }
      await runtimeStore.setEx(
        buildRevokedTokenKey(params.jti.trim()),
        params.reason.slice(0, 120) || "revoked",
        Math.max(60, params.ttlSec)
      );
    };
    isTokenRevoked = async (jti) => {
      if (!jti.trim()) {
        return false;
      }
      const value = await runtimeStore.get(buildRevokedTokenKey(jti.trim()));
      return Boolean(value);
    };
    incrementSuspiciousLogin = async (params) => {
      const key = suspiciousIdentityKey(params.email, params.ipAddress);
      return runtimeStore.incrWithTtl(key, Math.max(300, params.ttlSec ?? 3600));
    };
  }
});

// backend/src/middleware/auth.middleware.ts
import jwt from "jsonwebtoken";
var extractToken, decodeAccessToken, authMiddleware;
var init_auth_middleware = __esm({
  "backend/src/middleware/auth.middleware.ts"() {
    "use strict";
    init_user();
    init_authRuntimeStore();
    extractToken = (req) => {
      const authHeader = req.headers.authorization;
      const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      return (req.cookies?.token || bearerToken).trim();
    };
    decodeAccessToken = (token) => {
      const jwtSecret = (process.env.JWT_SECRET ?? "").trim();
      if (!jwtSecret) {
        throw new Error("Server configuration error");
      }
      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ["HS256"]
      });
      const userId = typeof decoded.id === "string" ? decoded.id : "";
      if (!userId) {
        throw new Error("Invalid token payload");
      }
      const tokenType = typeof decoded.type === "string" ? decoded.type : "";
      if (tokenType && tokenType !== "access") {
        throw new Error("Invalid token type");
      }
      return {
        userId,
        jti: typeof decoded.jti === "string" ? decoded.jti : ""
      };
    };
    authMiddleware = async (req, res, next) => {
      try {
        const token = extractToken(req);
        if (!token) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        const decoded = decodeAccessToken(token);
        if (decoded.jti && await isTokenRevoked(decoded.jti)) {
          return res.status(401).json({ message: "Token has been revoked" });
        }
        const user = await user_default.findById(decoded.userId).select(
          "-passwordHash -passwordHistory -passwordResetTokenHash -passwordResetExpiresAt"
        );
        if (!user) {
          return res.status(401).json({ message: "Invalid token" });
        }
        req.user = user;
        next();
      } catch {
        return res.status(401).json({ message: "Invalid token" });
      }
    };
  }
});

// backend/src/models/interviewSession.ts
import mongoose2, { Schema as Schema2 } from "mongoose";
var QAEntrySchema, InterviewSessionSchema, interviewSession_default;
var init_interviewSession = __esm({
  "backend/src/models/interviewSession.ts"() {
    "use strict";
    QAEntrySchema = new Schema2(
      {
        question: { type: String, required: true },
        answer: { type: String, default: "" },
        category: { type: String },
        speechTranscript: { type: String, maxlength: 5e3 },
        answerDurationSec: { type: Number, min: 0, max: 7200 },
        cameraSnapshot: { type: String, maxlength: 45e4 },
        recordingFileId: { type: String },
        recordingMimeType: { type: String },
        recordingSizeBytes: { type: Number, min: 0 },
        feedback: {
          technical: Number,
          clarity: Number,
          completeness: Number,
          overall: Number,
          suggestion: String,
          strengths: [String],
          improvements: [String]
        }
      },
      { _id: false }
    );
    InterviewSessionSchema = new Schema2(
      {
        userId: { type: Schema2.Types.ObjectId, ref: "User", required: true },
        role: { type: String, required: true },
        difficulty: { type: String, required: true },
        questions: { type: [QAEntrySchema], default: [] },
        startedAt: { type: Date, default: Date.now },
        lastActivityAt: { type: Date, default: Date.now }
      },
      { timestamps: true }
    );
    InterviewSessionSchema.index({ userId: 1, lastActivityAt: -1 });
    InterviewSessionSchema.index({ userId: 1, role: 1, lastActivityAt: -1 });
    InterviewSessionSchema.index({ userId: 1, _id: -1 });
    interviewSession_default = mongoose2.models.InterviewSession || mongoose2.model(
      "InterviewSession",
      InterviewSessionSchema
    );
  }
});

// backend/src/middleware/validation.middleware.ts
import { body, validationResult } from "express-validator";
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join("; ");
    return res.status(400).json({ success: false, message: msg });
  }
  next();
}
var ROLE_MIN_LENGTH, ROLE_MAX_LENGTH, CATEGORY_MAX_LENGTH, QUESTION_MAX_LENGTH, ANSWER_MAX_LENGTH, TRANSCRIPT_MAX_LENGTH, CAMERA_SNAPSHOT_MAX_LENGTH, RESET_TOKEN_MIN_LENGTH, RESET_TOKEN_MAX_LENGTH, signupValidation, loginValidation, forgotPasswordValidation, resetPasswordValidation, googleAuthValidation, interviewStartValidation, feedbackValidation;
var init_validation_middleware = __esm({
  "backend/src/middleware/validation.middleware.ts"() {
    "use strict";
    ROLE_MIN_LENGTH = 2;
    ROLE_MAX_LENGTH = 80;
    CATEGORY_MAX_LENGTH = 60;
    QUESTION_MAX_LENGTH = 1e3;
    ANSWER_MAX_LENGTH = 5e3;
    TRANSCRIPT_MAX_LENGTH = 5e3;
    CAMERA_SNAPSHOT_MAX_LENGTH = 45e4;
    RESET_TOKEN_MIN_LENGTH = 40;
    RESET_TOKEN_MAX_LENGTH = 200;
    signupValidation = [
      body("name").trim().isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters"),
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
      body("password").isLength({ min: 12, max: 128 }).withMessage("Password must be between 12 and 128 characters").matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter").matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter").matches(/\d/).withMessage("Password must contain at least one number").matches(/[^A-Za-z0-9]/).withMessage("Password must contain at least one special character").not().matches(/\s/).withMessage("Password cannot include spaces")
    ];
    loginValidation = [
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
      body("password").isString().notEmpty().withMessage("Password is required")
    ];
    forgotPasswordValidation = [
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required")
    ];
    resetPasswordValidation = [
      body("token").trim().isLength({ min: RESET_TOKEN_MIN_LENGTH, max: RESET_TOKEN_MAX_LENGTH }).withMessage("A valid password reset token is required"),
      body("password").isLength({ min: 12, max: 128 }).withMessage("Password must be between 12 and 128 characters").matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter").matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter").matches(/\d/).withMessage("Password must contain at least one number").matches(/[^A-Za-z0-9]/).withMessage("Password must contain at least one special character").not().matches(/\s/).withMessage("Password cannot include spaces")
    ];
    googleAuthValidation = [
      body("credential").trim().isLength({ min: 20, max: 4096 }).withMessage("A valid Google credential is required")
    ];
    interviewStartValidation = [
      body("role").optional().isString().trim().isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH }).withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
      body("difficulty").optional().isString().trim().isIn(["Easy", "Medium", "FAANG"]).withMessage("Difficulty must be one of: Easy, Medium, FAANG"),
      body("category").optional().isString().trim().isLength({ min: 2, max: CATEGORY_MAX_LENGTH }).withMessage(`Category must be between 2 and ${CATEGORY_MAX_LENGTH} characters`),
      body("previousQuestions").optional().isArray({ max: 20 }).withMessage("previousQuestions can contain at most 20 items"),
      body("previousQuestions.*").optional().isString().trim().isLength({ min: 3, max: QUESTION_MAX_LENGTH }).withMessage(`Each previous question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
      body("previousCategories").optional().isArray({ max: 20 }).withMessage("previousCategories can contain at most 20 items"),
      body("previousCategories.*").optional().isString().trim().isLength({ min: 2, max: CATEGORY_MAX_LENGTH }).withMessage(`Each previous category must be between 2 and ${CATEGORY_MAX_LENGTH} characters`),
      body("sessionId").optional().isMongoId().withMessage("sessionId must be a valid identifier")
    ];
    feedbackValidation = [
      body("role").trim().isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH }).withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
      body("question").trim().isLength({ min: 3, max: QUESTION_MAX_LENGTH }).withMessage(`Question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
      body("answer").trim().isLength({ min: 1, max: ANSWER_MAX_LENGTH }).withMessage(`Answer must be between 1 and ${ANSWER_MAX_LENGTH} characters`),
      body("expectedPoints").optional().isArray({ max: 8 }).withMessage("expectedPoints can contain at most 8 items"),
      body("expectedPoints.*").optional().isString().trim().isLength({ min: 2, max: 240 }).withMessage("Each expected point must be between 2 and 240 characters"),
      body("speechTranscript").optional().isString().trim().isLength({ max: TRANSCRIPT_MAX_LENGTH }).withMessage(`speechTranscript can be at most ${TRANSCRIPT_MAX_LENGTH} characters`),
      body("answerDurationSec").optional().isInt({ min: 0, max: 7200 }).withMessage("answerDurationSec must be between 0 and 7200 seconds"),
      body("cameraSnapshot").optional().isString().isLength({ max: CAMERA_SNAPSHOT_MAX_LENGTH }).withMessage(`cameraSnapshot is too large (max ${CAMERA_SNAPSHOT_MAX_LENGTH} chars)`).matches(/^data:image\/(jpeg|jpg|png);base64,/i).withMessage("cameraSnapshot must be a base64 encoded image data URL"),
      body("sessionQuestionIndex").optional().isInt({ min: 0, max: 200 }).withMessage("sessionQuestionIndex must be between 0 and 200"),
      body("sessionId").optional().isMongoId().withMessage("sessionId must be a valid identifier")
    ];
  }
});

// backend/src/lib/rateLimitStore.ts
var asNumber, InMemoryRateLimitStore, UpstashRedisRateLimitStore, singletonStore2, getRateLimitStore;
var init_rateLimitStore = __esm({
  "backend/src/lib/rateLimitStore.ts"() {
    "use strict";
    init_env();
    asNumber = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };
    InMemoryRateLimitStore = class {
      constructor(cleanupIntervalMs = 6e4) {
        this.buckets = /* @__PURE__ */ new Map();
        this.cleanupTimer = setInterval(() => {
          const now = Date.now();
          for (const [key, entry] of this.buckets.entries()) {
            if (entry.resetAt <= now) {
              this.buckets.delete(key);
            }
          }
        }, cleanupIntervalMs);
        this.cleanupTimer.unref();
      }
      async consume(params) {
        const now = Date.now();
        const { redisKeyPrefix: redisKeyPrefix3 } = getEnvConfig();
        const namespacedKey = `${redisKeyPrefix3}:${params.bucket}:${params.key}`;
        const existing = this.buckets.get(namespacedKey);
        if (!existing || existing.resetAt <= now) {
          const resetAt = now + params.windowMs;
          this.buckets.set(namespacedKey, { count: 1, resetAt });
          return {
            count: 1,
            remaining: Math.max(0, params.max - 1),
            resetAt,
            retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1e3)),
            limited: false
          };
        }
        existing.count += 1;
        return {
          count: existing.count,
          remaining: Math.max(0, params.max - existing.count),
          resetAt: existing.resetAt,
          retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1e3)),
          limited: existing.count > params.max
        };
      }
    };
    UpstashRedisRateLimitStore = class {
      constructor(endpoint, token) {
        this.endpoint = endpoint.replace(/\/+$/, "");
        this.token = token;
      }
      async consume(params) {
        const now = Date.now();
        const { redisKeyPrefix: redisKeyPrefix3 } = getEnvConfig();
        const key = `${redisKeyPrefix3}:${params.bucket}:${params.key}`;
        const response = await fetch(`${this.endpoint}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify([
            ["INCR", key],
            ["PEXPIRE", key, `${params.windowMs}`, "NX"],
            ["PTTL", key]
          ])
        });
        if (!response.ok) {
          throw new Error(`Redis rate-limit request failed with status ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.some((entry) => entry?.error)) {
          throw new Error("Redis rate-limit response payload is invalid");
        }
        const count = Math.max(1, Math.trunc(asNumber(payload[0]?.result)));
        let ttlMs = Math.trunc(asNumber(payload[2]?.result));
        if (ttlMs <= 0) {
          ttlMs = params.windowMs;
        }
        const resetAt = now + ttlMs;
        return {
          count,
          remaining: Math.max(0, params.max - count),
          resetAt,
          retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1e3)),
          limited: count > params.max
        };
      }
    };
    singletonStore2 = null;
    getRateLimitStore = () => {
      if (singletonStore2) {
        return singletonStore2;
      }
      const { redisRestUrl, redisRestToken } = getEnvConfig();
      if (redisRestUrl && redisRestToken) {
        singletonStore2 = new UpstashRedisRateLimitStore(redisRestUrl, redisRestToken);
        return singletonStore2;
      }
      singletonStore2 = new InMemoryRateLimitStore();
      return singletonStore2;
    };
  }
});

// backend/src/middleware/rateLimit.middleware.ts
var rateLimitStore, getClientKey, createRateLimiter, authRateLimit, interviewRateLimit, feedbackRateLimit, feedbackPollRateLimit, resumeRateLimit, recordingRateLimit;
var init_rateLimit_middleware = __esm({
  "backend/src/middleware/rateLimit.middleware.ts"() {
    "use strict";
    init_rateLimitStore();
    rateLimitStore = getRateLimitStore();
    getClientKey = (req) => {
      const forwardedFor = req.headers["x-forwarded-for"];
      const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      const forwarded = typeof forwardedValue === "string" ? forwardedValue.split(",")[0].trim() : "";
      return forwarded || req.ip || "unknown";
    };
    createRateLimiter = ({ bucket, windowMs, max, message }) => {
      return async (req, res, next) => {
        try {
          const result = await rateLimitStore.consume({
            bucket,
            key: getClientKey(req),
            windowMs,
            max
          });
          res.setHeader("X-RateLimit-Limit", max.toString());
          res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
          res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1e3).toString());
          if (result.limited) {
            res.setHeader("Retry-After", result.retryAfterSec.toString());
            return res.status(429).json({
              success: false,
              message
            });
          }
          next();
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Rate limiter fallback (store unavailable):", error);
          }
          next();
        }
      };
    };
    authRateLimit = createRateLimiter({
      bucket: "rl:auth",
      windowMs: 15 * 60 * 1e3,
      max: 20,
      message: "Too many authentication attempts. Try again later."
    });
    interviewRateLimit = createRateLimiter({
      bucket: "rl:interview",
      windowMs: 60 * 1e3,
      max: 30,
      message: "Too many interview requests. Please slow down."
    });
    feedbackRateLimit = createRateLimiter({
      bucket: "rl:feedback",
      windowMs: 60 * 1e3,
      max: 25,
      message: "Too many feedback requests. Please slow down."
    });
    feedbackPollRateLimit = createRateLimiter({
      bucket: "rl:feedback-poll",
      windowMs: 60 * 1e3,
      max: 120,
      message: "Too many evaluation status checks. Please slow down."
    });
    resumeRateLimit = createRateLimiter({
      bucket: "rl:resume",
      windowMs: 5 * 60 * 1e3,
      max: 10,
      message: "Too many resume upload attempts. Please wait and try again."
    });
    recordingRateLimit = createRateLimiter({
      bucket: "rl:recording",
      windowMs: 60 * 1e3,
      max: 12,
      message: "Too many recording uploads. Please slow down."
    });
  }
});

// backend/src/routes/interview.routes.ts
import { Router } from "express";
var router, interview_routes_default;
var init_interview_routes = __esm({
  "backend/src/routes/interview.routes.ts"() {
    "use strict";
    init_openai_service();
    init_auth_middleware();
    init_interviewSession();
    init_validation_middleware();
    init_rateLimit_middleware();
    router = Router();
    router.post(
      "/start",
      authMiddleware,
      interviewRateLimit,
      ...interviewStartValidation,
      handleValidationErrors,
      async (req, res) => {
        try {
          const user = req.user;
          const { role, difficulty, category, previousQuestions, previousCategories, sessionId } = req.body;
          const resolvedRole = role || "Software Engineer";
          const resolvedDifficulty = difficulty || "Medium";
          const resolvedCategory = category || "Mixed";
          const prior = Array.isArray(previousQuestions) ? previousQuestions : [];
          const priorCategories = Array.isArray(previousCategories) ? previousCategories : [];
          const question = await generateQuestion(
            resolvedRole,
            resolvedDifficulty,
            prior,
            resolvedCategory,
            priorCategories
          );
          let session;
          if (sessionId) {
            session = await interviewSession_default.findOneAndUpdate(
              { _id: sessionId, userId: user._id },
              {
                $push: {
                  questions: { question: question.prompt, answer: "", category: question.category }
                },
                lastActivityAt: /* @__PURE__ */ new Date()
              },
              { new: true }
            );
          } else {
            session = await interviewSession_default.create({
              userId: user._id,
              role: resolvedRole,
              difficulty: resolvedDifficulty,
              questions: [{ question: question.prompt, answer: "", category: question.category }]
            });
          }
          if (!session) {
            return res.status(404).json({
              success: false,
              message: "Session not found"
            });
          }
          const questionIndex = Math.max(0, session.questions.length - 1);
          return res.json({ question, sessionId: session._id, questionIndex });
        } catch (error) {
          const isProduction4 = process.env.NODE_ENV === "production";
          if (error instanceof AiProviderError) {
            const message2 = isProduction4 ? error.message : `${error.message} (${error.code})`;
            return res.status(error.statusCode).json({
              success: false,
              message: message2,
              errorCode: error.code
            });
          }
          const message = error instanceof Error && !isProduction4 ? error.message : "Failed to generate question";
          return res.status(500).json({
            success: false,
            message
          });
        }
      }
    );
    interview_routes_default = router;
  }
});

// backend/src/services/feedback.service.ts
import axios2 from "axios";
async function generateFeedback(role, question, answer, expectedPoints = [], options = {}) {
  const heuristicResult = generateHeuristicFeedback(role, question, answer, expectedPoints);
  const heuristics = buildHeuristicAssessment(
    cleanText2(question, 1e3),
    cleanText2(answer, 5e3),
    expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText2(item, 200)).filter(Boolean).slice(0, 8)
  );
  if (options.skipProvider || heuristics.lowConfidence || heuristics.wordCount < 8) {
    return heuristicResult;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return heuristicResult;
  }
  const safeRole = cleanText2(role, 80);
  const safeQuestion = cleanText2(question, 1e3);
  const safeAnswer = cleanText2(answer, 5e3);
  const safeExpectedPoints = expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText2(item, 200)).filter(Boolean).slice(0, 8);
  const requestTimeoutMs = Number.isFinite(options.providerTimeoutMs) ? Math.max(2e3, Math.min(9e3, Number(options.providerTimeoutMs))) : DEFAULT_REQUEST_TIMEOUT_MS;
  const expectedPointsGuidance = safeExpectedPoints.length ? `Expected points:
- ${safeExpectedPoints.join("\n- ")}` : "Expected points were not supplied.";
  const prompt = `
You are an interviewer evaluating a ${safeRole} candidate.

Score this answer from 0 to 10 in:
1) technical correctness
2) clarity
3) completeness

Important:
- Penalize incorrect facts and missing key concepts.
- Do not give high technical/completeness scores when core points are wrong or missing.
- If the answer is generic or off-topic, keep technical/completeness low.
- Keep output concise and specific.

${expectedPointsGuidance}

Return JSON only:
{
  "feedback": {
    "technical": 0,
    "clarity": 0,
    "completeness": 0,
    "overall": 0,
    "strengths": ["..."],
    "improvements": ["..."],
    "suggestion": "..."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "...",
    "expectedPoints": ["..."]
  }
}

Question: ${safeQuestion}
Answer: ${safeAnswer}
`;
  const referer = process.env.FRONTEND_URL?.startsWith("http") ? process.env.FRONTEND_URL : "https://interviewpilot.app";
  try {
    const { result: response, model: selectedModel } = await executeWithAiResilience({
      operation: "feedback_evaluation",
      primaryModel: FEEDBACK_PRIMARY_MODEL,
      fallbackModels: FEEDBACK_FALLBACK_MODELS,
      maxRetries: 2,
      execute: async (model) => axios2.post(
        OPENROUTER_ENDPOINT2,
        {
          model,
          messages: [
            { role: "system", content: "You are a strict and accurate interview evaluator." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1,
          max_tokens: RESPONSE_MAX_TOKENS2
        },
        {
          timeout: requestTimeoutMs,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": referer,
            "X-Title": "InterviewPilot Coach",
            "Content-Type": "application/json"
          }
        }
      ),
      isRetriableError: isRetriableProviderError2
    });
    logger.info("ai.feedback_model_selected", {
      model: selectedModel,
      role: safeRole
    });
    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return heuristicResult;
    }
    const parsed = parseFeedback(text);
    if (!parsed) {
      return heuristicResult;
    }
    return {
      feedback: calibrateFeedback(parsed.feedback, heuristics),
      followUp: parsed.followUp || heuristicResult.followUp,
      source: "ai_calibrated"
    };
  } catch (error) {
    if (axios2.isAxiosError(error)) {
      logger.warn("ai.feedback_provider_fallback_used", {
        status: error.response?.status,
        code: error.code
      });
    } else if (error instanceof Error) {
      logger.warn("ai.feedback_provider_fallback_used", {
        message: error.message
      });
    }
    return heuristicResult;
  }
}
var OPENROUTER_ENDPOINT2, DEFAULT_MODEL2, DEFAULT_REQUEST_TIMEOUT_MS, RESPONSE_MAX_TOKENS2, FEEDBACK_PRIMARY_MODEL, FEEDBACK_FALLBACK_MODELS, STOP_WORDS, cleanText2, normalizeText, clampScore, roundToOneDecimal, extractJson2, sanitizeList, toMeaningfulTokens, uniqueRatio, extractKeywords, topicalityScore, hasLowConfidenceLanguage, matchesExpectedPoint, buildHeuristicAssessment, calibrateFeedback, parseFeedback, isRetriableProviderError2, generateHeuristicFeedback;
var init_feedback_service = __esm({
  "backend/src/services/feedback.service.ts"() {
    "use strict";
    init_aiResilience();
    init_observability();
    OPENROUTER_ENDPOINT2 = "https://openrouter.ai/api/v1/chat/completions";
    DEFAULT_MODEL2 = "meta-llama/llama-3.1-8b-instruct:free";
    DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.FEEDBACK_PROVIDER_TIMEOUT_MS ?? "5200", 10);
    RESPONSE_MAX_TOKENS2 = 450;
    FEEDBACK_PRIMARY_MODEL = process.env.OPENROUTER_FEEDBACK_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL2;
    FEEDBACK_FALLBACK_MODELS = (process.env.OPENROUTER_FEEDBACK_FALLBACK_MODELS || process.env.OPENROUTER_MODEL_FALLBACKS || "").split(",").map((item) => item.trim()).filter(Boolean);
    STOP_WORDS = /* @__PURE__ */ new Set([
      "the",
      "and",
      "with",
      "that",
      "this",
      "from",
      "have",
      "your",
      "into",
      "about",
      "would",
      "there",
      "their",
      "should",
      "were",
      "then",
      "they",
      "them",
      "been",
      "over",
      "only",
      "also",
      "just",
      "some",
      "when",
      "what",
      "where",
      "while",
      "which",
      "through",
      "because",
      "could",
      "being",
      "very",
      "more",
      "than",
      "will",
      "each",
      "other"
    ]);
    cleanText2 = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
    normalizeText = (value) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    clampScore = (value) => {
      if (typeof value !== "number" || Number.isNaN(value)) return 0;
      return Math.max(0, Math.min(10, Number(value.toFixed(1))));
    };
    roundToOneDecimal = (value) => Math.round(value * 10) / 10;
    extractJson2 = (value) => {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
      }
      const match = trimmed.match(/\{[\s\S]*\}/);
      return match ? match[0] : "";
    };
    sanitizeList = (value, maxItems, itemMaxLength) => {
      if (!Array.isArray(value)) return [];
      return value.filter((item) => typeof item === "string").map((item) => cleanText2(item, itemMaxLength)).filter(Boolean).slice(0, maxItems);
    };
    toMeaningfulTokens = (value) => normalizeText(value).split(" ").map((token) => token.trim()).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
    uniqueRatio = (tokens) => {
      if (tokens.length === 0) return 1;
      return new Set(tokens).size / tokens.length;
    };
    extractKeywords = (value, maxItems) => {
      const counts = /* @__PURE__ */ new Map();
      for (const token of toMeaningfulTokens(value)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token).slice(0, maxItems);
    };
    topicalityScore = (question, answer) => {
      const questionKeywords = extractKeywords(question, 16);
      if (questionKeywords.length === 0) {
        return 0.5;
      }
      const answerTokenSet = new Set(toMeaningfulTokens(answer));
      const overlapCount = questionKeywords.filter((token) => answerTokenSet.has(token)).length;
      return overlapCount / questionKeywords.length;
    };
    hasLowConfidenceLanguage = (answer) => /\b(i\s+(don'?t|do not|can'?t|cannot|am not sure)|not sure|no idea|idk|just guessing)\b/i.test(
      answer
    );
    matchesExpectedPoint = (expectedPoint, normalizedAnswer) => {
      const normalizedPoint = normalizeText(expectedPoint);
      if (!normalizedPoint) return false;
      if (normalizedAnswer.includes(normalizedPoint)) {
        return true;
      }
      const keywords = normalizedPoint.split(" ").filter((token) => token.length > 3 && !STOP_WORDS.has(token)).slice(0, 6);
      if (keywords.length === 0) {
        return false;
      }
      const matchCount = keywords.filter((keyword) => normalizedAnswer.includes(keyword)).length;
      const threshold = Math.max(1, Math.ceil(keywords.length * 0.5));
      return matchCount >= threshold;
    };
    buildHeuristicAssessment = (question, answer, expectedPoints) => {
      const normalizedAnswer = normalizeText(answer);
      const wordCount = normalizedAnswer ? normalizedAnswer.split(" ").length : 0;
      const lowConfidence = hasLowConfidenceLanguage(answer);
      const topicalityRatio = topicalityScore(question, answer);
      const answerTokens = toMeaningfulTokens(answer);
      const repeatedLanguage = wordCount >= 24 && uniqueRatio(answerTokens) < 0.42;
      const matchedPoints = expectedPoints.filter(
        (point) => matchesExpectedPoint(point, normalizedAnswer)
      );
      const missingPoints = expectedPoints.filter((point) => !matchedPoints.includes(point));
      const coverageRatio = expectedPoints.length > 0 ? matchedPoints.length / expectedPoints.length : 0;
      let technical = 2.2;
      let completeness = 2.2;
      let clarity = 2.6 + Math.min(wordCount, 180) / 36;
      if (expectedPoints.length > 0) {
        technical = 1.4 + coverageRatio * 7.6;
        completeness = 1.2 + coverageRatio * 8.1;
      } else {
        const topicalityBoost = topicalityRatio * 5.1;
        technical = 1.8 + topicalityBoost + Math.min(wordCount, 140) / 70;
        completeness = 1.7 + topicalityBoost + Math.min(wordCount, 140) / 72;
      }
      if (wordCount < 45) {
        clarity -= 0.7;
      }
      if (wordCount < 22) {
        technical = Math.min(technical, 4.3);
        completeness = Math.min(completeness, 4.1);
        clarity = Math.min(clarity, 5.1);
      }
      if (wordCount < 12) {
        technical = Math.min(technical, 2.9);
        completeness = Math.min(completeness, 2.8);
        clarity = Math.min(clarity, 4.2);
      }
      if (expectedPoints.length >= 2) {
        if (coverageRatio < 0.34) {
          technical = Math.min(technical, 4.8);
          completeness = Math.min(completeness, 4.6);
        }
        if (coverageRatio === 0) {
          technical = Math.min(technical, 2.9);
          completeness = Math.min(completeness, 2.7);
        }
      }
      if (topicalityRatio < 0.22) {
        technical = Math.min(technical, 4.2);
        completeness = Math.min(completeness, 4);
      }
      if (topicalityRatio < 0.1) {
        technical = Math.min(technical, 3.2);
        completeness = Math.min(completeness, 3);
      }
      if (repeatedLanguage) {
        technical = Math.min(technical, 3.4);
        completeness = Math.min(completeness, 3.3);
        clarity = Math.min(clarity, 4.8);
      }
      if (lowConfidence) {
        technical = Math.min(technical, 2.5);
        completeness = Math.min(completeness, 2.6);
        clarity = Math.min(clarity, 4.5);
      }
      technical = clampScore(technical);
      clarity = clampScore(clarity);
      completeness = clampScore(completeness);
      const overall = clampScore(
        roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3)
      );
      let confidenceBand = "high";
      if (lowConfidence || repeatedLanguage || wordCount < 20 || topicalityRatio < 0.2 || expectedPoints.length >= 2 && coverageRatio === 0) {
        confidenceBand = "low";
      } else if (topicalityRatio < 0.42 || expectedPoints.length >= 2 && coverageRatio < 0.6) {
        confidenceBand = "medium";
      }
      const strengths = [];
      if (clarity >= 6) {
        strengths.push("Your response is easy to follow.");
      }
      if (wordCount >= 35) {
        strengths.push("You provided enough detail for meaningful evaluation.");
      }
      if (topicalityRatio >= 0.45) {
        strengths.push("You stayed relevant to the exact question.");
      }
      if (matchedPoints.length > 0) {
        strengths.push(
          `You covered ${matchedPoints.length} key point${matchedPoints.length > 1 ? "s" : ""}.`
        );
      }
      if (strengths.length === 0) {
        strengths.push("You attempted the question and gave an initial direction.");
      }
      const improvements = [];
      if (topicalityRatio < 0.28) {
        improvements.push("Stay closer to the exact question and avoid generic statements.");
      }
      if (missingPoints.length > 0) {
        improvements.push(`Address these missing points: ${missingPoints.join("; ")}.`);
      }
      if (technical <= 4.5) {
        improvements.push("Correct technical inaccuracies before the next attempt.");
      }
      if (completeness <= 4.5) {
        improvements.push("Explain trade-offs, edge cases, and implementation details.");
      }
      if (improvements.length === 0) {
        improvements.push("Add one concrete project example to make your answer stronger.");
      }
      const suggestion = cleanText2(improvements[0], 420) || "Add clearer technical depth and concrete evidence.";
      const followUpPoint = missingPoints[0];
      const followUpPrompt = followUpPoint ? `Can you explain ${followUpPoint.toLowerCase()} and how you would apply it in this scenario?` : `Can you walk through one concrete example for this question and discuss the trade-offs?`;
      return {
        feedback: {
          technical,
          clarity,
          completeness,
          overall,
          suggestion,
          strengths: strengths.map((item) => cleanText2(item, 160)).slice(0, 4),
          improvements: improvements.map((item) => cleanText2(item, 160)).slice(0, 4)
        },
        followUp: {
          qid: "followup1",
          prompt: cleanText2(followUpPrompt, 1e3),
          expectedPoints: missingPoints.map((item) => cleanText2(item, 240)).slice(0, 3)
        },
        coverageRatio,
        expectedPointCount: expectedPoints.length,
        lowConfidence,
        wordCount,
        topicalityRatio,
        repeatedLanguage,
        confidenceBand
      };
    };
    calibrateFeedback = (aiFeedback, heuristics) => {
      const technicalHeadroom = heuristics.confidenceBand === "high" ? 1.1 : 0.6;
      const completenessHeadroom = heuristics.confidenceBand === "high" ? 1.1 : 0.6;
      const clarityHeadroom = heuristics.confidenceBand === "low" ? 0.8 : 1.4;
      let technical = clampScore(Math.min(aiFeedback.technical, heuristics.feedback.technical + technicalHeadroom));
      let completeness = clampScore(
        Math.min(aiFeedback.completeness, heuristics.feedback.completeness + completenessHeadroom)
      );
      let clarity = clampScore(Math.min(aiFeedback.clarity, heuristics.feedback.clarity + clarityHeadroom));
      if (heuristics.expectedPointCount >= 2 && heuristics.coverageRatio < 0.34) {
        technical = Math.min(technical, 5);
        completeness = Math.min(completeness, 5);
      }
      if (heuristics.expectedPointCount >= 2 && heuristics.coverageRatio === 0) {
        technical = Math.min(technical, 3);
        completeness = Math.min(completeness, 3);
      }
      if (heuristics.lowConfidence || heuristics.wordCount < 12) {
        technical = Math.min(technical, 3.5);
        completeness = Math.min(completeness, 3.5);
      }
      if (heuristics.topicalityRatio < 0.22) {
        technical = Math.min(technical, 4.3);
        completeness = Math.min(completeness, 4.1);
      }
      if (heuristics.topicalityRatio < 0.12) {
        technical = Math.min(technical, 3.3);
        completeness = Math.min(completeness, 3.2);
      }
      if (heuristics.repeatedLanguage) {
        technical = Math.min(technical, 3.5);
        completeness = Math.min(completeness, 3.4);
        clarity = Math.min(clarity, 5);
      }
      if (heuristics.confidenceBand === "low") {
        technical = Math.min(technical, 5);
        completeness = Math.min(completeness, 5);
      }
      technical = clampScore(technical);
      clarity = clampScore(clarity);
      completeness = clampScore(completeness);
      const overall = clampScore(roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3));
      return {
        technical,
        clarity,
        completeness,
        overall,
        suggestion: cleanText2(aiFeedback.suggestion, 420) || heuristics.feedback.suggestion,
        strengths: aiFeedback.strengths.length > 0 ? aiFeedback.strengths.map((item) => cleanText2(item, 160)).slice(0, 4) : heuristics.feedback.strengths,
        improvements: aiFeedback.improvements.length > 0 ? aiFeedback.improvements.map((item) => cleanText2(item, 160)).slice(0, 4) : heuristics.feedback.improvements
      };
    };
    parseFeedback = (raw) => {
      try {
        const parsed = JSON.parse(extractJson2(raw));
        const feedback = parsed.feedback;
        if (!feedback) return null;
        const technical = clampScore(feedback.technical);
        const clarity = clampScore(feedback.clarity);
        const completeness = clampScore(feedback.completeness);
        const fallbackOverall = roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3);
        const strengths = sanitizeList(feedback.strengths, 4, 160);
        const improvements = sanitizeList(feedback.improvements, 4, 160);
        const sanitizedFeedback = {
          technical,
          clarity,
          completeness,
          overall: typeof feedback.overall === "number" && Number.isFinite(feedback.overall) ? clampScore(feedback.overall) : fallbackOverall,
          suggestion: cleanText2(
            typeof feedback.suggestion === "string" ? feedback.suggestion : "No suggestion generated",
            420
          ),
          strengths,
          improvements
        };
        const followUp = parsed.followUp;
        const sanitizedFollowUp = followUp && typeof followUp.prompt === "string" ? {
          qid: typeof followUp.qid === "string" ? cleanText2(followUp.qid, 40) || "followup1" : "followup1",
          prompt: cleanText2(followUp.prompt, 1e3),
          expectedPoints: sanitizeList(followUp.expectedPoints, 6, 240)
        } : null;
        return {
          feedback: sanitizedFeedback,
          followUp: sanitizedFollowUp
        };
      } catch {
        return null;
      }
    };
    isRetriableProviderError2 = (error) => {
      if (!axios2.isAxiosError(error)) {
        return false;
      }
      const status = error.response?.status;
      if (!status) {
        return true;
      }
      return status === 429 || status >= 500 || error.code === "ECONNABORTED";
    };
    generateHeuristicFeedback = (role, question, answer, expectedPoints = []) => {
      const safeRole = cleanText2(role || "Software Engineer", 80);
      const safeQuestion = cleanText2(question, 1e3);
      const safeAnswer = cleanText2(answer, 5e3);
      const safeExpectedPoints = expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText2(item, 200)).filter(Boolean).slice(0, 8);
      const heuristics = buildHeuristicAssessment(safeQuestion, safeAnswer, safeExpectedPoints);
      return {
        feedback: {
          ...heuristics.feedback,
          suggestion: heuristics.feedback.suggestion || `Keep your answer for ${safeRole} focused on technical correctness and concrete examples.`
        },
        followUp: heuristics.followUp,
        source: "heuristic"
      };
    };
  }
});

// backend/src/models/feedbackJob.ts
import mongoose3, { Schema as Schema3 } from "mongoose";
var FollowUpSchema, FeedbackBreakdownSchema, FeedbackJobSchema, feedbackJob_default;
var init_feedbackJob = __esm({
  "backend/src/models/feedbackJob.ts"() {
    "use strict";
    FollowUpSchema = new Schema3(
      {
        qid: { type: String, maxlength: 40 },
        prompt: { type: String, maxlength: 1e3 },
        expectedPoints: [{ type: String, maxlength: 240 }]
      },
      { _id: false }
    );
    FeedbackBreakdownSchema = new Schema3(
      {
        technical: { type: Number, min: 0, max: 10 },
        clarity: { type: Number, min: 0, max: 10 },
        completeness: { type: Number, min: 0, max: 10 },
        overall: { type: Number, min: 0, max: 10 },
        suggestion: { type: String, maxlength: 420 },
        strengths: [{ type: String, maxlength: 160 }],
        improvements: [{ type: String, maxlength: 160 }]
      },
      { _id: false }
    );
    FeedbackJobSchema = new Schema3(
      {
        userId: { type: Schema3.Types.ObjectId, ref: "User", required: true, index: true },
        sessionId: { type: Schema3.Types.ObjectId, ref: "InterviewSession" },
        sessionQuestionIndex: { type: Number, min: 0, max: 200 },
        role: { type: String, required: true, maxlength: 80 },
        question: { type: String, required: true, maxlength: 1e3 },
        answer: { type: String, required: true, maxlength: 5e3 },
        expectedPoints: { type: [String], default: [] },
        speechTranscript: { type: String, maxlength: 5e3 },
        answerDurationSec: { type: Number, min: 0, max: 7200 },
        cameraSnapshot: { type: String, maxlength: 45e4 },
        status: {
          type: String,
          enum: ["pending", "processing", "completed", "failed"],
          default: "pending",
          required: true,
          index: true
        },
        attempts: { type: Number, default: 0, min: 0 },
        processingStartedAt: { type: Date },
        lastError: { type: String, maxlength: 280 },
        provisionalFeedback: { type: FeedbackBreakdownSchema },
        provisionalFollowUp: { type: FollowUpSchema, default: null },
        result: {
          feedback: { type: FeedbackBreakdownSchema },
          followUp: { type: FollowUpSchema, default: null },
          source: { type: String, enum: ["heuristic", "ai_calibrated"] }
        },
        expiresAt: {
          type: Date,
          default: () => new Date(Date.now() + 1e3 * 60 * 60 * 24)
        }
      },
      { timestamps: true }
    );
    FeedbackJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    FeedbackJobSchema.index({ userId: 1, createdAt: -1 });
    FeedbackJobSchema.index({ userId: 1, status: 1, createdAt: -1 });
    FeedbackJobSchema.index({ sessionId: 1, sessionQuestionIndex: 1, createdAt: -1 });
    FeedbackJobSchema.index({ status: 1, processingStartedAt: 1 });
    feedbackJob_default = mongoose3.models.FeedbackJob || mongoose3.model("FeedbackJob", FeedbackJobSchema);
  }
});

// backend/src/services/feedbackJob.service.ts
import mongoose4 from "mongoose";
var JOB_PROCESS_STALE_MS, JOB_PROVIDER_TIMEOUT_MS, redisKeyPrefix2, JOB_QUEUE_NAMESPACE, JOB_QUEUE_READY_KEY, JOB_QUEUE_RETRY_KEY, JOB_QUEUE_DLQ_KEY, JOB_QUEUE_MARKER_PREFIX, JOB_QUEUE_POLL_MS, JOB_QUEUE_MAX_RETRIES, JOB_QUEUE_RETRY_BASE_MS, JOB_QUEUE_KEY_TTL_SEC, JOB_QUEUE_MARKER_TTL_SEC, normalizedText, runtimeStore2, queueWorkerTimer, queueWorkerActive, parseQueuePayload, getQueueMarkerKey, enqueueQueuePayload, moveDueRetryJobsToReady, queueRetry, queueDeadLetter, markJobFailed, enqueueFeedbackJob, processQueuePayload, runQueueWorkerTick, ensureQueueWorkerRunning, resolveTargetQuestionIndex, persistFeedbackToSession, resolveSessionQuestionIndex, createFeedbackJob, claimFeedbackJob, processFeedbackJob, getFeedbackJob, getFeedbackJobStatus, startFeedbackJobProcessing, startFeedbackQueueWorker, mapJobToApiResponse;
var init_feedbackJob_service = __esm({
  "backend/src/services/feedbackJob.service.ts"() {
    "use strict";
    init_feedbackJob();
    init_interviewSession();
    init_runtimeStore();
    init_env();
    init_feedback_service();
    JOB_PROCESS_STALE_MS = 3e4;
    JOB_PROVIDER_TIMEOUT_MS = 5200;
    ({ redisKeyPrefix: redisKeyPrefix2 } = getEnvConfig());
    JOB_QUEUE_NAMESPACE = `${redisKeyPrefix2}:queue:feedback`;
    JOB_QUEUE_READY_KEY = `${JOB_QUEUE_NAMESPACE}:ready`;
    JOB_QUEUE_RETRY_KEY = `${JOB_QUEUE_NAMESPACE}:retry`;
    JOB_QUEUE_DLQ_KEY = `${JOB_QUEUE_NAMESPACE}:dead`;
    JOB_QUEUE_MARKER_PREFIX = `${JOB_QUEUE_NAMESPACE}:marker`;
    JOB_QUEUE_POLL_MS = 750;
    JOB_QUEUE_MAX_RETRIES = 3;
    JOB_QUEUE_RETRY_BASE_MS = 2e3;
    JOB_QUEUE_KEY_TTL_SEC = 60 * 60 * 24;
    JOB_QUEUE_MARKER_TTL_SEC = 60 * 30;
    normalizedText = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    runtimeStore2 = getRuntimeStore();
    queueWorkerTimer = null;
    queueWorkerActive = false;
    parseQueuePayload = (value) => {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed.jobId !== "string" || typeof parsed.userId !== "string" || typeof parsed.attempt !== "number") {
          return null;
        }
        return {
          jobId: parsed.jobId,
          userId: parsed.userId,
          attempt: Math.max(0, Math.trunc(parsed.attempt)),
          queuedAt: typeof parsed.queuedAt === "number" && Number.isFinite(parsed.queuedAt) ? Math.trunc(parsed.queuedAt) : Date.now()
        };
      } catch {
        return null;
      }
    };
    getQueueMarkerKey = (jobId) => `${JOB_QUEUE_MARKER_PREFIX}:${jobId}`;
    enqueueQueuePayload = async (payload) => {
      await runtimeStore2.rpush(JOB_QUEUE_READY_KEY, JSON.stringify(payload));
      await runtimeStore2.expire(JOB_QUEUE_READY_KEY, JOB_QUEUE_KEY_TTL_SEC);
    };
    moveDueRetryJobsToReady = async () => {
      const now = Date.now();
      const due = await runtimeStore2.zrangeByScore(JOB_QUEUE_RETRY_KEY, now, 20);
      if (due.length === 0) {
        return;
      }
      for (const raw of due) {
        await runtimeStore2.zrem(JOB_QUEUE_RETRY_KEY, raw);
        await runtimeStore2.rpush(JOB_QUEUE_READY_KEY, raw);
      }
      await runtimeStore2.expire(JOB_QUEUE_READY_KEY, JOB_QUEUE_KEY_TTL_SEC);
    };
    queueRetry = async (payload) => {
      const nextAttempt = payload.attempt + 1;
      const backoffMs = JOB_QUEUE_RETRY_BASE_MS * Math.max(1, 2 ** payload.attempt);
      const jitterMs = Math.floor(Math.random() * 300);
      const nextRunAt = Date.now() + backoffMs + jitterMs;
      await runtimeStore2.zadd(
        JOB_QUEUE_RETRY_KEY,
        nextRunAt,
        JSON.stringify({
          ...payload,
          attempt: nextAttempt,
          queuedAt: Date.now()
        })
      );
      await runtimeStore2.expire(JOB_QUEUE_RETRY_KEY, JOB_QUEUE_KEY_TTL_SEC);
      await runtimeStore2.expire(getQueueMarkerKey(payload.jobId), JOB_QUEUE_MARKER_TTL_SEC);
    };
    queueDeadLetter = async (payload, reason) => {
      const deadPayload = {
        ...payload,
        reason,
        failedAt: Date.now()
      };
      await runtimeStore2.rpush(JOB_QUEUE_DLQ_KEY, JSON.stringify(deadPayload));
      await runtimeStore2.expire(JOB_QUEUE_DLQ_KEY, JOB_QUEUE_KEY_TTL_SEC);
    };
    markJobFailed = async (jobId, userId, reason) => {
      await feedbackJob_default.findOneAndUpdate(
        { _id: jobId, userId },
        {
          status: "failed",
          lastError: reason.slice(0, 280),
          $unset: { processingStartedAt: 1 }
        }
      );
    };
    enqueueFeedbackJob = async (params) => {
      const { jobId, userId, force = false } = params;
      const attempt = Math.max(0, Math.trunc(params.attempt ?? 0));
      if (!mongoose4.isValidObjectId(jobId)) {
        return false;
      }
      ensureQueueWorkerRunning();
      const markerKey = getQueueMarkerKey(jobId);
      const acquired = await runtimeStore2.setNxEx(markerKey, "1", JOB_QUEUE_MARKER_TTL_SEC);
      if (!acquired && !force) {
        return false;
      }
      if (!acquired && force) {
        await runtimeStore2.expire(markerKey, JOB_QUEUE_MARKER_TTL_SEC);
      }
      await enqueueQueuePayload({
        jobId,
        userId,
        attempt,
        queuedAt: Date.now()
      });
      return true;
    };
    processQueuePayload = async (payload) => {
      try {
        const result = await processFeedbackJob(payload.jobId, payload.userId);
        if (result?.status === "completed" || result?.status === "failed") {
          await runtimeStore2.del(getQueueMarkerKey(payload.jobId));
          return;
        }
        if (payload.attempt >= JOB_QUEUE_MAX_RETRIES) {
          await queueDeadLetter(payload, "max_retries_exceeded");
          await markJobFailed(payload.jobId, payload.userId, "max_retries_exceeded");
          await runtimeStore2.del(getQueueMarkerKey(payload.jobId));
          return;
        }
        await queueRetry(payload);
      } catch (error) {
        if (payload.attempt >= JOB_QUEUE_MAX_RETRIES) {
          const reason = error instanceof Error ? error.message : "processing_failed";
          await queueDeadLetter(payload, reason.slice(0, 280));
          await markJobFailed(payload.jobId, payload.userId, reason);
          await runtimeStore2.del(getQueueMarkerKey(payload.jobId));
          return;
        }
        await queueRetry(payload);
      }
    };
    runQueueWorkerTick = async () => {
      if (queueWorkerActive) {
        return;
      }
      queueWorkerActive = true;
      try {
        await moveDueRetryJobsToReady();
        const rawPayload = await runtimeStore2.lpop(JOB_QUEUE_READY_KEY);
        if (!rawPayload) {
          return;
        }
        const payload = parseQueuePayload(rawPayload);
        if (!payload) {
          return;
        }
        await processQueuePayload(payload);
      } finally {
        queueWorkerActive = false;
      }
    };
    ensureQueueWorkerRunning = () => {
      if (queueWorkerTimer) {
        return;
      }
      queueWorkerTimer = setInterval(() => {
        void runQueueWorkerTick();
      }, JOB_QUEUE_POLL_MS);
      queueWorkerTimer.unref();
    };
    resolveTargetQuestionIndex = (questions, question, preferredIndex) => {
      const normalizedQuestion = normalizedText(question);
      if (typeof preferredIndex === "number" && preferredIndex >= 0 && preferredIndex < questions.length && normalizedText(questions[preferredIndex].question) === normalizedQuestion) {
        return preferredIndex;
      }
      for (let index = questions.length - 1; index >= 0; index -= 1) {
        if (normalizedText(questions[index].question) !== normalizedQuestion) {
          continue;
        }
        if (!questions[index].answer || !questions[index].feedback) {
          return index;
        }
      }
      for (let index = questions.length - 1; index >= 0; index -= 1) {
        if (normalizedText(questions[index].question) === normalizedQuestion) {
          return index;
        }
      }
      return questions.length - 1;
    };
    persistFeedbackToSession = async ({
      userId,
      sessionId,
      sessionQuestionIndex,
      question,
      answer,
      speechTranscript,
      answerDurationSec,
      cameraSnapshot,
      result
    }) => {
      if (!sessionId || !mongoose4.isValidObjectId(sessionId)) {
        return;
      }
      const session = await interviewSession_default.findOne({
        _id: sessionId,
        userId
      });
      if (!session || session.questions.length === 0) {
        return;
      }
      const sanitizedAnswer = typeof answer === "string" ? answer.trim() : "";
      if (!sanitizedAnswer) {
        return;
      }
      const targetIndex = resolveTargetQuestionIndex(
        session.questions,
        question,
        sessionQuestionIndex
      );
      const targetEntry = session.questions[targetIndex];
      targetEntry.answer = sanitizedAnswer;
      targetEntry.feedback = result.feedback;
      if (typeof speechTranscript === "string" && speechTranscript.trim()) {
        targetEntry.speechTranscript = speechTranscript.trim().slice(0, 5e3);
      }
      if (typeof answerDurationSec === "number" && Number.isFinite(answerDurationSec)) {
        targetEntry.answerDurationSec = Math.max(0, Math.min(7200, Math.round(answerDurationSec)));
      }
      if (typeof cameraSnapshot === "string" && cameraSnapshot.startsWith("data:image/")) {
        targetEntry.cameraSnapshot = cameraSnapshot.slice(0, 45e4);
      }
      if (result.followUp?.prompt && targetIndex === session.questions.length - 1) {
        const nextQuestion = session.questions[targetIndex + 1];
        const normalizedFollowUp = normalizedText(result.followUp.prompt);
        const alreadyExists = nextQuestion && normalizedText(nextQuestion.question) === normalizedFollowUp;
        if (!alreadyExists) {
          session.questions.push({
            question: result.followUp.prompt,
            answer: "",
            category: targetEntry.category
          });
        }
      }
      session.lastActivityAt = /* @__PURE__ */ new Date();
      await session.save();
    };
    resolveSessionQuestionIndex = async (params) => {
      if (!params.sessionId || !mongoose4.isValidObjectId(params.sessionId)) {
        return void 0;
      }
      const session = await interviewSession_default.findOne({
        _id: params.sessionId,
        userId: params.userId
      }).select("questions");
      if (!session || session.questions.length === 0) {
        return void 0;
      }
      if (Number.isInteger(params.sessionQuestionIndex) && typeof params.sessionQuestionIndex === "number" && params.sessionQuestionIndex >= 0 && params.sessionQuestionIndex < session.questions.length) {
        const preferredEntry = session.questions[params.sessionQuestionIndex];
        if (normalizedText(preferredEntry.question) === normalizedText(params.question)) {
          return params.sessionQuestionIndex;
        }
      }
      return resolveTargetQuestionIndex(session.questions, params.question);
    };
    createFeedbackJob = async (params) => {
      const provisional = generateHeuristicFeedback(
        params.role,
        params.question,
        params.answer,
        params.expectedPoints
      );
      const sessionQuestionIndex = await resolveSessionQuestionIndex({
        userId: params.userId,
        sessionId: params.sessionId,
        question: params.question,
        sessionQuestionIndex: params.sessionQuestionIndex
      });
      const job = await feedbackJob_default.create({
        userId: params.userId,
        sessionId: params.sessionId && mongoose4.isValidObjectId(params.sessionId) ? params.sessionId : void 0,
        sessionQuestionIndex,
        role: params.role,
        question: params.question,
        answer: params.answer,
        expectedPoints: params.expectedPoints,
        speechTranscript: params.speechTranscript,
        answerDurationSec: params.answerDurationSec,
        cameraSnapshot: params.cameraSnapshot,
        status: "pending",
        provisionalFeedback: provisional.feedback,
        provisionalFollowUp: provisional.followUp
      });
      return {
        job,
        provisional
      };
    };
    claimFeedbackJob = async (jobId, userId) => {
      const staleBefore = new Date(Date.now() - JOB_PROCESS_STALE_MS);
      return feedbackJob_default.findOneAndUpdate(
        {
          _id: jobId,
          userId,
          $or: [
            { status: "pending" },
            { status: "processing", processingStartedAt: { $lt: staleBefore } }
          ]
        },
        {
          status: "processing",
          processingStartedAt: /* @__PURE__ */ new Date(),
          $inc: { attempts: 1 },
          $set: { lastError: "" }
        },
        { new: true }
      );
    };
    processFeedbackJob = async (jobId, userId) => {
      if (!mongoose4.isValidObjectId(jobId)) {
        return null;
      }
      const claimedJob = await claimFeedbackJob(jobId, userId);
      if (!claimedJob) {
        return feedbackJob_default.findOne({ _id: jobId, userId });
      }
      const fallbackResult = {
        feedback: claimedJob.provisionalFeedback || generateHeuristicFeedback(
          claimedJob.role,
          claimedJob.question,
          claimedJob.answer,
          claimedJob.expectedPoints
        ).feedback,
        followUp: claimedJob.provisionalFollowUp || generateHeuristicFeedback(
          claimedJob.role,
          claimedJob.question,
          claimedJob.answer,
          claimedJob.expectedPoints
        ).followUp,
        source: "heuristic"
      };
      try {
        const result = await generateFeedback(
          claimedJob.role,
          claimedJob.question,
          claimedJob.answer,
          claimedJob.expectedPoints,
          { providerTimeoutMs: JOB_PROVIDER_TIMEOUT_MS }
        );
        await persistFeedbackToSession({
          userId,
          sessionId: claimedJob.sessionId?.toString(),
          sessionQuestionIndex: claimedJob.sessionQuestionIndex,
          question: claimedJob.question,
          answer: claimedJob.answer,
          speechTranscript: claimedJob.speechTranscript,
          answerDurationSec: claimedJob.answerDurationSec,
          cameraSnapshot: claimedJob.cameraSnapshot,
          result
        });
        return feedbackJob_default.findOneAndUpdate(
          { _id: jobId, userId },
          {
            status: "completed",
            result,
            lastError: "",
            $unset: { processingStartedAt: 1 }
          },
          { new: true }
        );
      } catch (error) {
        await persistFeedbackToSession({
          userId,
          sessionId: claimedJob.sessionId?.toString(),
          sessionQuestionIndex: claimedJob.sessionQuestionIndex,
          question: claimedJob.question,
          answer: claimedJob.answer,
          speechTranscript: claimedJob.speechTranscript,
          answerDurationSec: claimedJob.answerDurationSec,
          cameraSnapshot: claimedJob.cameraSnapshot,
          result: fallbackResult
        });
        const errorMessage = error instanceof Error ? error.message : "Evaluation failed";
        return feedbackJob_default.findOneAndUpdate(
          { _id: jobId, userId },
          {
            status: "completed",
            result: fallbackResult,
            lastError: errorMessage.slice(0, 280),
            $unset: { processingStartedAt: 1 }
          },
          { new: true }
        );
      }
    };
    getFeedbackJob = async (jobId, userId) => {
      if (!mongoose4.isValidObjectId(jobId)) {
        return null;
      }
      return feedbackJob_default.findOne({
        _id: jobId,
        userId
      });
    };
    getFeedbackJobStatus = async (jobId, userId) => {
      ensureQueueWorkerRunning();
      const job = await getFeedbackJob(jobId, userId);
      if (!job) {
        return null;
      }
      if (job.status === "pending") {
        await enqueueFeedbackJob({
          jobId,
          userId,
          attempt: job.attempts,
          force: true
        });
        return job;
      }
      if (job.status === "processing") {
        const startedAt = job.processingStartedAt?.getTime() ?? 0;
        if (!startedAt || Date.now() - startedAt > JOB_PROCESS_STALE_MS) {
          await enqueueFeedbackJob({
            jobId,
            userId,
            attempt: job.attempts,
            force: true
          });
        }
      }
      return job;
    };
    startFeedbackJobProcessing = (jobId, userId) => {
      void enqueueFeedbackJob({ jobId, userId });
    };
    startFeedbackQueueWorker = () => {
      ensureQueueWorkerRunning();
    };
    mapJobToApiResponse = (job) => {
      const base = {
        success: true,
        jobId: job.id,
        status: job.status,
        attempts: job.attempts
      };
      if (job.status === "completed" && job.result) {
        return {
          ...base,
          result: job.result,
          completedAt: job.updatedAt
        };
      }
      if (job.status === "failed") {
        return {
          ...base,
          lastError: job.lastError || "Evaluation failed",
          completedAt: job.updatedAt
        };
      }
      return {
        ...base,
        provisionalFeedback: job.provisionalFeedback,
        provisionalFollowUp: job.provisionalFollowUp,
        pollAfterMs: job.status === "processing" ? 900 : 1200
      };
    };
  }
});

// backend/src/routes/feedback.routes.ts
import express from "express";
import mongoose5 from "mongoose";
var router2, getUserId, parseExpectedPoints, feedback_routes_default;
var init_feedback_routes = __esm({
  "backend/src/routes/feedback.routes.ts"() {
    "use strict";
    init_feedback_service();
    init_auth_middleware();
    init_validation_middleware();
    init_rateLimit_middleware();
    init_feedbackJob_service();
    router2 = express.Router();
    getUserId = (req) => req.user._id;
    parseExpectedPoints = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    router2.post(
      "/",
      authMiddleware,
      feedbackRateLimit,
      ...feedbackValidation,
      handleValidationErrors,
      async (req, res) => {
        try {
          const userId = getUserId(req);
          const {
            role,
            question,
            answer,
            expectedPoints,
            speechTranscript,
            answerDurationSec,
            cameraSnapshot,
            sessionId,
            sessionQuestionIndex
          } = req.body;
          const trimmedAnswer = typeof answer === "string" ? answer.trim() : "";
          if (!trimmedAnswer) {
            return res.status(400).json({
              success: false,
              message: "Answer cannot be empty"
            });
          }
          const result = await generateFeedback(
            role,
            question,
            trimmedAnswer,
            parseExpectedPoints(expectedPoints),
            { providerTimeoutMs: 5200 }
          );
          await persistFeedbackToSession({
            userId,
            sessionId,
            sessionQuestionIndex,
            question,
            answer: trimmedAnswer,
            speechTranscript,
            answerDurationSec,
            cameraSnapshot,
            result
          });
          return res.json(result);
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to generate feedback"
          });
        }
      }
    );
    router2.post(
      "/jobs",
      authMiddleware,
      feedbackRateLimit,
      ...feedbackValidation,
      handleValidationErrors,
      async (req, res) => {
        try {
          const userId = getUserId(req);
          const {
            role,
            question,
            answer,
            expectedPoints,
            speechTranscript,
            answerDurationSec,
            cameraSnapshot,
            sessionId,
            sessionQuestionIndex
          } = req.body;
          const trimmedAnswer = typeof answer === "string" ? answer.trim() : "";
          if (!trimmedAnswer) {
            return res.status(400).json({
              success: false,
              message: "Answer cannot be empty"
            });
          }
          const { job, provisional } = await createFeedbackJob({
            userId,
            role,
            question,
            answer: trimmedAnswer,
            expectedPoints: parseExpectedPoints(expectedPoints),
            speechTranscript,
            answerDurationSec,
            cameraSnapshot,
            sessionId,
            sessionQuestionIndex
          });
          startFeedbackJobProcessing(job.id, userId);
          return res.status(202).json({
            success: true,
            jobId: job.id,
            status: job.status,
            pollAfterMs: 1200,
            provisionalFeedback: provisional.feedback,
            provisionalFollowUp: provisional.followUp
          });
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to start feedback evaluation job"
          });
        }
      }
    );
    router2.get("/jobs/:jobId", authMiddleware, feedbackPollRateLimit, async (req, res) => {
      try {
        const userId = getUserId(req);
        const { jobId } = req.params;
        if (!mongoose5.isValidObjectId(jobId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid evaluation job id"
          });
        }
        const job = await getFeedbackJobStatus(jobId, userId);
        if (!job) {
          return res.status(404).json({
            success: false,
            message: "Evaluation job not found"
          });
        }
        return res.json(mapJobToApiResponse(job));
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch evaluation job status"
        });
      }
    });
    feedback_routes_default = router2;
  }
});

// backend/src/services/auth.service.ts
import axios3 from "axios";
import bcrypt from "bcryptjs";
import crypto3 from "crypto";
import jwt2 from "jsonwebtoken";
var SALT_ROUNDS, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, GOOGLE_TOKENINFO_ENDPOINT, GOOGLE_VERIFY_TIMEOUT_MS, PASSWORD_RESET_TOKEN_BYTES, PASSWORD_RESET_TTL_MS, MAX_PASSWORD_HISTORY, MIN_PASSWORD_LENGTH, COMPROMISED_PASSWORD_BLOCKLIST, normalizeEmail, hashResetToken, isEmailVerified, getAccessSecret, getRefreshSecret, parseDurationToSeconds, secondsUntilExp, sanitizeMetadata, normalizeTokenClaims, isBufferEqual, validateStrongPassword, getPasswordHistory, AuthService;
var init_auth_service = __esm({
  "backend/src/services/auth.service.ts"() {
    "use strict";
    init_user();
    init_authRuntimeStore();
    init_observability();
    SALT_ROUNDS = 12;
    ACCESS_TOKEN_TTL = (process.env.JWT_ACCESS_TTL ?? "15m").trim() || "15m";
    REFRESH_TOKEN_TTL = (process.env.JWT_REFRESH_TTL ?? "14d").trim() || "14d";
    GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
    GOOGLE_VERIFY_TIMEOUT_MS = 7e3;
    PASSWORD_RESET_TOKEN_BYTES = 32;
    PASSWORD_RESET_TTL_MS = 1e3 * 60 * 15;
    MAX_PASSWORD_HISTORY = 5;
    MIN_PASSWORD_LENGTH = 12;
    COMPROMISED_PASSWORD_BLOCKLIST = /* @__PURE__ */ new Set([
      "password",
      "password123",
      "qwerty123",
      "12345678",
      "letmein123",
      "welcome123",
      "admin1234",
      "passw0rd",
      "iloveyou",
      "abc12345"
    ]);
    normalizeEmail = (email) => email.trim().toLowerCase();
    hashResetToken = (token) => crypto3.createHash("sha256").update(token).digest("hex");
    isEmailVerified = (value) => {
      if (typeof value === "boolean") return value;
      return typeof value === "string" && value.toLowerCase() === "true";
    };
    getAccessSecret = () => {
      const secret = (process.env.JWT_SECRET ?? "").trim();
      if (!secret) {
        throw new Error("JWT secret is not configured");
      }
      return secret;
    };
    getRefreshSecret = () => {
      const candidate = (process.env.JWT_REFRESH_SECRET ?? "").trim();
      return candidate || getAccessSecret();
    };
    parseDurationToSeconds = (value, fallbackSec) => {
      const normalized = String(value).trim().toLowerCase();
      const match = normalized.match(/^(\d+)(s|m|h|d)$/);
      if (!match) {
        const parsed = Number.parseInt(normalized, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSec;
      }
      const amount = Number.parseInt(match[1], 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        return fallbackSec;
      }
      const unit = match[2];
      if (unit === "s") return amount;
      if (unit === "m") return amount * 60;
      if (unit === "h") return amount * 3600;
      return amount * 86400;
    };
    secondsUntilExp = (exp) => {
      if (!exp || !Number.isFinite(exp)) {
        return 60;
      }
      return Math.max(60, Math.floor(exp - Date.now() / 1e3));
    };
    sanitizeMetadata = (metadata) => ({
      ipAddress: (metadata?.ipAddress ?? "").trim() || "unknown",
      userAgent: (metadata?.userAgent ?? "").trim() || "unknown"
    });
    normalizeTokenClaims = (decoded, tokenType) => {
      const id = typeof decoded.id === "string" ? decoded.id : "";
      if (!id) {
        throw new Error("Token payload is invalid");
      }
      const typeRaw = typeof decoded.type === "string" ? decoded.type : "";
      if (!typeRaw && tokenType === "access") {
        return {
          id,
          type: "access",
          sid: "legacy",
          jti: "",
          iat: decoded.iat,
          exp: decoded.exp
        };
      }
      if (typeRaw !== tokenType) {
        throw new Error("Token type mismatch");
      }
      const sid = typeof decoded.sid === "string" ? decoded.sid : "";
      const jti = typeof decoded.jti === "string" ? decoded.jti : "";
      if (!sid || !jti) {
        throw new Error("Token session metadata is missing");
      }
      return {
        id,
        type: tokenType,
        sid,
        jti,
        iat: decoded.iat,
        exp: decoded.exp
      };
    };
    isBufferEqual = (left, right) => {
      if (!left || !right) {
        return false;
      }
      const leftBuffer = Buffer.from(left, "utf8");
      const rightBuffer = Buffer.from(right, "utf8");
      if (leftBuffer.length !== rightBuffer.length) {
        return false;
      }
      return crypto3.timingSafeEqual(leftBuffer, rightBuffer);
    };
    validateStrongPassword = (password) => {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      }
      if (!/[A-Z]/.test(password)) {
        throw new Error("Password must include at least one uppercase letter");
      }
      if (!/[a-z]/.test(password)) {
        throw new Error("Password must include at least one lowercase letter");
      }
      if (!/[0-9]/.test(password)) {
        throw new Error("Password must include at least one number");
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        throw new Error("Password must include at least one special character");
      }
      if (/\s/.test(password)) {
        throw new Error("Password cannot include spaces");
      }
      if (COMPROMISED_PASSWORD_BLOCKLIST.has(password.toLowerCase())) {
        throw new Error("Password is too common. Choose a stronger password");
      }
    };
    getPasswordHistory = (user) => {
      const history = Array.isArray(user.passwordHistory) ? user.passwordHistory : [];
      return [user.passwordHash, ...history].filter((item) => typeof item === "string" && item.length > 0).slice(0, MAX_PASSWORD_HISTORY + 1);
    };
    AuthService = class {
      static parseToken(token, tokenType) {
        const secret = tokenType === "refresh" ? getRefreshSecret() : getAccessSecret();
        const decoded = jwt2.verify(token, secret, {
          algorithms: ["HS256"]
        });
        return normalizeTokenClaims(decoded, tokenType);
      }
      static async assertPasswordNotReused(user, nextPassword) {
        for (const hash of getPasswordHistory(user)) {
          const matched = await bcrypt.compare(nextPassword, hash);
          if (matched) {
            throw new Error("Choose a password you have not used recently");
          }
        }
      }
      static async issueTokens(userId, metadata, sessionId) {
        const accessSecret = getAccessSecret();
        const refreshSecret = getRefreshSecret();
        const nextSessionId = sessionId || crypto3.randomUUID();
        const accessJti = crypto3.randomUUID();
        const refreshJti = crypto3.randomUUID();
        const accessExpiresInSec = parseDurationToSeconds(ACCESS_TOKEN_TTL ?? "15m", 900);
        const refreshExpiresInSec = parseDurationToSeconds(
          REFRESH_TOKEN_TTL ?? "14d",
          60 * 60 * 24 * 14
        );
        const accessToken = jwt2.sign(
          {
            id: userId,
            type: "access",
            sid: nextSessionId,
            jti: accessJti
          },
          accessSecret,
          {
            expiresIn: ACCESS_TOKEN_TTL,
            algorithm: "HS256"
          }
        );
        const refreshToken = jwt2.sign(
          {
            id: userId,
            type: "refresh",
            sid: nextSessionId,
            jti: refreshJti
          },
          refreshSecret,
          {
            expiresIn: REFRESH_TOKEN_TTL,
            algorithm: "HS256"
          }
        );
        const safeMetadata = sanitizeMetadata(metadata);
        await storeRefreshSession({
          sessionId: nextSessionId,
          userId,
          refreshTokenHash: hashAuthToken(refreshToken),
          fingerprint: buildLoginFingerprint(safeMetadata),
          ttlSec: refreshExpiresInSec
        });
        return {
          accessToken,
          refreshToken,
          accessExpiresInSec,
          refreshExpiresInSec,
          sessionId: nextSessionId
        };
      }
      static async markSuccessfulLogin(user, metadata) {
        const safeMetadata = sanitizeMetadata(metadata);
        user.lastLoginAt = /* @__PURE__ */ new Date();
        user.lastLoginFingerprint = buildLoginFingerprint(safeMetadata);
        await user.save();
      }
      static async signup(name, email, password, metadata) {
        validateStrongPassword(password);
        const normalizedEmail = normalizeEmail(email);
        const exists = await user_default.findOne({ email: normalizedEmail });
        if (exists) {
          if (!exists.passwordHash && exists.googleId) {
            throw new Error("Account already exists with Google sign-in. Please continue with Google.");
          }
          throw new Error("User already exists");
        }
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await user_default.create({
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          passwordHistory: [],
          authProvider: "local"
        });
        await this.markSuccessfulLogin(user, metadata);
        return this.issueTokens(user._id.toString(), metadata);
      }
      static async login(email, password, metadata) {
        const normalizedEmail = normalizeEmail(email);
        const user = await user_default.findOne({ email: normalizedEmail });
        if (!user) throw new Error("Invalid email or password");
        if (!user.passwordHash) {
          throw new Error("This account uses Google sign-in. Continue with Google.");
        }
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          const suspiciousCount = await incrementSuspiciousLogin({
            email: normalizedEmail,
            ipAddress: sanitizeMetadata(metadata).ipAddress
          });
          if (suspiciousCount >= 5) {
            logger.warn("auth.suspicious_login_threshold_reached", {
              email: normalizedEmail,
              suspiciousCount
            });
          }
          throw new Error("Invalid email or password");
        }
        await this.markSuccessfulLogin(user, metadata);
        return this.issueTokens(user._id.toString(), metadata);
      }
      static async loginWithGoogle(credential, metadata) {
        const idToken = credential.trim();
        if (!idToken) {
          throw new Error("Google credential is required");
        }
        const profile = await this.verifyGoogleToken(idToken);
        const normalizedEmail = normalizeEmail(profile.email);
        let user = await user_default.findOne({
          $or: [{ googleId: profile.sub }, { email: normalizedEmail }]
        });
        if (!user) {
          user = await user_default.create({
            name: profile.name?.trim() || normalizedEmail.split("@")[0],
            email: normalizedEmail,
            authProvider: "google",
            googleId: profile.sub,
            avatarUrl: profile.picture
          });
        } else {
          user.googleId = profile.sub;
          user.avatarUrl = profile.picture || user.avatarUrl;
          if (!user.name && profile.name) {
            user.name = profile.name.trim();
          }
          if (!user.passwordHash) {
            user.authProvider = "google";
          }
        }
        await this.markSuccessfulLogin(user, metadata);
        return this.issueTokens(user._id.toString(), metadata);
      }
      static async requestPasswordReset(email) {
        const normalizedEmail = normalizeEmail(email);
        const user = await user_default.findOne({ email: normalizedEmail });
        if (!user) {
          return {};
        }
        const resetToken = crypto3.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
        user.passwordResetTokenHash = hashResetToken(resetToken);
        user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
        await user.save();
        return { resetToken };
      }
      static async resetPassword(resetToken, nextPassword, metadata) {
        validateStrongPassword(nextPassword);
        const tokenHash = hashResetToken(resetToken.trim());
        const now = /* @__PURE__ */ new Date();
        const user = await user_default.findOne({
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: { $gt: now }
        });
        if (!user) {
          throw new Error("Password reset link is invalid or expired");
        }
        await this.assertPasswordNotReused(user, nextPassword);
        const previousHistory = getPasswordHistory(user).slice(0, MAX_PASSWORD_HISTORY);
        user.passwordHash = await bcrypt.hash(nextPassword, SALT_ROUNDS);
        user.passwordHistory = previousHistory;
        user.authProvider = "local";
        user.passwordResetTokenHash = void 0;
        user.passwordResetExpiresAt = void 0;
        await this.markSuccessfulLogin(user, metadata);
        return this.issueTokens(user._id.toString(), metadata);
      }
      static async refreshTokens(refreshToken, metadata) {
        const claims = this.parseToken(refreshToken, "refresh");
        if (await isTokenRevoked(claims.jti)) {
          throw new Error("Session has been revoked");
        }
        const session = await getRefreshSession(claims.sid);
        if (!session || session.userId !== claims.id) {
          throw new Error("Session is invalid or expired");
        }
        const safeMetadata = sanitizeMetadata(metadata);
        const expectedFingerprint = buildLoginFingerprint(safeMetadata);
        if (!isBufferEqual(session.fingerprint, expectedFingerprint)) {
          await incrementSuspiciousLogin({
            email: claims.id,
            ipAddress: safeMetadata.ipAddress
          });
          throw new Error("Session fingerprint mismatch");
        }
        const providedTokenHash = hashAuthToken(refreshToken);
        if (!isBufferEqual(session.refreshTokenHash, providedTokenHash)) {
          throw new Error("Refresh token mismatch");
        }
        await revokeTokenByJti({
          jti: claims.jti,
          ttlSec: secondsUntilExp(claims.exp),
          reason: "refresh_rotated"
        });
        return this.issueTokens(claims.id, metadata, claims.sid);
      }
      static async logout(tokens) {
        const accessToken = tokens.accessToken?.trim() ?? "";
        const refreshToken = tokens.refreshToken?.trim() ?? "";
        if (accessToken) {
          try {
            const claims = this.parseToken(accessToken, "access");
            if (claims.jti) {
              await revokeTokenByJti({
                jti: claims.jti,
                ttlSec: secondsUntilExp(claims.exp),
                reason: "logout"
              });
            }
          } catch {
          }
        }
        if (refreshToken) {
          try {
            const claims = this.parseToken(refreshToken, "refresh");
            await revokeTokenByJti({
              jti: claims.jti,
              ttlSec: secondsUntilExp(claims.exp),
              reason: "logout"
            });
            await deleteRefreshSession(claims.sid);
          } catch {
          }
        }
      }
      static async verifyGoogleToken(idToken) {
        try {
          const response = await axios3.get(GOOGLE_TOKENINFO_ENDPOINT, {
            params: { id_token: idToken },
            timeout: GOOGLE_VERIFY_TIMEOUT_MS
          });
          const payload = response.data;
          const allowedIssuer = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
          const expectedAudience = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
          if (!expectedAudience) {
            throw new Error("Google sign-in is not configured on the server");
          }
          const audienceMatches = payload.aud === expectedAudience;
          if (!allowedIssuer || !audienceMatches || !payload.sub || !payload.email || !isEmailVerified(payload.email_verified)) {
            throw new Error("Google token validation failed");
          }
          return {
            ...payload,
            sub: payload.sub,
            email: payload.email
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("not configured")) {
            throw new Error("Google sign-in is not configured on the server");
          }
          throw new Error("Google authentication failed");
        }
      }
      static async getUserFromToken(token) {
        const claims = this.parseToken(token, "access");
        if (claims.jti && await isTokenRevoked(claims.jti)) {
          throw new Error("Token has been revoked");
        }
        const user = await user_default.findById(claims.id).select(
          "-passwordHash -passwordHistory -passwordResetTokenHash -passwordResetExpiresAt"
        );
        if (!user) throw new Error("User not found");
        return user;
      }
    };
  }
});

// backend/src/controllers/auth.controller.ts
var isProduction, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, parseDurationMs, ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS, BASE_COOKIE_OPTIONS, ACCESS_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS, CLEAR_ACCESS_COOKIE_OPTIONS, CLEAR_REFRESH_COOKIE_OPTIONS, getRequestMetadata, setAuthCookies, clearAuthCookies, extractAccessToken, extractRefreshToken, AuthController;
var init_auth_controller = __esm({
  "backend/src/controllers/auth.controller.ts"() {
    "use strict";
    init_auth_service();
    isProduction = process.env.NODE_ENV === "production";
    ACCESS_TOKEN_COOKIE = "token";
    REFRESH_TOKEN_COOKIE = "refresh_token";
    parseDurationMs = (raw, fallbackMs) => {
      const normalized = raw.trim().toLowerCase();
      const match = normalized.match(/^(\d+)(s|m|h|d)$/);
      if (!match) {
        const parsed = Number.parseInt(normalized, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed * 1e3 : fallbackMs;
      }
      const amount = Number.parseInt(match[1], 10);
      const unit = match[2];
      if (!Number.isFinite(amount) || amount <= 0) {
        return fallbackMs;
      }
      if (unit === "s") return amount * 1e3;
      if (unit === "m") return amount * 60 * 1e3;
      if (unit === "h") return amount * 60 * 60 * 1e3;
      return amount * 24 * 60 * 60 * 1e3;
    };
    ACCESS_TOKEN_MAX_AGE_MS = parseDurationMs(process.env.JWT_ACCESS_TTL ?? "15m", 15 * 60 * 1e3);
    REFRESH_TOKEN_MAX_AGE_MS = parseDurationMs(
      process.env.JWT_REFRESH_TTL ?? "14d",
      14 * 24 * 60 * 60 * 1e3
    );
    BASE_COOKIE_OPTIONS = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax"
    };
    ACCESS_COOKIE_OPTIONS = {
      ...BASE_COOKIE_OPTIONS,
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_MS
    };
    REFRESH_COOKIE_OPTIONS = {
      ...BASE_COOKIE_OPTIONS,
      path: "/api/auth",
      maxAge: REFRESH_TOKEN_MAX_AGE_MS
    };
    CLEAR_ACCESS_COOKIE_OPTIONS = {
      ...ACCESS_COOKIE_OPTIONS,
      maxAge: 0
    };
    CLEAR_REFRESH_COOKIE_OPTIONS = {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: 0
    };
    getRequestMetadata = (req) => {
      const forwardedFor = req.header("x-forwarded-for");
      const forwardedIp = forwardedFor?.split(",")[0]?.trim() ?? "";
      return {
        ipAddress: forwardedIp || req.ip || "",
        userAgent: req.header("user-agent") ?? ""
      };
    };
    setAuthCookies = (res, tokens) => {
      res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    };
    clearAuthCookies = (res) => {
      res.clearCookie(ACCESS_TOKEN_COOKIE, CLEAR_ACCESS_COOKIE_OPTIONS);
      res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_REFRESH_COOKIE_OPTIONS);
    };
    extractAccessToken = (req) => {
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
      return (req.cookies?.[ACCESS_TOKEN_COOKIE] ?? bearer).trim();
    };
    extractRefreshToken = (req) => (req.cookies?.[REFRESH_TOKEN_COOKIE] ?? "").trim();
    AuthController = class {
      static async signup(req, res) {
        try {
          const { name, email, password } = req.body;
          const tokens = await AuthService.signup(name, email, password, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            message: "Signup successful",
            user
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Signup failed";
          return res.status(400).json({
            success: false,
            message
          });
        }
      }
      static async login(req, res) {
        try {
          const { email, password } = req.body;
          const tokens = await AuthService.login(email, password, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            message: "Login successful",
            user
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          return res.status(400).json({
            success: false,
            message
          });
        }
      }
      static async googleLogin(req, res) {
        try {
          const { credential } = req.body;
          const tokens = await AuthService.loginWithGoogle(credential, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            message: "Google login successful",
            user
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Google login failed";
          return res.status(400).json({
            success: false,
            message
          });
        }
      }
      static async refresh(req, res) {
        try {
          const refreshToken = extractRefreshToken(req);
          if (!refreshToken) {
            return res.status(401).json({
              success: false,
              message: "Refresh token is missing"
            });
          }
          const tokens = await AuthService.refreshTokens(refreshToken, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            message: "Session refreshed",
            user
          });
        } catch (err) {
          clearAuthCookies(res);
          const message = err instanceof Error ? err.message : "Session refresh failed";
          return res.status(401).json({
            success: false,
            message
          });
        }
      }
      static async forgotPassword(req, res) {
        try {
          const { email } = req.body;
          const { resetToken } = await AuthService.requestPasswordReset(email);
          const genericMessage = "If an account exists for this email, you will receive password reset instructions shortly.";
          const frontendUrl = (process.env.FRONTEND_URL ?? "").trim();
          const devFallbackUrl = "http://localhost:5173";
          const baseUrl = frontendUrl.startsWith("http://") || frontendUrl.startsWith("https://") ? frontendUrl : devFallbackUrl;
          const resetUrl = process.env.NODE_ENV === "production" || !resetToken ? void 0 : `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;
          if (resetUrl) {
            console.info("Password reset link (development only):", resetUrl);
          }
          return res.json({
            success: true,
            message: genericMessage,
            resetUrl
          });
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to process password reset request"
          });
        }
      }
      static async resetPassword(req, res) {
        try {
          const { token, password } = req.body;
          const tokens = await AuthService.resetPassword(token, password, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            message: "Password reset successful",
            user
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Password reset failed";
          return res.status(400).json({
            success: false,
            message
          });
        }
      }
      static async getMe(req, res) {
        try {
          const accessToken = extractAccessToken(req);
          const refreshToken = extractRefreshToken(req);
          if (!accessToken && !refreshToken) {
            return res.status(401).json({
              success: false,
              message: "Not authenticated"
            });
          }
          if (accessToken) {
            try {
              const user2 = await AuthService.getUserFromToken(accessToken);
              return res.json({
                success: true,
                user: user2
              });
            } catch {
            }
          }
          if (!refreshToken) {
            clearAuthCookies(res);
            return res.status(401).json({
              success: false,
              message: "Invalid or expired token"
            });
          }
          const tokens = await AuthService.refreshTokens(refreshToken, getRequestMetadata(req));
          const user = await AuthService.getUserFromToken(tokens.accessToken);
          setAuthCookies(res, tokens);
          return res.json({
            success: true,
            user
          });
        } catch {
          clearAuthCookies(res);
          return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
          });
        }
      }
      static async logout(req, res) {
        await AuthService.logout({
          accessToken: extractAccessToken(req),
          refreshToken: extractRefreshToken(req)
        });
        clearAuthCookies(res);
        return res.json({
          success: true,
          message: "Logged out"
        });
      }
    };
  }
});

// backend/src/middleware/csrf.middleware.ts
import crypto4 from "crypto";
var isProduction2, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CSRF_COOKIE_OPTIONS, SAFE_METHODS, generateToken, ensureTokenCookie, csrfCookieMiddleware, requireCsrfProtection, issueCsrfToken;
var init_csrf_middleware = __esm({
  "backend/src/middleware/csrf.middleware.ts"() {
    "use strict";
    isProduction2 = process.env.NODE_ENV === "production";
    CSRF_COOKIE_NAME = "csrf_token";
    CSRF_HEADER_NAME = "x-csrf-token";
    CSRF_COOKIE_OPTIONS = {
      httpOnly: false,
      secure: isProduction2,
      sameSite: isProduction2 ? "none" : "lax",
      path: "/",
      maxAge: 1e3 * 60 * 60 * 24
    };
    SAFE_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
    generateToken = () => crypto4.randomBytes(32).toString("hex");
    ensureTokenCookie = (req, res) => {
      const existing = req.cookies?.[CSRF_COOKIE_NAME];
      if (typeof existing === "string" && existing.length >= 32) {
        return existing;
      }
      const token = generateToken();
      res.cookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
      return token;
    };
    csrfCookieMiddleware = (req, res, next) => {
      ensureTokenCookie(req, res);
      next();
    };
    requireCsrfProtection = (req, res, next) => {
      if (SAFE_METHODS.has(req.method.toUpperCase())) {
        next();
        return;
      }
      const cookieToken = ensureTokenCookie(req, res);
      const headerToken = req.get(CSRF_HEADER_NAME);
      if (!headerToken || headerToken !== cookieToken) {
        res.status(403).json({
          success: false,
          message: "Invalid CSRF token"
        });
        return;
      }
      next();
    };
    issueCsrfToken = (req, res) => {
      const token = ensureTokenCookie(req, res);
      res.status(200).json({
        success: true,
        csrfToken: token
      });
    };
  }
});

// backend/src/routes/auth.routes.ts
import { Router as Router2 } from "express";
var router3, auth_routes_default;
var init_auth_routes = __esm({
  "backend/src/routes/auth.routes.ts"() {
    "use strict";
    init_auth_controller();
    init_validation_middleware();
    init_rateLimit_middleware();
    init_csrf_middleware();
    router3 = Router2();
    router3.get("/csrf", issueCsrfToken);
    router3.post(
      "/signup",
      authRateLimit,
      signupValidation,
      handleValidationErrors,
      AuthController.signup
    );
    router3.post(
      "/login",
      authRateLimit,
      loginValidation,
      handleValidationErrors,
      AuthController.login
    );
    router3.post(
      "/google",
      authRateLimit,
      googleAuthValidation,
      handleValidationErrors,
      AuthController.googleLogin
    );
    router3.post("/refresh", authRateLimit, AuthController.refresh);
    router3.post(
      "/forgot-password",
      authRateLimit,
      forgotPasswordValidation,
      handleValidationErrors,
      AuthController.forgotPassword
    );
    router3.post(
      "/reset-password",
      authRateLimit,
      resetPasswordValidation,
      handleValidationErrors,
      AuthController.resetPassword
    );
    router3.get("/me", AuthController.getMe);
    router3.post("/logout", AuthController.logout);
    auth_routes_default = router3;
  }
});

// backend/src/routes/history.routes.ts
import { Router as Router3 } from "express";
import mongoose6 from "mongoose";
var router4, history_routes_default;
var init_history_routes = __esm({
  "backend/src/routes/history.routes.ts"() {
    "use strict";
    init_auth_middleware();
    init_interviewSession();
    router4 = Router3();
    router4.get("/", authMiddleware, async (req, res) => {
      try {
        const user = req.user;
        const sessions = await interviewSession_default.find({ userId: user._id }).sort({ lastActivityAt: -1 }).limit(50).select("-__v").lean();
        return res.json({ sessions });
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch history"
        });
      }
    });
    router4.get("/:id", authMiddleware, async (req, res) => {
      try {
        const user = req.user;
        const { id } = req.params;
        if (!mongoose6.isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid session identifier"
          });
        }
        const session = await interviewSession_default.findOne({
          _id: id,
          userId: user._id
        }).select("-__v").lean();
        if (!session) {
          return res.status(404).json({
            success: false,
            message: "Session not found"
          });
        }
        return res.json({ session });
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch session"
        });
      }
    });
    history_routes_default = router4;
  }
});

// backend/src/routes/resume.routes.ts
import { Router as Router4 } from "express";
import multer from "multer";
var router5, MAX_RESUME_SIZE, upload, commonSkills, extractSkills, pdfParser, getPdfParser, resume_routes_default;
var init_resume_routes = __esm({
  "backend/src/routes/resume.routes.ts"() {
    "use strict";
    init_auth_middleware();
    init_rateLimit_middleware();
    router5 = Router4();
    MAX_RESUME_SIZE = Number.parseInt(
      process.env.MAX_RESUME_FILE_SIZE_BYTES ?? `${2 * 1024 * 1024}`,
      10
    );
    upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: Number.isFinite(MAX_RESUME_SIZE) ? MAX_RESUME_SIZE : 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isPdf = file.mimetype === "application/pdf" || file.originalname?.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          cb(new Error("Only PDF files are supported"));
          return;
        }
        cb(null, true);
      }
    });
    commonSkills = [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "Express",
      "Python",
      "SQL",
      "MongoDB",
      "Docker",
      "Kubernetes",
      "AWS",
      "System Design",
      "Machine Learning",
      "Data Structures",
      "Algorithms"
    ];
    extractSkills = (text) => {
      const normalized = text.toLowerCase();
      return commonSkills.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 10);
    };
    pdfParser = null;
    getPdfParser = async () => {
      if (pdfParser) return pdfParser;
      const mod = await import("pdf-parse-fork");
      const parser = mod.default;
      if (typeof parser !== "function") {
        throw new Error("PDF parser module failed to load");
      }
      pdfParser = parser;
      return pdfParser;
    };
    router5.post(
      "/analyze",
      authMiddleware,
      resumeRateLimit,
      (req, res, next) => {
        upload.single("resume")(req, res, (error) => {
          if (!error) {
            next();
            return;
          }
          const maybeMulterError = error;
          if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({
              success: false,
              message: "Resume file is too large"
            });
            return;
          }
          res.status(400).json({
            success: false,
            message: error.message || "Invalid resume upload"
          });
        });
      },
      async (req, res) => {
        const typedReq = req;
        try {
          if (!typedReq.file) {
            return res.status(400).json({
              success: false,
              message: "No resume uploaded"
            });
          }
          const pdf = await getPdfParser();
          const data = await pdf(typedReq.file.buffer);
          const text = (data.text || "").replace(/\s+/g, " ").trim();
          return res.json({
            success: true,
            message: "Resume processed successfully",
            textPreview: text.slice(0, 300),
            skillsFound: extractSkills(text)
          });
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to process resume"
          });
        }
      }
    );
    resume_routes_default = router5;
  }
});

// backend/src/lib/recordingStore.ts
import mongoose7 from "mongoose";
var RECORDING_BUCKET, toObjectId, getBucket, saveRecordingFile, getRecordingFileById, deleteRecordingFile, streamRecordingFile;
var init_recordingStore = __esm({
  "backend/src/lib/recordingStore.ts"() {
    "use strict";
    RECORDING_BUCKET = "interview_recordings";
    toObjectId = (value) => {
      if (!mongoose7.isValidObjectId(value)) {
        throw new Error("Invalid recording id");
      }
      return new mongoose7.Types.ObjectId(value);
    };
    getBucket = () => {
      const db = mongoose7.connection.db;
      if (!db) {
        throw new Error("Database connection is not ready");
      }
      return new mongoose7.mongo.GridFSBucket(db, {
        bucketName: RECORDING_BUCKET
      });
    };
    saveRecordingFile = async (params) => {
      const bucket = getBucket();
      const { buffer, filename, mimeType, metadata } = params;
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: mimeType,
        metadata
      });
      const fileId = await new Promise((resolve, reject) => {
        uploadStream.on("finish", () => resolve(uploadStream.id));
        uploadStream.on("error", reject);
        uploadStream.end(buffer);
      });
      return {
        fileId: fileId.toString(),
        mimeType,
        sizeBytes: buffer.length
      };
    };
    getRecordingFileById = async (fileId) => {
      const bucket = getBucket();
      const id = toObjectId(fileId);
      const file = await bucket.find({ _id: id }).limit(1).next();
      return file ?? null;
    };
    deleteRecordingFile = async (fileId) => {
      try {
        const bucket = getBucket();
        const id = toObjectId(fileId);
        await bucket.delete(id);
      } catch {
      }
    };
    streamRecordingFile = async (params) => {
      const { fileId, rangeHeader, res } = params;
      const bucket = getBucket();
      const fileDoc = await getRecordingFileById(fileId);
      if (!fileDoc) {
        return false;
      }
      const contentType = typeof fileDoc.contentType === "string" && fileDoc.contentType.trim() ? fileDoc.contentType : "video/webm";
      const fileLength = Number(fileDoc.length || 0);
      const objectId = fileDoc._id;
      if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader)) {
        const [startPart, endPart] = rangeHeader.replace(/bytes=/i, "").split("-");
        const start = Number.parseInt(startPart, 10);
        const end = endPart ? Number.parseInt(endPart, 10) : fileLength - 1;
        if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end < fileLength) {
          const chunkSize = end - start + 1;
          res.status(206);
          res.setHeader("Content-Type", contentType);
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Content-Range", `bytes ${start}-${end}/${fileLength}`);
          res.setHeader("Content-Length", chunkSize.toString());
          res.setHeader("Cache-Control", "private, max-age=300");
          const stream2 = bucket.openDownloadStream(objectId, {
            start,
            end: end + 1
          });
          stream2.on("error", () => {
            if (!res.headersSent) {
              res.status(500).end();
            }
          });
          stream2.pipe(res);
          return true;
        }
      }
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", fileLength.toString());
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=300");
      const stream = bucket.openDownloadStream(objectId);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      stream.pipe(res);
      return true;
    };
  }
});

// backend/src/routes/recording.routes.ts
import { Router as Router5 } from "express";
import crypto5 from "crypto";
import jwt3 from "jsonwebtoken";
import multer2 from "multer";
import mongoose8 from "mongoose";
var MAX_RECORDING_SIZE_BYTES, SIGNED_RECORDING_TOKEN_TTL_SEC, parseOptionalQuestionIndex, upload2, router6, getSignedRecordingSecret, issueSignedRecordingToken, readSignedRecordingToken, recording_routes_default;
var init_recording_routes = __esm({
  "backend/src/routes/recording.routes.ts"() {
    "use strict";
    init_auth_middleware();
    init_rateLimit_middleware();
    init_interviewSession();
    init_recordingStore();
    MAX_RECORDING_SIZE_BYTES = Number.parseInt(
      process.env.MAX_RECORDING_FILE_SIZE_BYTES ?? `${25 * 1024 * 1024}`,
      10
    );
    SIGNED_RECORDING_TOKEN_TTL_SEC = Math.max(
      60,
      Number.parseInt(process.env.RECORDING_SIGNED_URL_TTL_SEC ?? "600", 10)
    );
    parseOptionalQuestionIndex = (value) => {
      if (typeof value === "number" && Number.isInteger(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed)) {
          return parsed;
        }
      }
      return void 0;
    };
    upload2 = multer2({
      storage: multer2.memoryStorage(),
      limits: {
        fileSize: Number.isFinite(MAX_RECORDING_SIZE_BYTES) ? MAX_RECORDING_SIZE_BYTES : 25 * 1024 * 1024
      },
      fileFilter: (_req, file, cb) => {
        const mime = file.mimetype ?? "";
        const ext = file.originalname?.toLowerCase() ?? "";
        const isVideo = mime.startsWith("video/") || ext.endsWith(".webm") || ext.endsWith(".mp4") || ext.endsWith(".ogg");
        if (!isVideo) {
          cb(new Error("Only video recording files are supported"));
          return;
        }
        cb(null, true);
      }
    });
    router6 = Router5();
    getSignedRecordingSecret = () => {
      const secret = (process.env.JWT_SECRET ?? "").trim();
      if (!secret) {
        throw new Error("JWT secret is not configured");
      }
      return `${secret}:recording-signed`;
    };
    issueSignedRecordingToken = (params) => jwt3.sign(
      {
        type: "recording",
        fileId: params.fileId,
        userId: params.userId,
        nonce: crypto5.randomBytes(12).toString("hex")
      },
      getSignedRecordingSecret(),
      {
        algorithm: "HS256",
        expiresIn: SIGNED_RECORDING_TOKEN_TTL_SEC
      }
    );
    readSignedRecordingToken = (token) => {
      try {
        const decoded = jwt3.verify(token, getSignedRecordingSecret(), {
          algorithms: ["HS256"]
        });
        const fileId = typeof decoded.fileId === "string" ? decoded.fileId : "";
        const userId = typeof decoded.userId === "string" ? decoded.userId : "";
        const tokenType = typeof decoded.type === "string" ? decoded.type : "";
        if (!fileId || !userId || tokenType !== "recording") {
          return null;
        }
        return {
          fileId,
          userId
        };
      } catch {
        return null;
      }
    };
    router6.get("/signed/:token", async (req, res) => {
      try {
        const token = (req.params.token ?? "").trim();
        if (!/^[A-Za-z0-9._-]{24,2048}$/.test(token)) {
          return res.status(400).json({
            success: false,
            message: "Invalid signed recording token"
          });
        }
        const payload = readSignedRecordingToken(token);
        if (!payload) {
          return res.status(404).json({
            success: false,
            message: "Signed recording URL is invalid or expired"
          });
        }
        const fileDoc = await getRecordingFileById(payload.fileId);
        const ownerId = fileDoc?.metadata?.userId;
        if (!fileDoc || !ownerId || ownerId !== payload.userId) {
          return res.status(404).json({
            success: false,
            message: "Recording not found"
          });
        }
        const streamed = await streamRecordingFile({
          fileId: payload.fileId,
          rangeHeader: req.headers.range,
          res
        });
        if (!streamed) {
          return res.status(404).json({
            success: false,
            message: "Recording not found"
          });
        }
        return void 0;
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to stream signed recording"
        });
      }
    });
    router6.post("/signed-url", authMiddleware, async (req, res) => {
      try {
        const user = req.user;
        const { fileId } = req.body;
        if (!fileId || !mongoose8.isValidObjectId(fileId)) {
          return res.status(400).json({
            success: false,
            message: "Valid fileId is required"
          });
        }
        const fileDoc = await getRecordingFileById(fileId);
        const ownerId = fileDoc?.metadata?.userId;
        if (!fileDoc || !ownerId || ownerId !== user._id) {
          return res.status(404).json({
            success: false,
            message: "Recording not found"
          });
        }
        const token = issueSignedRecordingToken({
          fileId,
          userId: user._id
        });
        return res.json({
          success: true,
          signedUrl: `/api/interview/recording/signed/${token}`,
          expiresInSec: SIGNED_RECORDING_TOKEN_TTL_SEC
        });
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to issue signed recording URL"
        });
      }
    });
    router6.get("/:fileId", authMiddleware, async (req, res) => {
      try {
        const user = req.user;
        const { fileId } = req.params;
        if (!mongoose8.isValidObjectId(fileId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid recording identifier"
          });
        }
        const fileDoc = await getRecordingFileById(fileId);
        const ownerId = fileDoc?.metadata?.userId;
        if (!fileDoc || !ownerId || ownerId !== user._id) {
          return res.status(404).json({
            success: false,
            message: "Recording not found"
          });
        }
        const streamed = await streamRecordingFile({
          fileId,
          rangeHeader: req.headers.range,
          res
        });
        if (!streamed) {
          return res.status(404).json({
            success: false,
            message: "Recording not found"
          });
        }
        return void 0;
      } catch {
        return res.status(500).json({
          success: false,
          message: "Failed to stream recording"
        });
      }
    });
    router6.post(
      "/",
      authMiddleware,
      recordingRateLimit,
      (req, res, next) => {
        upload2.single("recording")(req, res, (error) => {
          if (!error) {
            next();
            return;
          }
          const maybeMulterError = error;
          if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({
              success: false,
              message: "Recording file is too large"
            });
            return;
          }
          res.status(400).json({
            success: false,
            message: error.message || "Invalid recording upload"
          });
        });
      },
      async (req, res) => {
        try {
          const user = req.user;
          const typedReq = req;
          const { sessionId, questionIndex } = req.body;
          if (!typedReq.file) {
            return res.status(400).json({
              success: false,
              message: "No recording uploaded"
            });
          }
          if (!typedReq.file.size || typedReq.file.size < 1024) {
            return res.status(400).json({
              success: false,
              message: "Recording is empty or too short"
            });
          }
          if (!sessionId || !mongoose8.isValidObjectId(sessionId)) {
            return res.status(400).json({
              success: false,
              message: "Valid sessionId is required"
            });
          }
          const session = await interviewSession_default.findOne({
            _id: sessionId,
            userId: user._id
          });
          if (!session || session.questions.length === 0) {
            return res.status(404).json({
              success: false,
              message: "Session not found for recording upload"
            });
          }
          const parsedQuestionIndex = parseOptionalQuestionIndex(questionIndex);
          if (typeof parsedQuestionIndex === "number" && (parsedQuestionIndex < 0 || parsedQuestionIndex >= session.questions.length)) {
            return res.status(400).json({
              success: false,
              message: "questionIndex is out of range for this session"
            });
          }
          const targetIndex = typeof parsedQuestionIndex === "number" ? parsedQuestionIndex : session.questions.length - 1;
          const existingRecordingId = session.questions[targetIndex].recordingFileId;
          const saved = await saveRecordingFile({
            buffer: typedReq.file.buffer,
            mimeType: typedReq.file.mimetype || "video/webm",
            filename: typedReq.file.originalname || `recording-${Date.now()}.webm`,
            metadata: {
              userId: user._id,
              sessionId,
              questionIndex: targetIndex
            }
          });
          session.questions[targetIndex].recordingFileId = saved.fileId;
          session.questions[targetIndex].recordingMimeType = saved.mimeType;
          session.questions[targetIndex].recordingSizeBytes = saved.sizeBytes;
          session.lastActivityAt = /* @__PURE__ */ new Date();
          await session.save();
          if (typeof existingRecordingId === "string" && existingRecordingId && existingRecordingId !== saved.fileId) {
            await deleteRecordingFile(existingRecordingId);
          }
          return res.json({
            success: true,
            recording: {
              fileId: saved.fileId,
              mimeType: saved.mimeType,
              sizeBytes: saved.sizeBytes,
              questionIndex: targetIndex,
              streamUrl: `/api/interview/recording/${saved.fileId}`
            }
          });
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to upload recording"
          });
        }
      }
    );
    recording_routes_default = router6;
  }
});

// backend/src/routes/ops.routes.ts
import { Router as Router6 } from "express";
import mongoose9 from "mongoose";
var router7, env, requireOpsKey, ops_routes_default;
var init_ops_routes = __esm({
  "backend/src/routes/ops.routes.ts"() {
    "use strict";
    init_env();
    router7 = Router6();
    env = getEnvConfig();
    requireOpsKey = (req, res, next) => {
      if (!env.metricsApiKey) {
        next();
        return;
      }
      const candidate = (req.header("x-metrics-key") ?? "").trim();
      if (!candidate || candidate !== env.metricsApiKey) {
        res.status(403).json({
          success: false,
          message: "Forbidden"
        });
        return;
      }
      next();
    };
    router7.get("/mongo/indexes", requireOpsKey, async (_req, res) => {
      try {
        const db = mongoose9.connection.db;
        if (!db) {
          return res.status(503).json({
            success: false,
            message: "Mongo connection is not ready"
          });
        }
        const collectionNames = ["users", "interviewsessions", "feedbackjobs"];
        const collections = await Promise.all(
          collectionNames.map(async (name) => {
            const collection = db.collection(name);
            const [indexes, estimatedCount] = await Promise.all([
              collection.indexes(),
              collection.estimatedDocumentCount()
            ]);
            return {
              collection: name,
              estimatedDocumentCount: estimatedCount,
              indexes
            };
          })
        );
        return res.json({
          success: true,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          collections
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to read index stats";
        return res.status(500).json({
          success: false,
          message
        });
      }
    });
    ops_routes_default = router7;
  }
});

// backend/src/lib/db.ts
import mongoose10 from "mongoose";
async function dbConnect() {
  if (cached?.conn) {
    return cached.conn;
  }
  const { mongoUri } = getEnvConfig();
  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }
  if (!cached?.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5e3,
      socketTimeoutMS: 1e4
    };
    cached.promise = mongoose10.connect(mongoUri, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
  return cached.conn;
}
var cached, db_default;
var init_db = __esm({
  "backend/src/lib/db.ts"() {
    "use strict";
    init_env();
    cached = global.mongoose;
    if (!cached) {
      cached = global.mongoose = {
        conn: null,
        promise: null
      };
    }
    db_default = dbConnect;
  }
});

// backend/src/middleware/observability.middleware.ts
var env2, toLatencyMs, observabilityMiddleware, metricsHandler;
var init_observability_middleware = __esm({
  "backend/src/middleware/observability.middleware.ts"() {
    "use strict";
    init_env();
    init_observability();
    init_aiResilience();
    env2 = getEnvConfig();
    toLatencyMs = (startedAt) => Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6 * 100) / 100;
    observabilityMiddleware = (req, res, next) => {
      const startedAt = process.hrtime.bigint();
      const context = createRequestContext({
        requestIdHeader: req.header("x-request-id") ?? "",
        traceparentHeader: req.header("traceparent") ?? "",
        method: req.method,
        path: req.originalUrl || req.url || "/"
      });
      res.setHeader("X-Request-Id", context.requestId);
      res.setHeader("Traceparent", getRequestTraceparent(context));
      withRequestContext(context, () => {
        logger.info("http.request.start", {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip
        });
        res.on("finish", () => {
          withRequestContext(context, () => {
            const latencyMs = toLatencyMs(startedAt);
            const typedReq = req;
            recordRouteLatency({
              method: req.method,
              path: req.originalUrl || req.url || "/",
              statusCode: res.statusCode,
              latencyMs
            });
            logger.info("http.request.finish", {
              method: req.method,
              path: req.originalUrl,
              statusCode: res.statusCode,
              latencyMs,
              userId: typedReq.user?._id
            });
          });
        });
        next();
      });
    };
    metricsHandler = (req, res) => {
      const apiKey = env2.metricsApiKey;
      if (apiKey) {
        const headerValue = req.header("x-metrics-key") ?? "";
        if (headerValue !== apiKey) {
          res.status(403).json({
            success: false,
            message: "Forbidden"
          });
          return;
        }
      }
      const format = (req.query.format ?? "").toString().toLowerCase();
      if (format === "prometheus" || format === "prom") {
        res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        res.status(200).send(buildPrometheusMetrics());
        return;
      }
      res.status(200).json({
        success: true,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        routes: getRouteLatencySnapshot(),
        aiResilience: getAiResilienceSnapshot()
      });
    };
  }
});

// backend/src/app.ts
var app_exports = {};
__export(app_exports, {
  default: () => app_default
});
import fs from "fs";
import path from "path";
import express2 from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose11 from "mongoose";
import { fileURLToPath } from "url";
var env3, app, isProduction3, defaultDevOrigins, allowedOrigins, __filename, __dirname, frontendCandidates, frontendPath, normalizeHost, getOriginHost, isOriginAllowed, baseCorsOptions, corsDelegate, buildHealthPayload, healthHandler, readinessHandler, requireDb, app_default;
var init_app = __esm({
  "backend/src/app.ts"() {
    "use strict";
    init_interview_routes();
    init_feedback_routes();
    init_auth_routes();
    init_history_routes();
    init_resume_routes();
    init_recording_routes();
    init_ops_routes();
    init_db();
    init_feedbackJob_service();
    init_observability_middleware();
    init_csrf_middleware();
    init_env();
    init_observability();
    env3 = getEnvConfig();
    app = express2();
    isProduction3 = env3.isProduction;
    defaultDevOrigins = isProduction3 ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
    allowedOrigins = /* @__PURE__ */ new Set([...defaultDevOrigins, ...env3.allowedCorsOrigins]);
    logger.info("redis.runtime.configuration", {
      redisConfigured: env3.redisConfigured,
      redisKeyPrefix: env3.redisKeyPrefix,
      redisMemoryPolicy: env3.redisMemoryPolicy,
      redisPersistenceMode: env3.redisPersistenceMode
    });
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
    frontendCandidates = [
      path.join(process.cwd(), "frontend", "dist"),
      path.join(__dirname, "../../frontend/dist")
    ];
    frontendPath = frontendCandidates.find((candidate) => fs.existsSync(candidate));
    normalizeHost = (value) => value.split(",")[0]?.trim().toLowerCase() ?? "";
    getOriginHost = (origin) => {
      try {
        return new URL(origin).host.toLowerCase();
      } catch {
        return "";
      }
    };
    isOriginAllowed = (origin, req) => {
      if (allowedOrigins.has(origin)) {
        return true;
      }
      const originHost = getOriginHost(origin);
      if (!originHost) {
        return false;
      }
      const requestHost = normalizeHost(req.header("x-forwarded-host") ?? req.header("host") ?? "");
      return Boolean(requestHost) && originHost === requestHost;
    };
    baseCorsOptions = {
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      credentials: true
    };
    corsDelegate = (req, callback) => {
      const requestOrigin = req.header("origin");
      if (!requestOrigin || isOriginAllowed(requestOrigin, req)) {
        callback(null, {
          ...baseCorsOptions,
          origin: requestOrigin ?? true
        });
        return;
      }
      callback(new Error("Not allowed by CORS"), {
        ...baseCorsOptions,
        origin: false
      });
    };
    app.set("trust proxy", 1);
    app.disable("x-powered-by");
    startFeedbackQueueWorker();
    app.use(observabilityMiddleware);
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader(
        "Permissions-Policy",
        "camera=(self), microphone=(self), geolocation=()"
      );
      if (isProduction3) {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
      }
      next();
    });
    app.use(cors(corsDelegate));
    app.use(cookieParser());
    app.use(express2.json({ limit: "1mb" }));
    app.use(express2.urlencoded({ extended: true, limit: "1mb" }));
    app.use("/api", csrfCookieMiddleware);
    app.get("/api/metrics", metricsHandler);
    buildHealthPayload = () => ({
      uptime: Math.round(process.uptime()),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      dbState: mongoose11.connection.readyState
    });
    healthHandler = (_req, res) => {
      res.status(200).json({
        status: "ok",
        ...buildHealthPayload()
      });
    };
    readinessHandler = async (_req, res) => {
      try {
        await db_default();
        res.status(200).json({
          status: "ready",
          ...buildHealthPayload()
        });
      } catch {
        res.status(503).json({
          status: "degraded",
          ...buildHealthPayload()
        });
      }
    };
    app.get("/api/health", healthHandler);
    app.get("/health", healthHandler);
    app.get("/api/ready", readinessHandler);
    app.get("/ready", readinessHandler);
    app.use("/api", requireCsrfProtection);
    requireDb = async (_req, _res, next) => {
      try {
        await db_default();
        next();
      } catch (error) {
        next(error);
      }
    };
    app.use("/api/auth", (req, res, next) => {
      if (req.method === "GET" && req.path === "/csrf") {
        next();
        return;
      }
      requireDb(req, res, next);
    });
    app.use("/api/interview", requireDb);
    app.use("/api/history", requireDb);
    app.use("/api/resume", requireDb);
    app.use("/api/ops", requireDb);
    app.use("/api/auth", auth_routes_default);
    app.use("/api/interview", interview_routes_default);
    app.use("/api/interview/feedback", feedback_routes_default);
    app.use("/api/interview/recording", recording_routes_default);
    app.use("/api/history", history_routes_default);
    app.use("/api/resume", resume_routes_default);
    app.use("/api/ops", ops_routes_default);
    app.use("/api", (_req, res) => {
      res.status(404).json({
        success: false,
        message: "API route not found"
      });
    });
    if (isProduction3 && frontendPath) {
      app.use(express2.static(frontendPath));
      app.get(/^\/(?!api).*/, (_req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
      });
    }
    app.use(
      (err, _req, res, _next) => {
        if (err instanceof Error && err.message === "Not allowed by CORS") {
          res.status(403).json({
            success: false,
            message: "Origin not allowed"
          });
          return;
        }
        const statusCode = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
        const message = err instanceof Error && !isProduction3 ? err.message : "Internal server error";
        const requestIdHeader = res.getHeader("X-Request-Id");
        const requestId = typeof requestIdHeader === "string" ? requestIdHeader : Array.isArray(requestIdHeader) ? requestIdHeader[0] : "";
        res.status(statusCode).json({
          success: false,
          message,
          requestId: requestId || void 0
        });
      }
    );
    app_default = app;
  }
});

// backend/src/serverless.ts
var appPromise = null;
var loadApp = async () => {
  if (!appPromise) {
    appPromise = Promise.resolve().then(() => (init_app(), app_exports)).then((module) => module.default);
  }
  return appPromise;
};
var rewriteRequestUrl = (req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const forwardedPath = url.searchParams.get("path");
  if (forwardedPath !== null) {
    url.searchParams.delete("path");
    const normalizedPath = forwardedPath.startsWith("/") ? forwardedPath : `/${forwardedPath}`;
    const query = url.searchParams.toString();
    req.url = `/api${normalizedPath}${query ? `?${query}` : ""}`;
  } else if (url.pathname.startsWith("/api/index.js")) {
    const query = url.searchParams.toString();
    req.url = `/api${query ? `?${query}` : ""}`;
  }
};
async function handler(req, res) {
  try {
    rewriteRequestUrl(req);
    const app2 = await loadApp();
    return app2(req, res);
  } catch (error) {
    console.error("Server bootstrap failed", error);
    if (res.headersSent) {
      return;
    }
    const detail = error instanceof Error ? error.message : "Unknown startup failure";
    res.status(500).json({
      success: false,
      message: "Server configuration error",
      detail: process.env.NODE_ENV === "production" ? void 0 : detail
    });
  }
}
export {
  handler as default
};
