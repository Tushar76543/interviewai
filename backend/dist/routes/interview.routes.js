import { Router } from "express";
import { generateQuestion } from "../services/openai.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import InterviewSession from "../models/interviewSession.js";
const router = Router();
/**
 * 🔐 Protected route — only logged-in users can start interview
 */
router.post("/start", authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { role, difficulty, previousQuestions, sessionId } = req.body;
        const question = await generateQuestion(role || "Software Engineer", difficulty || "Medium", previousQuestions || []);
        let session;
        if (sessionId) {
            session = await InterviewSession.findOneAndUpdate({ _id: sessionId, userId: user._id }, {
                $push: {
                    questions: { question: question.prompt, answer: "" },
                },
                lastActivityAt: new Date(),
            }, { new: true });
        }
        else {
            session = await InterviewSession.create({
                userId: user._id,
                role: role || "Software Engineer",
                difficulty: difficulty || "Medium",
                questions: [{ question: question.prompt, answer: "" }],
            });
        }
        if (!session) {
            return res.status(404).json({ error: "Session not found." });
        }
        res.json({ question, sessionId: session._id });
    }
    catch (error) {
        console.error("❌ Error in /start route:", error);
        res.status(500).json({
            error: error.message || "Failed to generate question.",
        });
    }
});
export default router;
