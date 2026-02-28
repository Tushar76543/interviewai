import { Router, Request, Response } from "express";
import { generateQuestion } from "../services/openai.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import InterviewSession from "../models/interviewSession.js";
import {
  interviewStartValidation,
  handleValidationErrors,
} from "../middleware/validation.middleware.js";
import { interviewRateLimit } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post(
  "/start",
  authMiddleware,
  interviewRateLimit,
  ...interviewStartValidation,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const user = (req as Request & { user: { _id: string } }).user;
      const { role, difficulty, previousQuestions, sessionId } = req.body;

      const resolvedRole = role || "Software Engineer";
      const resolvedDifficulty = difficulty || "Medium";
      const prior = Array.isArray(previousQuestions) ? previousQuestions : [];

      const question = await generateQuestion(
        resolvedRole,
        resolvedDifficulty,
        prior
      );

      let session;
      if (sessionId) {
        session = await InterviewSession.findOneAndUpdate(
          { _id: sessionId, userId: user._id },
          {
            $push: {
              questions: { question: question.prompt, answer: "" },
            },
            lastActivityAt: new Date(),
          },
          { new: true }
        );
      } else {
        session = await InterviewSession.create({
          userId: user._id,
          role: resolvedRole,
          difficulty: resolvedDifficulty,
          questions: [{ question: question.prompt, answer: "" }],
        });
      }

      if (!session) {
        return res.status(404).json({
          success: false,
          message: "Session not found",
        });
      }

      return res.json({ question, sessionId: session._id });
    } catch (error) {
      const isProduction = process.env.NODE_ENV === "production";
      const message =
        error instanceof Error && !isProduction
          ? error.message
          : "Failed to generate question";

      return res.status(500).json({
        success: false,
        message,
      });
    }
  }
);

export default router;
