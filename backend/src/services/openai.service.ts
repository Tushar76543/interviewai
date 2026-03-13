import axios from "axios";
import { executeWithAiResilience } from "../lib/aiResilience.js";
import { logger } from "../lib/observability.js";

type GeneratedQuestion = {
  qid: string;
  category: string;
  prompt: string;
  expectedPoints: string[];
  timeLimitSec: number;
};

export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH_FAILED"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_BAD_RESPONSE"
  | "AI_PROVIDER_ERROR";

export class AiProviderError extends Error {
  code: AiErrorCode;
  statusCode: number;

  constructor(code: AiErrorCode, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const REQUEST_TIMEOUT_MS = 7000;
const RESPONSE_MAX_TOKENS = 320;
const MIXED_CATEGORY = "Mixed";
const SUPPORTED_DIFFICULTIES = ["Easy", "Medium", "FAANG"] as const;
const QUESTION_PRIMARY_MODEL =
  process.env.OPENROUTER_QUESTION_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
const QUESTION_FALLBACK_MODELS = (
  process.env.OPENROUTER_QUESTION_FALLBACK_MODELS || process.env.OPENROUTER_MODEL_FALLBACKS || ""
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const isRetriableProviderError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  return status === 429 || status >= 500 || error.code === "ECONNABORTED";
};

const cleanText = (value: string, maxLength: number) =>
  value.replace(/\s+/g, " ").trim().slice(0, maxLength);

const defaultTimeLimitByDifficulty = (difficulty: string) => {
  if (difficulty === "Easy") return 120;
  if (difficulty === "FAANG") return 240;
  return 180;
};

const getCategoryPool = (role: string) => {
  const normalizedRole = role.toLowerCase();

  const base = [
    "Behavioral",
    "Communication",
    "Problem Solving",
    "Project Deep Dive",
  ];

  const engineering = [
    "Technical Fundamentals",
    "System Design",
    "Debugging",
    "Testing and Quality",
    "Performance",
    "Security",
  ];

  const aiData = [
    "ML Fundamentals",
    "Data Modeling",
    "Experimentation",
    "Model Evaluation",
    "Responsible AI",
  ];

  const product = [
    "Product Sense",
    "Prioritization",
    "Stakeholder Management",
    "Execution Planning",
  ];

  const leadership = [
    "Leadership and Ownership",
    "Mentoring",
    "Conflict Resolution",
    "Cross-functional Collaboration",
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
    ...(includeEngineering ? engineering : []),
    ...(includeAiData ? aiData : []),
    ...(includeProduct ? product : []),
    ...(includeLeadership ? leadership : []),
  ];

  return Array.from(new Set(pool));
};

const resolveCategory = (
  requestedCategory: string,
  categoryPool: string[],
  previousCategories: string[],
  previousQuestionCount: number
) => {
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

const extractJson = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "";
};

const parseQuestion = (
  raw: string,
  fallbackCategory: string,
  fallbackDifficulty: string
): GeneratedQuestion | null => {
  try {
    const parsed = JSON.parse(extractJson(raw)) as Partial<GeneratedQuestion>;
    if (!parsed || typeof parsed.prompt !== "string") {
      return null;
    }

    const prompt = cleanText(parsed.prompt, 1000);
    const category =
      typeof parsed.category === "string" && parsed.category.trim()
        ? cleanText(parsed.category, 60)
        : fallbackCategory;
    const expectedPoints = Array.isArray(parsed.expectedPoints)
      ? parsed.expectedPoints
          .filter((item): item is string => typeof item === "string")
          .map((item) => cleanText(item, 240))
          .filter(Boolean)
          .slice(0, 6)
      : [];

    return {
      qid: typeof parsed.qid === "string" && parsed.qid.trim() ? parsed.qid.trim() : "q1",
      category,
      prompt,
      expectedPoints,
      timeLimitSec:
        typeof parsed.timeLimitSec === "number" && parsed.timeLimitSec > 0
          ? Math.min(parsed.timeLimitSec, 600)
          : defaultTimeLimitByDifficulty(fallbackDifficulty),
    };
  } catch {
    return null;
  }
};

const categoryFallbacks: Record<string, { prompt: string; expectedPoints: string[] }> = {
  "System Design": {
    prompt:
      "Design a service to support 1M daily users. Explain your architecture, data model, scaling approach, and reliability strategy.",
    expectedPoints: [
      "high-level architecture and components",
      "data model or storage strategy",
      "scaling and bottleneck handling",
      "reliability, monitoring, and failure handling",
    ],
  },
  Debugging: {
    prompt:
      "A production endpoint latency doubled after a release. Walk through your debugging plan from detection to permanent fix.",
    expectedPoints: [
      "reproduce and isolate the issue",
      "metrics/logging based root-cause analysis",
      "rollback or mitigation plan",
      "permanent fix and prevention steps",
    ],
  },
  Behavioral: {
    prompt:
      "Tell me about a time you disagreed with a team decision. How did you handle it, and what was the final outcome?",
    expectedPoints: [
      "clear context and conflict",
      "actions taken with stakeholders",
      "measurable outcome",
      "lesson learned",
    ],
  },
  Communication: {
    prompt:
      "How would you explain a complex technical trade-off to a non-technical stakeholder who needs to decide quickly?",
    expectedPoints: [
      "plain-language explanation",
      "options with trade-offs",
      "recommendation and rationale",
      "risk communication",
    ],
  },
  Security: {
    prompt:
      "You discover sensitive user data is accessible due to a configuration mistake. What are your first steps and long-term safeguards?",
    expectedPoints: [
      "containment and incident response",
      "impact assessment and communication",
      "root cause and remediation",
      "long-term preventive controls",
    ],
  },
};

const buildFallbackQuestion = (
  role: string,
  difficulty: string,
  category: string,
  previousQuestionCount: number
): GeneratedQuestion => {
  const categoryTemplate = categoryFallbacks[category];
  const genericPrompts = [
    `For a ${role} role, describe a challenging problem you solved recently and the trade-offs in your approach.`,
    `As a ${role}, how would you plan and execute a feature from requirements to production rollout?`,
    `In a ${difficulty} interview, explain how you would detect and improve a performance bottleneck in a live system.`,
  ];
  const genericExpectedPoints = [
    "problem framing and assumptions",
    "step-by-step approach",
    "trade-offs and risks",
    "validation and measurable outcomes",
  ];

  const fallbackPrompt = categoryTemplate
    ? categoryTemplate.prompt
    : genericPrompts[previousQuestionCount % genericPrompts.length];
  const fallbackExpectedPoints = categoryTemplate
    ? categoryTemplate.expectedPoints
    : genericExpectedPoints;

  return {
    qid: `q${previousQuestionCount + 1}`,
    category,
    prompt: cleanText(fallbackPrompt, 1000),
    expectedPoints: fallbackExpectedPoints.map((item) => cleanText(item, 240)).slice(0, 6),
    timeLimitSec: defaultTimeLimitByDifficulty(difficulty),
  };
};

export async function generateQuestion(
  role: string,
  difficulty: string,
  previousQuestions: string[] = [],
  category: string = MIXED_CATEGORY,
  previousCategories: string[] = []
): Promise<GeneratedQuestion> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("AI_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured", 500);
  }

  const safeRole = cleanText(role || "Software Engineer", 80) || "Software Engineer";
  const safeDifficulty = cleanText(difficulty || "Medium", 20) || "Medium";
  const resolvedDifficulty = SUPPORTED_DIFFICULTIES.find(
    (item) => item.toLowerCase() === safeDifficulty.toLowerCase()
  )
    ? (safeDifficulty[0].toUpperCase() + safeDifficulty.slice(1).toLowerCase()).replace(
        "Faang",
        "FAANG"
      )
    : "Medium";
  const safePrevious = previousQuestions
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, 500))
    .filter(Boolean)
    .slice(0, 20);
  const safePreviousCategories = previousCategories
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, 60))
    .filter(Boolean)
    .slice(0, 20);
  const categoryPool = getCategoryPool(safeRole);
  const requestedCategory = cleanText(category || MIXED_CATEGORY, 60) || MIXED_CATEGORY;
  const resolvedCategory = resolveCategory(
    requestedCategory,
    categoryPool,
    safePreviousCategories,
    safePrevious.length
  );

  const previousPromptGuidance = safePrevious.length
    ? `Avoid repeating these previous prompts:\n${safePrevious.join("\n")}`
    : "No previous prompts are provided yet.";
  const previousCategoryGuidance = safePreviousCategories.length
    ? `Recent categories used: ${safePreviousCategories.join(", ")}. Prefer a different angle when possible.`
    : "";

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

  const referer = process.env.FRONTEND_URL?.startsWith("http")
    ? process.env.FRONTEND_URL
    : "https://interviewpilot.app";

  try {
    const { result: response, model: selectedModel } = await executeWithAiResilience({
      operation: "question_generation",
      primaryModel: QUESTION_PRIMARY_MODEL,
      fallbackModels: QUESTION_FALLBACK_MODELS,
      maxRetries: 2,
      execute: async (model) =>
        axios.post(
          OPENROUTER_ENDPOINT,
          {
            model,
            messages: [
              { role: "system", content: "You are the InterviewPilot AI Interview Coach." },
              { role: "user", content: prompt },
            ],
            temperature: 0.5,
            max_tokens: RESPONSE_MAX_TOKENS,
          },
          {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": referer,
              "X-Title": "InterviewPilot Coach",
              "Content-Type": "application/json",
            },
          }
        ),
      isRetriableError: isRetriableProviderError,
    });

    logger.info("ai.question_model_selected", {
      model: selectedModel,
      role: safeRole,
      difficulty: resolvedDifficulty,
      category: resolvedCategory,
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
      const providerMessage =
        typeof rawPayload === "string"
          ? rawPayload
          : typeof rawPayload === "object" && rawPayload !== null
            ? JSON.stringify(rawPayload)
            : "";

      logger.error("ai.question_generation_error", {
        status,
        axiosCode: error.code,
        message: error.message,
        providerMessage,
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
