import express from "express";
import { generateFeedback } from "../services/feedback.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { feedbackValidation, handleValidationErrors, } from "../middleware/validation.middleware.js";
import InterviewSession from "../models/interviewSession.js";
import { feedbackRateLimit } from "../middleware/rateLimit.middleware.js";
const router = express.Router();
router.post("/", authMiddleware, feedbackRateLimit, ...feedbackValidation, handleValidationErrors, async (req, res) => {
    try {
        const user = req.user;
        const { role, question, answer, sessionId } = req.body;
        const result = await generateFeedback(role, question, answer);
        if (sessionId) {
            const session = await InterviewSession.findOne({
                _id: sessionId,
                userId: user._id,
            });
            if (session && session.questions.length > 0) {
                const lastIdx = session.questions.length - 1;
                session.questions[lastIdx].answer = answer;
                session.questions[lastIdx].feedback = result.feedback;
                if (result.followUp?.prompt) {
                    session.questions.push({
                        question: result.followUp.prompt,
                        answer: "",
                    });
                }
                session.lastActivityAt = new Date();
                await session.save();
            }
        }
        return res.json(result);
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Failed to generate feedback",
        });
    }
});
export default router;
