var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
  const referer = process.env.FRONTEND_URL?.startsWith("http") ? process.env.FRONTEND_URL : "https://interviewai.app";
  try {
    const response = await axios.post(
      OPENROUTER_ENDPOINT,
      {
        model: process.env.OPENROUTER_QUESTION_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are an AI Interview Coach." },
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
          "X-Title": "Interview AI Coach",
          "Content-Type": "application/json"
        }
      }
    );
    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new AiProviderError("AI_BAD_RESPONSE", "AI provider returned an empty response", 502);
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
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const rawPayload = error.response?.data;
      const providerMessage = typeof rawPayload === "string" ? rawPayload : typeof rawPayload === "object" && rawPayload !== null ? JSON.stringify(rawPayload) : "";
      console.error("OpenRouter question generation error", {
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
    console.error("Unexpected question generation error", error);
    return buildFallbackQuestion(
      safeRole,
      resolvedDifficulty,
      resolvedCategory,
      safePrevious.length
    );
  }
}
var AiProviderError, OPENROUTER_ENDPOINT, DEFAULT_MODEL, REQUEST_TIMEOUT_MS, RESPONSE_MAX_TOKENS, MIXED_CATEGORY, SUPPORTED_DIFFICULTIES, cleanText, defaultTimeLimitByDifficulty, getCategoryPool, resolveCategory, extractJson, parseQuestion, categoryFallbacks, buildFallbackQuestion;
var init_openai_service = __esm({
  "backend/src/services/openai.service.ts"() {
    "use strict";
    AiProviderError = class extends Error {
      constructor(code, message, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
      }
    };
    OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
    REQUEST_TIMEOUT_MS = 1e4;
    RESPONSE_MAX_TOKENS = 320;
    MIXED_CATEGORY = "Mixed";
    SUPPORTED_DIFFICULTIES = ["Easy", "Medium", "FAANG"];
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
        passwordHash: { type: String, required: true },
        rolePreferences: { type: [String], default: [] },
        interviewHistory: { type: [String], default: [] }
      },
      { timestamps: true }
    );
    UserSchema.pre("save", function normalizeUser(next) {
      if (this.email) {
        this.email = this.email.toLowerCase().trim();
      }
      next();
    });
    user_default = mongoose.models.User || mongoose.model("User", UserSchema);
  }
});

// backend/src/middleware/auth.middleware.ts
import jwt from "jsonwebtoken";
var extractToken, authMiddleware;
var init_auth_middleware = __esm({
  "backend/src/middleware/auth.middleware.ts"() {
    "use strict";
    init_user();
    extractToken = (req) => {
      const authHeader = req.headers.authorization;
      const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      return req.cookies?.token || bearerToken;
    };
    authMiddleware = async (req, res, next) => {
      try {
        const token = extractToken(req);
        if (!token) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          return res.status(500).json({ message: "Server configuration error" });
        }
        const decoded = jwt.verify(token, jwtSecret);
        const user = await user_default.findById(decoded.id).select("-passwordHash");
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
var ROLE_MIN_LENGTH, ROLE_MAX_LENGTH, CATEGORY_MAX_LENGTH, QUESTION_MAX_LENGTH, ANSWER_MAX_LENGTH, signupValidation, loginValidation, interviewStartValidation, feedbackValidation;
var init_validation_middleware = __esm({
  "backend/src/middleware/validation.middleware.ts"() {
    "use strict";
    ROLE_MIN_LENGTH = 2;
    ROLE_MAX_LENGTH = 80;
    CATEGORY_MAX_LENGTH = 60;
    QUESTION_MAX_LENGTH = 1e3;
    ANSWER_MAX_LENGTH = 5e3;
    signupValidation = [
      body("name").trim().isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters"),
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
      body("password").isLength({ min: 8, max: 128 }).withMessage("Password must be between 8 and 128 characters").matches(/\d/).withMessage("Password must contain at least one number").matches(/[a-zA-Z]/).withMessage("Password must contain at least one letter")
    ];
    loginValidation = [
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
      body("password").isString().notEmpty().withMessage("Password is required")
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
      body("sessionId").optional().isMongoId().withMessage("sessionId must be a valid identifier")
    ];
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
        redisConfigured: Boolean(redisRestUrl && redisRestToken)
      };
      return cachedConfig;
    };
  }
});

// backend/src/lib/rateLimitStore.ts
var asNumber, InMemoryRateLimitStore, UpstashRedisRateLimitStore, singletonStore, getRateLimitStore;
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
        const namespacedKey = `${params.bucket}:${params.key}`;
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
        const key = `${params.bucket}:${params.key}`;
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
    singletonStore = null;
    getRateLimitStore = () => {
      if (singletonStore) {
        return singletonStore;
      }
      const { redisRestUrl, redisRestToken } = getEnvConfig();
      if (redisRestUrl && redisRestToken) {
        singletonStore = new UpstashRedisRateLimitStore(redisRestUrl, redisRestToken);
        return singletonStore;
      }
      singletonStore = new InMemoryRateLimitStore();
      return singletonStore;
    };
  }
});

// backend/src/middleware/rateLimit.middleware.ts
var rateLimitStore, getClientKey, createRateLimiter, authRateLimit, interviewRateLimit, feedbackRateLimit, resumeRateLimit;
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
    resumeRateLimit = createRateLimiter({
      bucket: "rl:resume",
      windowMs: 5 * 60 * 1e3,
      max: 10,
      message: "Too many resume upload attempts. Please wait and try again."
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
          return res.json({ question, sessionId: session._id });
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
async function generateFeedback(role, question, answer, expectedPoints = []) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }
  const safeRole = cleanText2(role, 80);
  const safeQuestion = cleanText2(question, 1e3);
  const safeAnswer = cleanText2(answer, 5e3);
  const safeExpectedPoints = expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText2(item, 200)).filter(Boolean).slice(0, 8);
  const heuristics = buildHeuristicAssessment(safeQuestion, safeAnswer, safeExpectedPoints);
  if (heuristics.lowConfidence || heuristics.wordCount < 8) {
    return {
      feedback: heuristics.feedback,
      followUp: heuristics.followUp
    };
  }
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
  const referer = process.env.FRONTEND_URL?.startsWith("http") ? process.env.FRONTEND_URL : "https://interviewai.app";
  try {
    const response = await axios2.post(
      OPENROUTER_ENDPOINT2,
      {
        model: process.env.OPENROUTER_FEEDBACK_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL2,
        messages: [
          { role: "system", content: "You are a strict and accurate interview evaluator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: RESPONSE_MAX_TOKENS2
      },
      {
        timeout: REQUEST_TIMEOUT_MS2,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": referer,
          "X-Title": "Interview AI Coach",
          "Content-Type": "application/json"
        }
      }
    );
    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return {
        feedback: heuristics.feedback,
        followUp: heuristics.followUp
      };
    }
    const parsed = parseFeedback(text);
    if (!parsed) {
      return {
        feedback: heuristics.feedback,
        followUp: heuristics.followUp
      };
    }
    return {
      feedback: calibrateFeedback(parsed.feedback, heuristics),
      followUp: parsed.followUp || heuristics.followUp
    };
  } catch (error) {
    if (axios2.isAxiosError(error)) {
      console.warn("Feedback provider fallback used", {
        status: error.response?.status,
        code: error.code
      });
    }
    return {
      feedback: heuristics.feedback,
      followUp: heuristics.followUp
    };
  }
}
var OPENROUTER_ENDPOINT2, DEFAULT_MODEL2, REQUEST_TIMEOUT_MS2, RESPONSE_MAX_TOKENS2, STOP_WORDS, cleanText2, normalizeText, clampScore, roundToOneDecimal, extractJson2, sanitizeList, hasLowConfidenceLanguage, matchesExpectedPoint, buildHeuristicAssessment, calibrateFeedback, parseFeedback;
var init_feedback_service = __esm({
  "backend/src/services/feedback.service.ts"() {
    "use strict";
    OPENROUTER_ENDPOINT2 = "https://openrouter.ai/api/v1/chat/completions";
    DEFAULT_MODEL2 = "meta-llama/llama-3.1-8b-instruct:free";
    REQUEST_TIMEOUT_MS2 = 1e4;
    RESPONSE_MAX_TOKENS2 = 450;
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
      "should"
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
      const matchedPoints = expectedPoints.filter(
        (point) => matchesExpectedPoint(point, normalizedAnswer)
      );
      const missingPoints = expectedPoints.filter((point) => !matchedPoints.includes(point));
      const coverageRatio = expectedPoints.length > 0 ? matchedPoints.length / expectedPoints.length : 0.5;
      let technical = expectedPoints.length > 0 ? 1.5 + coverageRatio * 7.5 : 2.5 + Math.min(wordCount, 160) / 28;
      let completeness = expectedPoints.length > 0 ? 1.2 + coverageRatio * 8 : 2.2 + Math.min(wordCount, 160) / 30;
      let clarity = 2 + Math.min(wordCount, 180) / 35;
      if (wordCount < 40) {
        clarity -= 0.6;
      }
      if (wordCount < 20) {
        technical = Math.min(technical, 4.2);
        completeness = Math.min(completeness, 4);
        clarity = Math.min(clarity, 5);
      }
      if (wordCount < 10) {
        technical = Math.min(technical, 2.8);
        completeness = Math.min(completeness, 2.6);
        clarity = Math.min(clarity, 4);
      }
      if (lowConfidence) {
        technical = Math.min(technical, 2.5);
        completeness = Math.min(completeness, 2.5);
        clarity = Math.min(clarity, 4.5);
      }
      if (expectedPoints.length >= 2) {
        if (coverageRatio < 0.35) {
          technical = Math.min(technical, 4.8);
          completeness = Math.min(completeness, 4.6);
        }
        if (coverageRatio === 0) {
          technical = Math.min(technical, 2.8);
          completeness = Math.min(completeness, 2.5);
        }
      }
      technical = clampScore(technical);
      clarity = clampScore(clarity);
      completeness = clampScore(completeness);
      const overall = clampScore(
        roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3)
      );
      const strengths = [];
      if (clarity >= 6) {
        strengths.push("Your response is easy to follow.");
      }
      if (wordCount >= 35) {
        strengths.push("You provided enough detail for meaningful evaluation.");
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
        wordCount
      };
    };
    calibrateFeedback = (aiFeedback, heuristics) => {
      const calibratedTechnical = clampScore(
        Math.min(aiFeedback.technical, heuristics.feedback.technical + 1.2)
      );
      const calibratedCompleteness = clampScore(
        Math.min(aiFeedback.completeness, heuristics.feedback.completeness + 1.2)
      );
      const calibratedClarity = clampScore(
        Math.min(aiFeedback.clarity, heuristics.feedback.clarity + 1.5)
      );
      let technical = calibratedTechnical;
      let completeness = calibratedCompleteness;
      let clarity = calibratedClarity;
      if (heuristics.expectedPointCount >= 2 && heuristics.coverageRatio < 0.35) {
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
  }
});

// backend/src/routes/feedback.routes.ts
import express from "express";
var router2, feedback_routes_default;
var init_feedback_routes = __esm({
  "backend/src/routes/feedback.routes.ts"() {
    "use strict";
    init_feedback_service();
    init_auth_middleware();
    init_validation_middleware();
    init_interviewSession();
    init_rateLimit_middleware();
    router2 = express.Router();
    router2.post(
      "/",
      authMiddleware,
      feedbackRateLimit,
      ...feedbackValidation,
      handleValidationErrors,
      async (req, res) => {
        try {
          const user = req.user;
          const { role, question, answer, expectedPoints, sessionId } = req.body;
          const result = await generateFeedback(
            role,
            question,
            answer,
            Array.isArray(expectedPoints) ? expectedPoints : []
          );
          if (sessionId) {
            const session = await interviewSession_default.findOne({
              _id: sessionId,
              userId: user._id
            });
            if (session && session.questions.length > 0) {
              const lastIdx = session.questions.length - 1;
              session.questions[lastIdx].answer = answer;
              session.questions[lastIdx].feedback = result.feedback;
              if (result.followUp?.prompt) {
                const followUpCategory = session.questions[lastIdx].category;
                session.questions.push({
                  question: result.followUp.prompt,
                  answer: "",
                  category: followUpCategory
                });
              }
              session.lastActivityAt = /* @__PURE__ */ new Date();
              await session.save();
            }
          }
          return res.json(result);
        } catch {
          return res.status(500).json({
            success: false,
            message: "Failed to generate feedback"
          });
        }
      }
    );
    feedback_routes_default = router2;
  }
});

// backend/src/services/auth.service.ts
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
var SALT_ROUNDS, TOKEN_TTL, normalizeEmail, AuthService;
var init_auth_service = __esm({
  "backend/src/services/auth.service.ts"() {
    "use strict";
    init_user();
    SALT_ROUNDS = 12;
    TOKEN_TTL = "7d";
    normalizeEmail = (email) => email.trim().toLowerCase();
    AuthService = class {
      static async signup(name, email, password) {
        const normalizedEmail = normalizeEmail(email);
        const exists = await user_default.findOne({ email: normalizedEmail });
        if (exists) throw new Error("User already exists");
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await user_default.create({
          name: name.trim(),
          email: normalizedEmail,
          passwordHash
        });
        return this.generateToken(user._id.toString());
      }
      static async login(email, password) {
        const normalizedEmail = normalizeEmail(email);
        const user = await user_default.findOne({ email: normalizedEmail });
        if (!user) throw new Error("Invalid email or password");
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) throw new Error("Invalid email or password");
        return this.generateToken(user._id.toString());
      }
      static generateToken(id) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error("JWT secret is not configured");
        }
        return jwt2.sign({ id }, secret, {
          expiresIn: TOKEN_TTL,
          algorithm: "HS256"
        });
      }
      static async getUserFromToken(token) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error("JWT secret is not configured");
        }
        const decoded = jwt2.verify(token, secret);
        const user = await user_default.findById(decoded.id).select("-passwordHash");
        if (!user) throw new Error("User not found");
        return user;
      }
    };
  }
});

// backend/src/controllers/auth.controller.ts
var isProduction, COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS, AuthController;
var init_auth_controller = __esm({
  "backend/src/controllers/auth.controller.ts"() {
    "use strict";
    init_auth_service();
    isProduction = process.env.NODE_ENV === "production";
    COOKIE_OPTIONS = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: 1e3 * 60 * 60 * 24 * 7
    };
    CLEAR_COOKIE_OPTIONS = {
      ...COOKIE_OPTIONS,
      maxAge: 0
    };
    AuthController = class {
      static async signup(req, res) {
        try {
          const { name, email, password } = req.body;
          const token = await AuthService.signup(name, email, password);
          const user = await AuthService.getUserFromToken(token);
          res.cookie("token", token, COOKIE_OPTIONS);
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
          const token = await AuthService.login(email, password);
          const user = await AuthService.getUserFromToken(token);
          res.cookie("token", token, COOKIE_OPTIONS);
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
      static async getMe(req, res) {
        try {
          const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
          if (!token) {
            return res.status(401).json({
              success: false,
              message: "Not authenticated"
            });
          }
          const user = await AuthService.getUserFromToken(token);
          return res.json({
            success: true,
            user
          });
        } catch {
          return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
          });
        }
      }
      static async logout(_req, res) {
        res.clearCookie("token", CLEAR_COOKIE_OPTIONS);
        return res.json({
          success: true,
          message: "Logged out"
        });
      }
    };
  }
});

// backend/src/middleware/csrf.middleware.ts
import crypto from "crypto";
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
    generateToken = () => crypto.randomBytes(32).toString("hex");
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
    router3.get("/me", AuthController.getMe);
    router3.post("/logout", AuthController.logout);
    auth_routes_default = router3;
  }
});

// backend/src/routes/history.routes.ts
import { Router as Router3 } from "express";
import mongoose3 from "mongoose";
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
        if (!mongoose3.isValidObjectId(id)) {
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

// backend/src/lib/db.ts
import mongoose4 from "mongoose";
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
    cached.promise = mongoose4.connect(mongoUri, opts).then((mongooseInstance) => {
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
import mongoose5 from "mongoose";
import { fileURLToPath } from "url";
var env, app, isProduction3, defaultDevOrigins, allowedOrigins, __filename, __dirname, frontendCandidates, frontendPath, normalizeHost, getOriginHost, isOriginAllowed, baseCorsOptions, corsDelegate, buildHealthPayload, healthHandler, readinessHandler, requireDb, app_default;
var init_app = __esm({
  "backend/src/app.ts"() {
    "use strict";
    init_interview_routes();
    init_feedback_routes();
    init_auth_routes();
    init_history_routes();
    init_resume_routes();
    init_db();
    init_csrf_middleware();
    init_env();
    env = getEnvConfig();
    app = express2();
    isProduction3 = env.isProduction;
    defaultDevOrigins = isProduction3 ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
    allowedOrigins = /* @__PURE__ */ new Set([...defaultDevOrigins, ...env.allowedCorsOrigins]);
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
    buildHealthPayload = () => ({
      uptime: Math.round(process.uptime()),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      dbState: mongoose5.connection.readyState
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
    app.use("/api/auth", auth_routes_default);
    app.use("/api/interview", interview_routes_default);
    app.use("/api/interview/feedback", feedback_routes_default);
    app.use("/api/history", history_routes_default);
    app.use("/api/resume", resume_routes_default);
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
        res.status(statusCode).json({
          success: false,
          message
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
