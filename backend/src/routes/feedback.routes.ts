import express from "express";
import { generateFeedback } from "../services/feedback.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  feedbackValidation,
  handleValidationErrors,
} from "../middleware/validation.middleware.js";
import InterviewSession from "../models/interviewSession.js";
import { feedbackRateLimit } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  feedbackRateLimit,
  ...feedbackValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = (req as express.Request & { user: { _id: string } }).user;
      const {
        role,
        question,
        answer,
        expectedPoints,
        speechTranscript,
        answerDurationSec,
        cameraSnapshot,
        sessionId,
      } = req.body;

      const result = await generateFeedback(
        role,
        question,
        answer,
        Array.isArray(expectedPoints) ? expectedPoints : []
      );

      if (sessionId) {
        const session = await InterviewSession.findOne({
          _id: sessionId,
          userId: user._id,
        });

        if (session && session.questions.length > 0) {
          const lastIdx = session.questions.length - 1;
          session.questions[lastIdx].answer = answer;
          session.questions[lastIdx].feedback = result.feedback;

          if (typeof speechTranscript === "string" && speechTranscript.trim()) {
            session.questions[lastIdx].speechTranscript = speechTranscript.trim().slice(0, 5000);
          }

          if (typeof answerDurationSec === "number" && Number.isFinite(answerDurationSec)) {
            session.questions[lastIdx].answerDurationSec = Math.max(0, Math.min(7200, Math.round(answerDurationSec)));
          }

          if (typeof cameraSnapshot === "string" && cameraSnapshot.startsWith("data:image/")) {
            session.questions[lastIdx].cameraSnapshot = cameraSnapshot.slice(0, 450000);
          }

          if (result.followUp?.prompt) {
            const followUpCategory = session.questions[lastIdx].category;
            session.questions.push({
              question: result.followUp.prompt,
              answer: "",
              category: followUpCategory,
            });
          }

          session.lastActivityAt = new Date();
          await session.save();
        }
      }

      return res.json(result);
    } catch {
      return res.status(500).json({
        success: false,
        message: "Failed to generate feedback",
      });
    }
  }
);

export default router;
