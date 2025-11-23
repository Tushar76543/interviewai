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

import dbConnect from "./lib/db.js";

// ... imports

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
//  DB Connection Middleware
// ======================
app.use(async (req, res, next) => {
    // Skip DB connection for health check
    if (req.path === "/api/health") return next();

    try {
        await dbConnect();
        next();
    } catch (error: any) {
        console.error("❌ Database Connection Failed:", error);
        res.status(500).json({
            success: false,
            message: "Database Connection Failed",
            error: error.message
        });
    }
});

// ======================
//  Middleware
// ======================

// 👉 Now only localhost allowed during development
const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    process.env.FRONTEND_URL || "", // Add production URL
].filter(Boolean);

app.use(
    cors({
        origin: allowedOrigins,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
    })
);

app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.json());

// Health Check
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "Server is running" });
});

// ======================
//  API Routes
// ======================
app.use("/api/auth", authRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/interview/feedback", feedbackRoutes);

// ======================
//  Serve Frontend Build (VERY IMPORTANT)
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendPath));

// Catch-all → Send React index.html
app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

export default app;
