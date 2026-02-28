// backend/src/serverless.ts
import serverless from "serverless-http";

// backend/src/app.ts
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import express2 from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose5 from "mongoose";
import { fileURLToPath } from "url";

// backend/src/routes/interview.routes.ts
import { Router } from "express";

// backend/src/services/openai.service.ts
import axios from "axios";
var OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
var REQUEST_TIMEOUT_MS = 2e4;
var cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
var extractJson = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "";
};
var parseQuestion = (raw) => {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (!parsed || typeof parsed.prompt !== "string") {
      return null;
    }
    const prompt = cleanText(parsed.prompt, 1e3);
    const expectedPoints = Array.isArray(parsed.expectedPoints) ? parsed.expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 6) : [];
    return {
      qid: typeof parsed.qid === "string" && parsed.qid.trim() ? parsed.qid.trim() : "q1",
      prompt,
      expectedPoints,
      timeLimitSec: typeof parsed.timeLimitSec === "number" && parsed.timeLimitSec > 0 ? Math.min(parsed.timeLimitSec, 600) : 120
    };
  } catch {
    return null;
  }
};
async function generateQuestion(role, difficulty, previousQuestions = []) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }
  const safeRole = cleanText(role || "Software Engineer", 80) || "Software Engineer";
  const safeDifficulty = cleanText(difficulty || "Medium", 20) || "Medium";
  const safePrevious = previousQuestions.filter((item) => typeof item === "string").map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 20);
  const previousList = safePrevious.length ? `Avoid repeating these previous prompts:
${safePrevious.join("\n")}` : "";
  const prompt = `
You are an expert interviewer.
Generate one unique ${safeDifficulty} interview question for a ${safeRole} role.
${previousList}

Return JSON only in this format:
{"qid":"q1","prompt":"<question>","expectedPoints":["point1","point2"],"timeLimitSec":120}
`;
  const referer = process.env.FRONTEND_URL?.startsWith("http") ? process.env.FRONTEND_URL : "https://interviewai.app";
  try {
    const response = await axios.post(
      OPENROUTER_ENDPOINT,
      {
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are an AI Interview Coach." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
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
      throw new Error("Empty response from AI model");
    }
    const parsed = parseQuestion(text);
    if (!parsed) {
      throw new Error("Invalid question format from AI model");
    }
    return parsed;
  } catch {
    throw new Error("Failed to generate question");
  }
}

// backend/src/middleware/auth.middleware.ts
import jwt from "jsonwebtoken";

// backend/src/models/user.ts
import mongoose, { Schema } from "mongoose";
var UserSchema = new Schema(
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
var user_default = mongoose.models.User || mongoose.model("User", UserSchema);

// backend/src/middleware/auth.middleware.ts
var extractToken = (req) => {
  const authHeader = req.headers.authorization;
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return req.cookies?.token || bearerToken;
};
var authMiddleware = async (req, res, next) => {
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

// backend/src/models/interviewSession.ts
import mongoose2, { Schema as Schema2 } from "mongoose";
var QAEntrySchema = new Schema2(
  {
    question: { type: String, required: true },
    answer: { type: String, default: "" },
    feedback: {
      technical: Number,
      clarity: Number,
      completeness: Number,
      suggestion: String
    }
  },
  { _id: false }
);
var InterviewSessionSchema = new Schema2(
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
var interviewSession_default = mongoose2.models.InterviewSession || mongoose2.model(
  "InterviewSession",
  InterviewSessionSchema
);

// backend/src/middleware/validation.middleware.ts
import { body, validationResult } from "express-validator";
var ROLE_MIN_LENGTH = 2;
var ROLE_MAX_LENGTH = 80;
var QUESTION_MAX_LENGTH = 1e3;
var ANSWER_MAX_LENGTH = 5e3;
var signupValidation = [
  body("name").trim().isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters"),
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 8, max: 128 }).withMessage("Password must be between 8 and 128 characters").matches(/\d/).withMessage("Password must contain at least one number").matches(/[a-zA-Z]/).withMessage("Password must contain at least one letter")
];
var loginValidation = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isString().notEmpty().withMessage("Password is required")
];
var interviewStartValidation = [
  body("role").optional().isString().trim().isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH }).withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
  body("difficulty").optional().isString().trim().isIn(["Easy", "Medium", "FAANG"]).withMessage("Difficulty must be one of: Easy, Medium, FAANG"),
  body("previousQuestions").optional().isArray({ max: 20 }).withMessage("previousQuestions can contain at most 20 items"),
  body("previousQuestions.*").optional().isString().trim().isLength({ min: 3, max: QUESTION_MAX_LENGTH }).withMessage(`Each previous question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
  body("sessionId").optional().isMongoId().withMessage("sessionId must be a valid identifier")
];
var feedbackValidation = [
  body("role").trim().isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH }).withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
  body("question").trim().isLength({ min: 3, max: QUESTION_MAX_LENGTH }).withMessage(`Question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
  body("answer").trim().isLength({ min: 1, max: ANSWER_MAX_LENGTH }).withMessage(`Answer must be between 1 and ${ANSWER_MAX_LENGTH} characters`),
  body("sessionId").optional().isMongoId().withMessage("sessionId must be a valid identifier")
];
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join("; ");
    return res.status(400).json({ success: false, message: msg });
  }
  next();
}

// backend/src/lib/rateLimitStore.ts
var asNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
var InMemoryRateLimitStore = class {
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
var UpstashRedisRateLimitStore = class {
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
var singletonStore = null;
var getRateLimitStore = () => {
  if (singletonStore) {
    return singletonStore;
  }
  const redisUrl = process.env.REDIS_REST_URL;
  const redisToken = process.env.REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    singletonStore = new UpstashRedisRateLimitStore(redisUrl, redisToken);
    return singletonStore;
  }
  singletonStore = new InMemoryRateLimitStore();
  return singletonStore;
};

// backend/src/middleware/rateLimit.middleware.ts
var rateLimitStore = getRateLimitStore();
var getClientKey = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwarded = typeof forwardedValue === "string" ? forwardedValue.split(",")[0].trim() : "";
  return forwarded || req.ip || "unknown";
};
var createRateLimiter = ({ bucket, windowMs, max, message }) => {
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
var authRateLimit = createRateLimiter({
  bucket: "rl:auth",
  windowMs: 15 * 60 * 1e3,
  max: 20,
  message: "Too many authentication attempts. Try again later."
});
var interviewRateLimit = createRateLimiter({
  bucket: "rl:interview",
  windowMs: 60 * 1e3,
  max: 30,
  message: "Too many interview requests. Please slow down."
});
var feedbackRateLimit = createRateLimiter({
  bucket: "rl:feedback",
  windowMs: 60 * 1e3,
  max: 25,
  message: "Too many feedback requests. Please slow down."
});
var resumeRateLimit = createRateLimiter({
  bucket: "rl:resume",
  windowMs: 5 * 60 * 1e3,
  max: 10,
  message: "Too many resume upload attempts. Please wait and try again."
});

// backend/src/routes/interview.routes.ts
var router = Router();
router.post(
  "/start",
  authMiddleware,
  interviewRateLimit,
  ...interviewStartValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = req.user;
      const { role, difficulty, previousQuestions, sessionId } = req.body;
      const resolvedRole = role || "Software Engineer";
      const resolvedDifficulty = difficulty || "Medium";
      const prior = Array.isArray(previousQuestions) ? previousQuestions : [];
      const question = await generateQuestion(
        resolvedRole,
        resolvedDifficulty,
        prior
      );
      let session;
      if (sessionId) {
        session = await interviewSession_default.findOneAndUpdate(
          { _id: sessionId, userId: user._id },
          {
            $push: {
              questions: { question: question.prompt, answer: "" }
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
          questions: [{ question: question.prompt, answer: "" }]
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
      const message = error instanceof Error && !isProduction4 ? error.message : "Failed to generate question";
      return res.status(500).json({
        success: false,
        message
      });
    }
  }
);
var interview_routes_default = router;

// backend/src/routes/feedback.routes.ts
import express from "express";

// backend/src/services/feedback.service.ts
import axios2 from "axios";
var OPENROUTER_ENDPOINT2 = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_MODEL2 = "meta-llama/llama-3.3-70b-instruct:free";
var REQUEST_TIMEOUT_MS2 = 2e4;
var cleanText2 = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
var clampScore = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
};
var extractJson2 = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "";
};
var parseFeedback = (raw) => {
  try {
    const parsed = JSON.parse(extractJson2(raw));
    const feedback = parsed.feedback;
    if (!feedback) return null;
    const sanitizedFeedback = {
      technical: clampScore(feedback.technical),
      clarity: clampScore(feedback.clarity),
      completeness: clampScore(feedback.completeness),
      suggestion: cleanText2(
        typeof feedback.suggestion === "string" ? feedback.suggestion : "No suggestion generated",
        320
      )
    };
    const followUp = parsed.followUp;
    const sanitizedFollowUp = followUp && typeof followUp.prompt === "string" ? {
      qid: typeof followUp.qid === "string" ? cleanText2(followUp.qid, 40) || "followup1" : "followup1",
      prompt: cleanText2(followUp.prompt, 1e3),
      expectedPoints: Array.isArray(followUp.expectedPoints) ? followUp.expectedPoints.filter((item) => typeof item === "string").map((item) => cleanText2(item, 240)).filter(Boolean).slice(0, 6) : []
    } : null;
    return {
      feedback: sanitizedFeedback,
      followUp: sanitizedFollowUp
    };
  } catch {
    return null;
  }
};
async function generateFeedback(role, question, answer) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }
  const safeRole = cleanText2(role, 80);
  const safeQuestion = cleanText2(question, 1e3);
  const safeAnswer = cleanText2(answer, 5e3);
  const prompt = `
You are an expert interviewer evaluating a candidate for a ${safeRole} position.

Evaluate the following answer in three areas:
1. Technical correctness (0-10)
2. Clarity and communication (0-10)
3. Completeness (0-10)

Also provide a short suggestion (1-2 lines) for improvement.
Finally, generate one short follow-up question.

Return JSON only in this format:
{
  "feedback": {
    "technical": 8.5,
    "clarity": 9,
    "completeness": 7.5,
    "suggestion": "Explain trade-offs more clearly."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "<follow-up question>",
    "expectedPoints": ["point1", "point2"]
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
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL2,
        messages: [
          { role: "system", content: "You are a strict but fair AI interview evaluator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4
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
      throw new Error("Empty response from AI model");
    }
    const parsed = parseFeedback(text);
    if (!parsed) {
      throw new Error("Invalid feedback format from AI model");
    }
    return parsed;
  } catch {
    throw new Error("Feedback generation failed");
  }
}

// backend/src/routes/feedback.routes.ts
var router2 = express.Router();
router2.post(
  "/",
  authMiddleware,
  feedbackRateLimit,
  ...feedbackValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = req.user;
      const { role, question, answer, sessionId } = req.body;
      const result = await generateFeedback(role, question, answer);
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
            session.questions.push({
              question: result.followUp.prompt,
              answer: ""
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
var feedback_routes_default = router2;

// backend/src/routes/auth.routes.ts
import { Router as Router2 } from "express";

// backend/src/services/auth.service.ts
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
var SALT_ROUNDS = 12;
var TOKEN_TTL = "7d";
var normalizeEmail = (email) => email.trim().toLowerCase();
var AuthService = class {
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

// backend/src/controllers/auth.controller.ts
var isProduction = process.env.NODE_ENV === "production";
var COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: 1e3 * 60 * 60 * 24 * 7
};
var CLEAR_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 0
};
var AuthController = class {
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

// backend/src/middleware/csrf.middleware.ts
import crypto from "crypto";
var isProduction2 = process.env.NODE_ENV === "production";
var CSRF_COOKIE_NAME = "csrf_token";
var CSRF_HEADER_NAME = "x-csrf-token";
var CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: isProduction2,
  sameSite: isProduction2 ? "none" : "lax",
  path: "/",
  maxAge: 1e3 * 60 * 60 * 24
};
var SAFE_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
var generateToken = () => crypto.randomBytes(32).toString("hex");
var ensureTokenCookie = (req, res) => {
  const existing = req.cookies?.[CSRF_COOKIE_NAME];
  if (typeof existing === "string" && existing.length >= 32) {
    return existing;
  }
  const token = generateToken();
  res.cookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
  return token;
};
var csrfCookieMiddleware = (req, res, next) => {
  ensureTokenCookie(req, res);
  next();
};
var requireCsrfProtection = (req, res, next) => {
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
var issueCsrfToken = (req, res) => {
  const token = ensureTokenCookie(req, res);
  res.status(200).json({
    success: true,
    csrfToken: token
  });
};

// backend/src/routes/auth.routes.ts
var router3 = Router2();
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
var auth_routes_default = router3;

// backend/src/routes/history.routes.ts
import { Router as Router3 } from "express";
import mongoose3 from "mongoose";
var router4 = Router3();
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
var history_routes_default = router4;

// backend/src/routes/resume.routes.ts
import { Router as Router4 } from "express";
import multer from "multer";
var router5 = Router4();
var MAX_RESUME_SIZE = Number.parseInt(
  process.env.MAX_RESUME_FILE_SIZE_BYTES ?? `${2 * 1024 * 1024}`,
  10
);
var upload = multer({
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
var commonSkills = [
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
var extractSkills = (text) => {
  const normalized = text.toLowerCase();
  return commonSkills.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 10);
};
var pdfParser = null;
var getPdfParser = async () => {
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
var resume_routes_default = router5;

// backend/src/lib/db.ts
import mongoose4 from "mongoose";
var cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not defined");
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5e3,
      socketTimeoutMS: 1e4
    };
    cached.promise = mongoose4.connect(uri, opts).then((mongoose6) => {
      return mongoose6;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
var db_default = dbConnect;

// backend/src/app.ts
dotenv.config();
var app = express2();
var isProduction3 = process.env.NODE_ENV === "production";
var normalizeOrigin = (origin) => {
  const trimmed = origin.trim();
  if (!trimmed) return "";
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.origin;
  } catch {
    return "";
  }
};
var configuredOrigins = [
  process.env.FRONTEND_URL ?? "",
  ...(process.env.CORS_ORIGINS ?? "").split(",")
].map(normalizeOrigin).filter(Boolean);
var defaultDevOrigins = isProduction3 ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
var allowedOrigins = /* @__PURE__ */ new Set([...defaultDevOrigins, ...configuredOrigins]);
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var frontendCandidates = [
  path.join(process.cwd(), "frontend", "dist"),
  path.join(__dirname, "../../frontend/dist")
];
var frontendPath = frontendCandidates.find((candidate) => fs.existsSync(candidate));
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
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    credentials: true
  })
);
app.use(cookieParser());
app.use(express2.json({ limit: "1mb" }));
app.use(express2.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", csrfCookieMiddleware);
var healthHandler = (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    dbState: mongoose5.connection.readyState
  });
};
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);
app.use("/api", requireCsrfProtection);
var requireDb = async (_req, _res, next) => {
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
var app_default = app;

// backend/src/serverless.ts
var serverless_default = serverless(app_default);
export {
  serverless_default as default
};
