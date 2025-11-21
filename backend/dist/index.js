import dotenv from "dotenv";
import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
// Routes
import interviewRoutes from "./routes/interview.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import authRoutes from "./routes/auth.routes.js";
// Load .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
console.log("✅ Loaded key prefix:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");
const app = express();
const PORT = process.env.PORT || 5000;
// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ======================
//  MongoDB Connection
// ======================
mongoose
    .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log("🍃 MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB Error:", err));
// ======================
//  Middleware
// ======================
// 👉 Now only localhost allowed during development
const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];
app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.json());
// ======================
//  API Routes
// ======================
app.use("/api/auth", authRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/interview/feedback", feedbackRoutes);
// ======================
//  Serve Frontend Build (VERY IMPORTANT)
// ======================
const frontendPath = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendPath));
// Catch-all → Send React index.html
app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});
// ======================
//  Start Server
// ======================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
