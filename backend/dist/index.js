import dotenv from "dotenv";
import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import mongoose from "mongoose";
// Routes
import interviewRoutes from "./routes/interview.routes";
import feedbackRoutes from "./routes/feedback.routes";
import authRoutes from "./routes/auth.routes"; // ✅ NEW
// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
console.log("✅ Loaded key prefix:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");
const app = express();
const PORT = process.env.PORT || 5000;
// ======================
//  MongoDB Connection
// ======================
mongoose
    .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
    .then(() => console.log("🍃 MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB Error:", err));
// ======================
//  Middleware
// ======================
app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        process.env.FRONTEND_URL
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
}));
app.use(cookieParser()); // <-- handles JWT cookies
app.use(bodyParser.json());
app.use(express.json());
// ======================
//  Routes
// ======================
app.use("/api/auth", authRoutes); // <-- LOGIN / SIGNUP / LOGOUT
app.use("/api/interview", interviewRoutes);
app.use("/api/interview/feedback", feedbackRoutes);
// Test Route
app.get("/", (req, res) => {
    res.send("AI Interview Coach backend is running 🚀");
});
// ======================
//  Start Server
// ======================
app.listen(PORT, () => {
    console.log(`🚀 Server running at: http://localhost:${PORT}`);
});
