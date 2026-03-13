import express from "express";
import mongoose from "mongoose";
import { generateFeedback } from "../services/feedback.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  feedbackValidation,
  handleValidationErrors,
} from "../middleware/validation.middleware.js";
import {
  feedbackPollRateLimit,
  feedbackRateLimit,
} from "../middleware/rateLimit.middleware.js";
import {
  createFeedbackJob,
  getFeedbackJobStatus,
  mapJobToApiResponse,
  persistFeedbackToSession,
  startFeedbackJobProcessing,
} from "../services/feedbackJob.service.js";

const router = express.Router();

type FeedbackRequestBody = {
  role: string;
  question: string;
  answer: string;
  expectedPoints?: string[];
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  sessionId?: string;
  sessionQuestionIndex?: number;
};

const getUserId = (req: express.Request) =>
  (req as express.Request & { user: { _id: string } }).user._id;

const parseExpectedPoints = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

router.post(
  "/",
  authMiddleware,
  feedbackRateLimit,
  ...feedbackValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        role,
        question,
        answer,
        expectedPoints,
        speechTranscript,
        answerDurationSec,
        cameraSnapshot,
        sessionId,
        sessionQuestionIndex,
      } = req.body as FeedbackRequestBody;

      const trimmedAnswer = typeof answer === "string" ? answer.trim() : "";
      if (!trimmedAnswer) {
        return res.status(400).json({
          success: false,
          message: "Answer cannot be empty",
        });
      }

      const result = await generateFeedback(
        role,
        question,
        trimmedAnswer,
        parseExpectedPoints(expectedPoints),
        { providerTimeoutMs: 5200 }
      );

      await persistFeedbackToSession({
        userId,
        sessionId,
        sessionQuestionIndex,
        question,
        answer: trimmedAnswer,
        speechTranscript,
        answerDurationSec,
        cameraSnapshot,
        result,
      });

      return res.json(result);
    } catch {
      return res.status(500).json({
        success: false,
        message: "Failed to generate feedback",
      });
    }
  }
);

router.post(
  "/jobs",
  authMiddleware,
  feedbackRateLimit,
  ...feedbackValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        role,
        question,
        answer,
        expectedPoints,
        speechTranscript,
        answerDurationSec,
        cameraSnapshot,
        sessionId,
        sessionQuestionIndex,
      } = req.body as FeedbackRequestBody;

      const trimmedAnswer = typeof answer === "string" ? answer.trim() : "";
      if (!trimmedAnswer) {
        return res.status(400).json({
          success: false,
          message: "Answer cannot be empty",
        });
      }

      const { job, provisional } = await createFeedbackJob({
        userId,
        role,
        question,
        answer: trimmedAnswer,
        expectedPoints: parseExpectedPoints(expectedPoints),
        speechTranscript,
        answerDurationSec,
        cameraSnapshot,
        sessionId,
        sessionQuestionIndex,
      });

      startFeedbackJobProcessing(job.id, userId);

      return res.status(202).json({
        success: true,
        jobId: job.id,
        status: job.status,
        pollAfterMs: 1200,
        provisionalFeedback: provisional.feedback,
        provisionalFollowUp: provisional.followUp,
      });
    } catch {
      return res.status(500).json({
        success: false,
        message: "Failed to start feedback evaluation job",
      });
    }
  }
);

router.get("/jobs/:jobId", authMiddleware, feedbackPollRateLimit, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { jobId } = req.params;

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid evaluation job id",
      });
    }

    const job = await getFeedbackJobStatus(jobId, userId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Evaluation job not found",
      });
    }

    return res.json(mapJobToApiResponse(job));
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch evaluation job status",
    });
  }
});

export default router;
