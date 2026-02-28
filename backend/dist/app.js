import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import interviewRoutes from "./routes/interview.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import authRoutes from "./routes/auth.routes.js";
import historyRoutes from "./routes/history.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import dbConnect from "./lib/db.js";
import { csrfCookieMiddleware, requireCsrfProtection } from "./middleware/csrf.middleware.js";
dotenv.config();
const app = express();
const isProduction = process.env.NODE_ENV === "production";
const normalizeOrigin = (origin) => {
    const trimmed = origin.trim();
    if (!trimmed)
        return "";
    try {
        const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
            ? new URL(trimmed)
            : new URL(`https://${trimmed}`);
        return url.origin;
    }
    catch {
        return "";
    }
};
const configuredOrigins = [
    process.env.FRONTEND_URL ?? "",
    ...(process.env.CORS_ORIGINS ?? "").split(","),
]
    .map(normalizeOrigin)
    .filter(Boolean);
const defaultDevOrigins = isProduction ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = new Set([...defaultDevOrigins, ...configuredOrigins]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendCandidates = [
    path.join(process.cwd(), "frontend", "dist"),
    path.join(__dirname, "../../frontend/dist"),
];
const frontendPath = frontendCandidates.find((candidate) => fs.existsSync(candidate));
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    if (isProduction) {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
});
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", csrfCookieMiddleware);
const healthHandler = (_req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        dbState: mongoose.connection.readyState,
    });
};
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);
app.use("/api", requireCsrfProtection);
const requireDb = async (_req, _res, next) => {
    try {
        await dbConnect();
        next();
    }
    catch (error) {
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
app.use("/api/auth", authRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/interview/feedback", feedbackRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api", (_req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found",
    });
});
if (isProduction && frontendPath) {
    app.use(express.static(frontendPath));
    app.get(/^\/(?!api).*/, (_req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
    });
}
app.use((err, _req, res, _next) => {
    if (err instanceof Error && err.message === "Not allowed by CORS") {
        res.status(403).json({
            success: false,
            message: "Origin not allowed",
        });
        return;
    }
    const statusCode = typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof err.status === "number"
        ? err.status
        : 500;
    const message = err instanceof Error && !isProduction ? err.message : "Internal server error";
    res.status(statusCode).json({
        success: false,
        message,
    });
});
export default app;
