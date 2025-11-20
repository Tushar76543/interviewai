import { Router } from "express";
import { generateQuestion } from "../services/openai.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
const router = Router();
/**
 * 🔐 Protected route — only logged-in users can start interview
 */
router.post("/start", authMiddleware, async (req, res) => {
    try {
        const { role, difficulty, previousQuestions } = req.body;
        const question = await generateQuestion(role, difficulty, previousQuestions);
        res.json({ question });
    }
    catch (error) {
        res.status(500).json({
            error: error.message || "Failed to generate question.",
        });
    }
});
export default router;
