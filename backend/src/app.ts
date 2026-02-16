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
import historyRoutes from "./routes/history.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
// Load .env
dotenv.config(); // Simplified for Vercel

const apiKey = process.env.OPENROUTER_API_KEY;
console.log("✅ API Key check:", apiKey ? `Present (starts with ${apiKey.slice(0, 8)}...)` : "MISSING ❌");

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

    // 1. Check Env Vars
    if (!process.env.MONGO_URI) {
        console.error("❌ CRITICAL: MONGO_URI is missing in environment variables!");
        return res.status(500).json({
            success: false,
            message: "Server Configuration Error: MONGO_URI is missing.",
            error: "Missing Environment Variables"
        });
    }

    if (!process.env.JWT_SECRET) {
        console.error("❌ CRITICAL: JWT_SECRET is missing in environment variables!");
        return res.status(500).json({
            success: false,
            message: "Server Configuration Error: JWT_SECRET is missing.",
            error: "Missing Environment Variables"
        });
    }

    // 2. Connect to DB
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
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
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
app.use("/api/history", historyRoutes);
app.use("/api/resume", resumeRoutes);

// ======================
//  Serve Frontend Build (PRODUCTION ONLY)
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In production, the backend is in dist/, so we go up two levels to find frontend/dist
const frontendPath = path.join(__dirname, "../../frontend/dist");

console.log("📂 Serving frontend from:", frontendPath);

app.use(express.static(frontendPath));

// Catch-all → Send React index.html for any request that isn't an API call
app.get("*", (req, res) => {
    // Check if file exists, useful for debugging 404s
    const indexPath = path.join(frontendPath, "index.html");
    if (!res.headersSent) {
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error("❌ Could not serve index.html:", err);
                res.status(500).send("Server Error: Frontend not found.");
            }
        });
    }
});

export default app;
