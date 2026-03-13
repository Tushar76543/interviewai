import { logger } from "./observability.js";

type AiOperation = "question_generation" | "feedback_evaluation";

type CircuitState = {
  consecutiveFailures: number;
  circuitOpenUntilMs: number;
  windowStartedAtMs: number;
  windowRequestCount: number;
  windowFailureCount: number;
  totalRequests: number;
  totalFailures: number;
};

type AiResilienceOptions<T> = {
  operation: AiOperation;
  primaryModel: string;
  fallbackModels?: string[];
  maxRetries?: number;
  execute: (model: string) => Promise<T>;
  isRetriableError: (error: unknown) => boolean;
};

const FAILURE_WINDOW_MS = Number.parseInt(process.env.AI_ERROR_BUDGET_WINDOW_MS ?? "60000", 10);
const ERROR_BUDGET_MAX_FAILURE_RATE = Number.parseFloat(
  process.env.AI_ERROR_BUDGET_MAX_FAILURE_RATE ?? "0.35"
);
const BREAKER_CONSECUTIVE_FAILURES = Number.parseInt(
  process.env.AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "5",
  10
);
const BREAKER_COOLDOWN_MS = Number.parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS ?? "20000", 10);
const MAX_BACKOFF_MS = 2000;

const operationState = new Map<AiOperation, CircuitState>();

const getState = (operation: AiOperation) => {
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

  const created: CircuitState = {
    consecutiveFailures: 0,
    circuitOpenUntilMs: 0,
    windowStartedAtMs: now,
    windowRequestCount: 0,
    windowFailureCount: 0,
    totalRequests: 0,
    totalFailures: 0,
  };
  operationState.set(operation, created);
  return created;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const markSuccess = (operation: AiOperation) => {
  const state = getState(operation);
  state.totalRequests += 1;
  state.windowRequestCount += 1;
  state.consecutiveFailures = 0;
};

const markFailure = (operation: AiOperation) => {
  const state = getState(operation);
  state.totalRequests += 1;
  state.totalFailures += 1;
  state.windowRequestCount += 1;
  state.windowFailureCount += 1;
  state.consecutiveFailures += 1;

  const windowFailureRate =
    state.windowRequestCount > 0 ? state.windowFailureCount / state.windowRequestCount : 0;
  if (
    state.consecutiveFailures >= BREAKER_CONSECUTIVE_FAILURES ||
    windowFailureRate > ERROR_BUDGET_MAX_FAILURE_RATE
  ) {
    state.circuitOpenUntilMs = Date.now() + BREAKER_COOLDOWN_MS;
  }
};

const isCircuitOpen = (operation: AiOperation) => {
  const state = getState(operation);
  return state.circuitOpenUntilMs > Date.now();
};

const listModels = (primaryModel: string, fallbackModels: string[] = []) =>
  [primaryModel, ...fallbackModels]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

export const getAiResilienceSnapshot = () => {
  const snapshot: Record<string, unknown> = {};
  for (const [operation, state] of operationState.entries()) {
    snapshot[operation] = {
      consecutiveFailures: state.consecutiveFailures,
      circuitOpenUntil: state.circuitOpenUntilMs
        ? new Date(state.circuitOpenUntilMs).toISOString()
        : null,
      windowRequestCount: state.windowRequestCount,
      windowFailureCount: state.windowFailureCount,
      totalRequests: state.totalRequests,
      totalFailures: state.totalFailures,
      errorBudgetFailureRate:
        state.windowRequestCount > 0 ? state.windowFailureCount / state.windowRequestCount : 0,
    };
  }
  return snapshot;
};

export const executeWithAiResilience = async <T>(options: AiResilienceOptions<T>) => {
  const models = listModels(options.primaryModel, options.fallbackModels);
  const maxRetries = Math.max(0, Math.min(4, Math.trunc(options.maxRetries ?? 2)));
  const operation = options.operation;

  if (isCircuitOpen(operation)) {
    logger.warn("ai.circuit_open", {
      operation,
      circuitState: getAiResilienceSnapshot()[operation],
    });
    throw new Error("AI provider circuit breaker is open");
  }

  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await options.execute(model);
        markSuccess(operation);
        return {
          result,
          model,
          attempt,
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
          hasAttemptsLeft,
        });

        if (!retriable || !hasAttemptsLeft) {
          break;
        }

        const backoffMs = Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt + Math.floor(Math.random() * 120));
        // eslint-disable-next-line no-await-in-loop
        await sleep(backoffMs);
      }
    }
  }

  markFailure(operation);
  throw lastError instanceof Error ? lastError : new Error("AI provider call failed");
};

