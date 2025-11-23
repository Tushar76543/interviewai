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

// backend/src/routes/interview.routes.js
import { Router } from "express";

// backend/src/services/openai.service.ts
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
var OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
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
  console.log("\u{1F539} Using key starts with:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-70b-instruct",
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
var user_default = mongoose.model("User", UserSchema);

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

// backend/src/routes/interview.routes.js
var router = Router();
router.post("/start", authMiddleware, async (req, res) => {
  try {
    const { role, difficulty, previousQuestions } = req.body;
    const question = await generateQuestion(role, difficulty, previousQuestions);
    res.json({ question });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to generate question."
    });
  }
});
var interview_routes_default = router;

// backend/src/routes/feedback.routes.js
import express from "express";

// backend/src/services/feedback.service.js
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
    const response = await axios2.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "meta-llama/llama-3-70b-instruct",
      messages: [
        { role: "system", content: "You are a strict but fair AI interview evaluator." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AI Interview Coach",
        "Content-Type": "application/json"
      }
    });
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

// backend/src/routes/feedback.routes.js
var router2 = express.Router();
router2.post("/", async (req, res) => {
  try {
    const { role, question, answer } = req.body;
    const result = await generateFeedback(role, question, answer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate feedback." });
  }
});
var feedback_routes_default = router2;

// backend/src/routes/auth.routes.js
import { Router as Router2 } from "express";

// backend/src/services/auth.service.js
import bcrypt from "bcrypt";
import jwt2 from "jsonwebtoken";
var SALT_ROUNDS = 10;
var AuthService = class {
  // ============= SIGNUP =============
  static async signup(name, email, password) {
    const exists = await user_default.findOne({ email });
    if (exists)
      throw new Error("User already exists");
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
    if (!user)
      throw new Error("Invalid email or password");
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
      throw new Error("Invalid email or password");
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
    if (!user)
      throw new Error("User not found");
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
        user
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
        user
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
      const token = req.cookies.token;
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

// backend/src/routes/auth.routes.js
var router3 = Router2();
router3.post("/signup", AuthController.signup);
router3.post("/login", AuthController.login);
router3.post("/logout", AuthController.logout);
var auth_routes_default = router3;

// backend/src/lib/db.ts
import mongoose2 from "mongoose";
var MONGODB_URI = process.env.MONGO_URI;
if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}
var cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5e3,
      // Fail after 5s
      socketTimeoutMS: 1e4
      // Close socket after 10s
    };
    cached.promise = mongoose2.connect(MONGODB_URI, opts).then((mongoose3) => {
      return mongoose3;
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
dotenv3.config({ path: path3.resolve(process.cwd(), ".env") });
console.log("\u2705 Loaded key prefix:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");
var app = express2();
var PORT = process.env.PORT || 5e3;
app.use(async (req, res, next) => {
  if (req.path === "/api/health") return next();
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
  "http://127.0.0.1:5173",
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
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var frontendPath = path3.join(__dirname, "../../frontend/dist");
app.use(express2.static(frontendPath));
app.get("*", (req, res) => {
  res.sendFile(path3.join(frontendPath, "index.html"));
});
var app_default = app;

// backend/src/serverless.ts
var serverless_default = serverless(app_default);
export {
  serverless_default as default
};
