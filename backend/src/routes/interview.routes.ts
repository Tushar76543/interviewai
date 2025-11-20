import { Router, Request, Response } from "express";
import { generateQuestion } from "../services/openai.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * 🔐 Protected route — only logged-in users can start interview
 */
router.post(
  "/start",
  authMiddleware,
  async (req: Request, res: Response) => {
    console.log("🔹 POST /api/interview/start called");
    console.log("🔹 Body:", req.body);
    try {
      const { role, difficulty, previousQuestions } = req.body;

      const question = await generateQuestion(role, difficulty, previousQuestions);

      res.json({ question });
    } catch (error: any) {
      console.error("❌ Error in /start route:", error);
      res.status(500).json({
        error: error.message || "Failed to generate question.",
      });
    }
  }
);

export default router;
