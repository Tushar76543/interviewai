// backend/src/serverless.ts
import serverless from "serverless-http";

// backend/src/app.ts
import dotenv3 from "dotenv";
import path3 from "path";
import express2 from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";

// backend/src/routes/interview.routes.ts
import { Router } from "express";

// backend/src/services/openai.service.ts
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
var OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
async function generateQuestion(role, difficulty, previousQuestions = []) {
  const previousList = previousQuestions.length ? `Avoid repeating any of these topics:
${previousQuestions.join("\n")}` : "";
  const prompt = `
  You are an expert interviewer.
  Generate ONE unique ${difficulty} level interview question for a ${role}.
  ${previousList}
  The question should be fresh, non-repetitive, and cover a different subtopic.
  
  Return JSON in this format:
  {"qid":"q1","prompt":"<the question>","expectedPoints":["point1","point2"],"timeLimitSec":120}
  `;
  console.log("\u{1F539} Sending request to OpenRouter...");
  const authKey = process.env.OPENROUTER_API_KEY;
  console.log("\u{1F539} Using key starts with:", authKey ? authKey.slice(0, 8) + "..." : "MISSING");
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: "You are an AI Interview Coach." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
        // higher temp => more creativity / less repetition
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "AI Interview Coach",
          "Content-Type": "application/json"
        }
      }
    );
    const text = response.data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from model");
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Invalid JSON format: " + text);
    }
  } catch (err) {
    console.error("\u274C Error contacting OpenRouter:", err.response?.data || err.message);
    throw new Error("Failed to generate question.");
  }
}

// backend/src/middleware/auth.middleware.ts
import jwt from "jsonwebtoken";

// backend/src/models/user.ts
import mongoose, { Schema } from "mongoose";
var UserSchema = new Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  rolePreferences: { type: [String], default: [] },
  interviewHistory: { type: [String], default: [] }
});
var user_default = mongoose.models.User || mongoose.model("User", UserSchema);

// backend/src/middleware/auth.middleware.ts
var authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
    console.log("\u{1F539} Auth Middleware - Token present:", !!token);
    if (!token) {
      console.log("\u274C No token found in cookies or headers");
      return res.status(401).json({ message: "Not authenticated" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await user_default.findById(decoded.id).select("-passwordHash");
    if (!user) {
      console.log("\u274C User not found for token");
      return res.status(401).json({ message: "Invalid token" });
    }
    req.user = user;
    console.log("\u2705 Auth successful for user:", user._id);
    next();
  } catch (err) {
    console.error("\u274C Auth error:", err);
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

// backend/src/routes/interview.routes.ts
var router = Router();
router.post(
  "/start",
  authMiddleware,
  async (req, res) => {
    try {
      const user = req.user;
      const { role, difficulty, previousQuestions, sessionId } = req.body;
      const question = await generateQuestion(
        role || "Software Engineer",
        difficulty || "Medium",
        previousQuestions || []
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
          role: role || "Software Engineer",
          difficulty: difficulty || "Medium",
          questions: [{ question: question.prompt, answer: "" }]
        });
      }
      if (!session) {
        return res.status(404).json({ error: "Session not found." });
      }
      res.json({ question, sessionId: session._id });
    } catch (error) {
      console.error("\u274C Error in /start route:", error);
      res.status(500).json({
        error: error.message || "Failed to generate question."
      });
    }
  }
);
var interview_routes_default = router;

// backend/src/routes/feedback.routes.ts
import express from "express";

// backend/src/services/feedback.service.ts
import dotenv2 from "dotenv";
import path2 from "path";
import axios2 from "axios";
dotenv2.config({ path: path2.resolve(process.cwd(), ".env") });
async function generateFeedback(role, question, answer) {
  const prompt = `
You are an expert interviewer evaluating a candidate for a ${role} position.

Evaluate the following answer in 3 key areas:
1\uFE0F\u20E3 Technical correctness (0\u201310)
2\uFE0F\u20E3 Clarity & communication (0\u201310)
3\uFE0F\u20E3 Completeness (0\u201310)

Also, write a short suggestion (1\u20132 lines) for improvement.

Finally, generate ONE short, meaningful follow-up question that builds on the candidate\u2019s answer.

Return JSON ONLY in this format:
{
  "feedback": {
    "technical": 8.5,
    "clarity": 9,
    "completeness": 7.5,
    "suggestion": "Try explaining the trade-offs between models."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "<the follow-up question>",
    "expectedPoints": ["point1", "point2"]
  }
}

Question: ${question}
Answer: ${answer}
`;
  try {
    const response = await axios2.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: "You are a strict but fair AI interview evaluator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "AI Interview Coach",
          "Content-Type": "application/json"
        }
      }
    );
    const text = response.data.choices?.[0]?.message?.content;
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    return parsed || {
      feedback: {
        technical: 0,
        clarity: 0,
        completeness: 0,
        suggestion: "No feedback generated."
      },
      followUp: null
    };
  } catch (err) {
    console.error("\u274C Feedback error:", err.response?.data || err.message);
    throw new Error("Feedback generation failed.");
  }
}

// backend/src/middleware/validation.middleware.ts
import { body, validationResult } from "express-validator";
var signupValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters").matches(/\d/).withMessage("Password must contain at least one number").matches(/[a-zA-Z]/).withMessage("Password must contain at least one letter")
];
var loginValidation = [
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required")
];
var interviewStartValidation = [
  body("role").optional().trim().notEmpty(),
  body("difficulty").optional().trim().notEmpty()
];
var feedbackValidation = [
  body("role").trim().notEmpty().withMessage("Role is required"),
  body("question").trim().notEmpty().withMessage("Question is required"),
  body("answer").trim().notEmpty().withMessage("Answer is required")
];
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join("; ");
    return res.status(400).json({ success: false, message: msg });
  }
  next();
}

// backend/src/routes/feedback.routes.ts
var router2 = express.Router();
router2.post(
  "/",
  authMiddleware,
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
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate feedback." });
    }
  }
);
var feedback_routes_default = router2;

// backend/src/routes/auth.routes.ts
import { Router as Router2 } from "express";

// backend/src/services/auth.service.ts
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
var SALT_ROUNDS = 10;
var AuthService = class {
  // ============= SIGNUP =============
  static async signup(name, email, password) {
    const exists = await user_default.findOne({ email });
    if (exists) throw new Error("User already exists");
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await user_default.create({
      name,
      email,
      passwordHash
    });
    return this.generateToken(user._id.toString());
  }
  // ============= LOGIN =============
  static async login(email, password) {
    const user = await user_default.findOne({ email });
    if (!user) throw new Error("Invalid email or password");
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) throw new Error("Invalid email or password");
    return this.generateToken(user._id.toString());
  }
  // ============= GENERATE TOKEN =============
  static generateToken(id) {
    return jwt2.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
  }
  // ============= GET USER FROM TOKEN =============
  static async getUserFromToken(token) {
    const decoded = jwt2.verify(token, process.env.JWT_SECRET);
    const user = await user_default.findById(decoded.id).select("-passwordHash");
    if (!user) throw new Error("User not found");
    return user;
  }
};

// backend/src/controllers/auth.controller.ts
var COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 1e3 * 60 * 60 * 24 * 7
  // 7 days
};
var AuthController = class {
  // ======================
  // SIGNUP
  // ======================
  static async signup(req, res) {
    try {
      const { name, email, password } = req.body;
      const token = await AuthService.signup(name, email, password);
      const user = await AuthService.getUserFromToken(token);
      res.cookie("token", token, COOKIE_OPTIONS);
      return res.json({
        success: true,
        message: "Signup successful",
        user,
        token
        // For cross-origin: frontend stores and sends via Authorization header
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
  // ======================
  // LOGIN
  // ======================
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      const token = await AuthService.login(email, password);
      const user = await AuthService.getUserFromToken(token);
      res.cookie("token", token, COOKIE_OPTIONS);
      return res.json({
        success: true,
        message: "Login successful",
        user,
        token
        // For cross-origin: frontend stores and sends via Authorization header
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
  // ======================
  // GET ME (Current User)
  // ======================
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
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
  }
  // ======================
  // LOGOUT
  // ======================
  static async logout(req, res) {
    res.clearCookie("token");
    return res.json({
      success: true,
      message: "Logged out"
    });
  }
};

// backend/src/routes/auth.routes.ts
var router3 = Router2();
router3.post(
  "/signup",
  signupValidation,
  handleValidationErrors,
  AuthController.signup
);
router3.post(
  "/login",
  loginValidation,
  handleValidationErrors,
  AuthController.login
);
router3.get("/me", AuthController.getMe);
router3.post("/logout", AuthController.logout);
var auth_routes_default = router3;

// backend/src/routes/history.routes.ts
import { Router as Router3 } from "express";
var router4 = Router3();
router4.get("/", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const sessions = await interviewSession_default.find({ userId: user._id }).sort({ lastActivityAt: -1 }).limit(50).select("-__v").lean();
    res.json({ sessions });
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to fetch history." });
  }
});
router4.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const session = await interviewSession_default.findOne({
      _id: req.params.id,
      userId: user._id
    }).select("-__v").lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json({ session });
  } catch (error) {
    console.error("Session fetch error:", error);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});
var history_routes_default = router4;

// backend/src/routes/resume.routes.ts
import { Router as Router4 } from "express";
import multer from "multer";
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var pdf = require2("pdf-parse-fork");
var router5 = Router4();
var upload = multer({ storage: multer.memoryStorage() });
router5.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No resume uploaded" });
    const buffer = req.file.buffer;
    const data = await pdf(buffer);
    const text = data.text;
    res.json({
      success: true,
      message: "Resume processed successfully!",
      textPreview: text.substring(0, 200) + "...",
      skillsFound: ["JavaScript", "React", "Node.js"]
      // Mock skills
    });
  } catch (error) {
    console.error("Resume parsing error:", error);
    res.status(500).json({ error: "Failed to process resume" });
  }
});
var resume_routes_default = router5;

// backend/src/lib/db.ts
import mongoose3 from "mongoose";
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
    throw new Error("MONGODB_URI is not defined");
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5e3,
      socketTimeoutMS: 1e4
    };
    cached.promise = mongoose3.connect(uri, opts).then((mongoose4) => {
      return mongoose4;
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
dotenv3.config();
var apiKey = process.env.OPENROUTER_API_KEY;
console.log("\u2705 API Key check:", apiKey ? `Present (starts with ${apiKey.slice(0, 8)}...)` : "MISSING \u274C");
var app = express2();
var PORT = process.env.PORT || 5e3;
app.use(async (req, res, next) => {
  if (req.path === "/api/health") return next();
  if (!process.env.MONGO_URI) {
    console.error("\u274C CRITICAL: MONGO_URI is missing in environment variables!");
    return res.status(500).json({
      success: false,
      message: "Server Configuration Error: MONGO_URI is missing.",
      error: "Missing Environment Variables"
    });
  }
  if (!process.env.JWT_SECRET) {
    console.error("\u274C CRITICAL: JWT_SECRET is missing in environment variables!");
    return res.status(500).json({
      success: false,
      message: "Server Configuration Error: JWT_SECRET is missing.",
      error: "Missing Environment Variables"
    });
  }
  try {
    await db_default();
    next();
  } catch (error) {
    console.error("\u274C Database Connection Failed:", error);
    res.status(500).json({
      success: false,
      message: "Database Connection Failed",
      error: error.message
    });
  }
});
var allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.FRONTEND_URL || ""
  // Add production URL
].filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  })
);
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express2.json());
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});
app.use("/api/auth", auth_routes_default);
app.use("/api/interview", interview_routes_default);
app.use("/api/interview/feedback", feedback_routes_default);
app.use("/api/history", history_routes_default);
app.use("/api/resume", resume_routes_default);
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var frontendPath = process.env.VERCEL ? path3.join(process.cwd(), "frontend/dist") : path3.join(__dirname, "../../frontend/dist");
console.log("\u{1F4C2} Resolved Frontend Path:", frontendPath);
app.use(express2.static(frontendPath));
app.get("*", (req, res) => {
  const indexPath = path3.join(frontendPath, "index.html");
  if (!res.headersSent) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error("\u274C Could not serve index.html:", err);
        res.status(500).send("Server Error: Frontend not found.");
      }
    });
  }
});
var app_default = app;

// backend/src/serverless.ts
var serverless_default = serverless(app_default);
export {
  serverless_default as default
};
