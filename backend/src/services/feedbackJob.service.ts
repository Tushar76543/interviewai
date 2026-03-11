import mongoose from "mongoose";
import FeedbackJob, { type IFeedbackJob } from "../models/feedbackJob.js";
import InterviewSession from "../models/interviewSession.js";
import {
  generateFeedback,
  generateHeuristicFeedback,
  type FeedbackPayload,
} from "./feedback.service.js";

type PersistFeedbackParams = {
  userId: string;
  sessionId?: string;
  sessionQuestionIndex?: number;
  question: string;
  answer: string;
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  result: FeedbackPayload;
};

type CreateFeedbackJobParams = {
  userId: string;
  role: string;
  question: string;
  answer: string;
  expectedPoints: string[];
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  sessionId?: string;
};

const JOB_PROCESS_STALE_MS = 30_000;
const JOB_PROVIDER_TIMEOUT_MS = 5_200;

const normalizedText = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const resolveTargetQuestionIndex = (
  questions: Array<{ question: string; answer?: string; feedback?: unknown }>,
  question: string,
  preferredIndex?: number
) => {
  const normalizedQuestion = normalizedText(question);

  if (
    typeof preferredIndex === "number" &&
    preferredIndex >= 0 &&
    preferredIndex < questions.length &&
    normalizedText(questions[preferredIndex].question) === normalizedQuestion
  ) {
    return preferredIndex;
  }

  for (let index = questions.length - 1; index >= 0; index -= 1) {
    if (normalizedText(questions[index].question) !== normalizedQuestion) {
      continue;
    }

    // Prefer unanswered entries to avoid rewriting already-reviewed answers.
    if (!questions[index].answer || !questions[index].feedback) {
      return index;
    }
  }

  for (let index = questions.length - 1; index >= 0; index -= 1) {
    if (normalizedText(questions[index].question) === normalizedQuestion) {
      return index;
    }
  }

  return questions.length - 1;
};

export const persistFeedbackToSession = async ({
  userId,
  sessionId,
  sessionQuestionIndex,
  question,
  answer,
  speechTranscript,
  answerDurationSec,
  cameraSnapshot,
  result,
}: PersistFeedbackParams) => {
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
    return;
  }

  const session = await InterviewSession.findOne({
    _id: sessionId,
    userId,
  });

  if (!session || session.questions.length === 0) {
    return;
  }

  const targetIndex = resolveTargetQuestionIndex(
    session.questions,
    question,
    sessionQuestionIndex
  );
  const targetEntry = session.questions[targetIndex];

  targetEntry.answer = answer;
  targetEntry.feedback = result.feedback;

  if (typeof speechTranscript === "string" && speechTranscript.trim()) {
    targetEntry.speechTranscript = speechTranscript.trim().slice(0, 5000);
  }

  if (typeof answerDurationSec === "number" && Number.isFinite(answerDurationSec)) {
    targetEntry.answerDurationSec = Math.max(0, Math.min(7200, Math.round(answerDurationSec)));
  }

  if (typeof cameraSnapshot === "string" && cameraSnapshot.startsWith("data:image/")) {
    targetEntry.cameraSnapshot = cameraSnapshot.slice(0, 450000);
  }

  if (result.followUp?.prompt && targetIndex === session.questions.length - 1) {
    const nextQuestion = session.questions[targetIndex + 1];
    const normalizedFollowUp = normalizedText(result.followUp.prompt);
    const alreadyExists =
      nextQuestion && normalizedText(nextQuestion.question) === normalizedFollowUp;

    if (!alreadyExists) {
      session.questions.push({
        question: result.followUp.prompt,
        answer: "",
        category: targetEntry.category,
      });
    }
  }

  session.lastActivityAt = new Date();
  await session.save();
};

const resolveSessionQuestionIndex = async (params: {
  userId: string;
  sessionId?: string;
  question: string;
}) => {
  if (!params.sessionId || !mongoose.isValidObjectId(params.sessionId)) {
    return undefined;
  }

  const session = await InterviewSession.findOne({
    _id: params.sessionId,
    userId: params.userId,
  }).select("questions");

  if (!session || session.questions.length === 0) {
    return undefined;
  }

  return resolveTargetQuestionIndex(session.questions, params.question);
};

export const createFeedbackJob = async (params: CreateFeedbackJobParams) => {
  const provisional = generateHeuristicFeedback(
    params.role,
    params.question,
    params.answer,
    params.expectedPoints
  );

  const sessionQuestionIndex = await resolveSessionQuestionIndex({
    userId: params.userId,
    sessionId: params.sessionId,
    question: params.question,
  });

  const job = await FeedbackJob.create({
    userId: params.userId,
    sessionId: params.sessionId && mongoose.isValidObjectId(params.sessionId) ? params.sessionId : undefined,
    sessionQuestionIndex,
    role: params.role,
    question: params.question,
    answer: params.answer,
    expectedPoints: params.expectedPoints,
    speechTranscript: params.speechTranscript,
    answerDurationSec: params.answerDurationSec,
    cameraSnapshot: params.cameraSnapshot,
    status: "pending",
    provisionalFeedback: provisional.feedback,
    provisionalFollowUp: provisional.followUp,
  });

  return {
    job,
    provisional,
  };
};

const claimFeedbackJob = async (jobId: string, userId: string) => {
  const staleBefore = new Date(Date.now() - JOB_PROCESS_STALE_MS);

  return FeedbackJob.findOneAndUpdate(
    {
      _id: jobId,
      userId,
      $or: [
        { status: "pending" },
        { status: "processing", processingStartedAt: { $lt: staleBefore } },
      ],
    },
    {
      status: "processing",
      processingStartedAt: new Date(),
      $inc: { attempts: 1 },
      $set: { lastError: "" },
    },
    { new: true }
  );
};

export const processFeedbackJob = async (jobId: string, userId: string) => {
  if (!mongoose.isValidObjectId(jobId)) {
    return null;
  }

  const claimedJob = await claimFeedbackJob(jobId, userId);
  if (!claimedJob) {
    return FeedbackJob.findOne({ _id: jobId, userId });
  }

  const fallbackResult: FeedbackPayload = {
    feedback:
      claimedJob.provisionalFeedback ||
      generateHeuristicFeedback(
        claimedJob.role,
        claimedJob.question,
        claimedJob.answer,
        claimedJob.expectedPoints
      ).feedback,
    followUp:
      claimedJob.provisionalFollowUp ||
      generateHeuristicFeedback(
        claimedJob.role,
        claimedJob.question,
        claimedJob.answer,
        claimedJob.expectedPoints
      ).followUp,
    source: "heuristic",
  };

  try {
    const result = await generateFeedback(
      claimedJob.role,
      claimedJob.question,
      claimedJob.answer,
      claimedJob.expectedPoints,
      { providerTimeoutMs: JOB_PROVIDER_TIMEOUT_MS }
    );

    await persistFeedbackToSession({
      userId,
      sessionId: claimedJob.sessionId?.toString(),
      sessionQuestionIndex: claimedJob.sessionQuestionIndex,
      question: claimedJob.question,
      answer: claimedJob.answer,
      speechTranscript: claimedJob.speechTranscript,
      answerDurationSec: claimedJob.answerDurationSec,
      cameraSnapshot: claimedJob.cameraSnapshot,
      result,
    });

    return FeedbackJob.findOneAndUpdate(
      { _id: jobId, userId },
      {
        status: "completed",
        result,
        lastError: "",
        $unset: { processingStartedAt: 1 },
      },
      { new: true }
    );
  } catch (error) {
    await persistFeedbackToSession({
      userId,
      sessionId: claimedJob.sessionId?.toString(),
      sessionQuestionIndex: claimedJob.sessionQuestionIndex,
      question: claimedJob.question,
      answer: claimedJob.answer,
      speechTranscript: claimedJob.speechTranscript,
      answerDurationSec: claimedJob.answerDurationSec,
      cameraSnapshot: claimedJob.cameraSnapshot,
      result: fallbackResult,
    });

    const errorMessage = error instanceof Error ? error.message : "Evaluation failed";

    return FeedbackJob.findOneAndUpdate(
      { _id: jobId, userId },
      {
        status: "completed",
        result: fallbackResult,
        lastError: errorMessage.slice(0, 280),
        $unset: { processingStartedAt: 1 },
      },
      { new: true }
    );
  }
};

export const getFeedbackJob = async (jobId: string, userId: string) => {
  if (!mongoose.isValidObjectId(jobId)) {
    return null;
  }

  return FeedbackJob.findOne({
    _id: jobId,
    userId,
  });
};

export const getFeedbackJobStatus = async (jobId: string, userId: string) => {
  const job = await getFeedbackJob(jobId, userId);
  if (!job) {
    return null;
  }

  if (job.status === "pending") {
    return processFeedbackJob(jobId, userId);
  }

  if (job.status === "processing") {
    const startedAt = job.processingStartedAt?.getTime() ?? 0;
    if (!startedAt || Date.now() - startedAt > JOB_PROCESS_STALE_MS) {
      return processFeedbackJob(jobId, userId);
    }
  }

  return job;
};

export const startFeedbackJobProcessing = (jobId: string, userId: string) => {
  setTimeout(() => {
    void processFeedbackJob(jobId, userId);
  }, 0);
};

export const mapJobToApiResponse = (job: IFeedbackJob) => {
  const base = {
    success: true,
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
  };

  if (job.status === "completed" && job.result) {
    return {
      ...base,
      result: job.result,
      completedAt: job.updatedAt,
    };
  }

  return {
    ...base,
    provisionalFeedback: job.provisionalFeedback,
    provisionalFollowUp: job.provisionalFollowUp,
    pollAfterMs: job.status === "processing" ? 900 : 1200,
  };
};
