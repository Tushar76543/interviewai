import mongoose from "mongoose";
import FeedbackJob from "../models/feedbackJob.js";
import InterviewSession from "../models/interviewSession.js";
import { getRuntimeStore } from "../lib/runtimeStore.js";
import { getEnvConfig } from "../config/env.js";
import { generateFeedback, generateHeuristicFeedback, } from "./feedback.service.js";
const JOB_PROCESS_STALE_MS = 30000;
const JOB_PROVIDER_TIMEOUT_MS = 5200;
const { redisKeyPrefix } = getEnvConfig();
const JOB_QUEUE_NAMESPACE = `${redisKeyPrefix}:queue:feedback`;
const JOB_QUEUE_READY_KEY = `${JOB_QUEUE_NAMESPACE}:ready`;
const JOB_QUEUE_RETRY_KEY = `${JOB_QUEUE_NAMESPACE}:retry`;
const JOB_QUEUE_DLQ_KEY = `${JOB_QUEUE_NAMESPACE}:dead`;
const JOB_QUEUE_MARKER_PREFIX = `${JOB_QUEUE_NAMESPACE}:marker`;
const JOB_QUEUE_POLL_MS = 750;
const JOB_QUEUE_MAX_RETRIES = 3;
const JOB_QUEUE_RETRY_BASE_MS = 2000;
const JOB_QUEUE_KEY_TTL_SEC = 60 * 60 * 24;
const JOB_QUEUE_MARKER_TTL_SEC = 60 * 30;
const normalizedText = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
const runtimeStore = getRuntimeStore();
let queueWorkerTimer = null;
let queueWorkerActive = false;
const parseQueuePayload = (value) => {
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed.jobId !== "string" ||
            typeof parsed.userId !== "string" ||
            typeof parsed.attempt !== "number") {
            return null;
        }
        return {
            jobId: parsed.jobId,
            userId: parsed.userId,
            attempt: Math.max(0, Math.trunc(parsed.attempt)),
            queuedAt: typeof parsed.queuedAt === "number" && Number.isFinite(parsed.queuedAt)
                ? Math.trunc(parsed.queuedAt)
                : Date.now(),
        };
    }
    catch {
        return null;
    }
};
const getQueueMarkerKey = (jobId) => `${JOB_QUEUE_MARKER_PREFIX}:${jobId}`;
const enqueueQueuePayload = async (payload) => {
    await runtimeStore.rpush(JOB_QUEUE_READY_KEY, JSON.stringify(payload));
    await runtimeStore.expire(JOB_QUEUE_READY_KEY, JOB_QUEUE_KEY_TTL_SEC);
};
const moveDueRetryJobsToReady = async () => {
    const now = Date.now();
    const due = await runtimeStore.zrangeByScore(JOB_QUEUE_RETRY_KEY, now, 20);
    if (due.length === 0) {
        return;
    }
    for (const raw of due) {
        await runtimeStore.zrem(JOB_QUEUE_RETRY_KEY, raw);
        await runtimeStore.rpush(JOB_QUEUE_READY_KEY, raw);
    }
    await runtimeStore.expire(JOB_QUEUE_READY_KEY, JOB_QUEUE_KEY_TTL_SEC);
};
const queueRetry = async (payload) => {
    const nextAttempt = payload.attempt + 1;
    const backoffMs = JOB_QUEUE_RETRY_BASE_MS * Math.max(1, 2 ** payload.attempt);
    const jitterMs = Math.floor(Math.random() * 300);
    const nextRunAt = Date.now() + backoffMs + jitterMs;
    await runtimeStore.zadd(JOB_QUEUE_RETRY_KEY, nextRunAt, JSON.stringify({
        ...payload,
        attempt: nextAttempt,
        queuedAt: Date.now(),
    }));
    await runtimeStore.expire(JOB_QUEUE_RETRY_KEY, JOB_QUEUE_KEY_TTL_SEC);
    await runtimeStore.expire(getQueueMarkerKey(payload.jobId), JOB_QUEUE_MARKER_TTL_SEC);
};
const queueDeadLetter = async (payload, reason) => {
    const deadPayload = {
        ...payload,
        reason,
        failedAt: Date.now(),
    };
    await runtimeStore.rpush(JOB_QUEUE_DLQ_KEY, JSON.stringify(deadPayload));
    await runtimeStore.expire(JOB_QUEUE_DLQ_KEY, JOB_QUEUE_KEY_TTL_SEC);
};
const markJobFailed = async (jobId, userId, reason) => {
    await FeedbackJob.findOneAndUpdate({ _id: jobId, userId }, {
        status: "failed",
        lastError: reason.slice(0, 280),
        $unset: { processingStartedAt: 1 },
    });
};
const enqueueFeedbackJob = async (params) => {
    const { jobId, userId, force = false } = params;
    const attempt = Math.max(0, Math.trunc(params.attempt ?? 0));
    if (!mongoose.isValidObjectId(jobId)) {
        return false;
    }
    ensureQueueWorkerRunning();
    const markerKey = getQueueMarkerKey(jobId);
    const acquired = await runtimeStore.setNxEx(markerKey, "1", JOB_QUEUE_MARKER_TTL_SEC);
    if (!acquired && !force) {
        return false;
    }
    if (!acquired && force) {
        await runtimeStore.expire(markerKey, JOB_QUEUE_MARKER_TTL_SEC);
    }
    await enqueueQueuePayload({
        jobId,
        userId,
        attempt,
        queuedAt: Date.now(),
    });
    return true;
};
const processQueuePayload = async (payload) => {
    try {
        const result = await processFeedbackJob(payload.jobId, payload.userId);
        if (result?.status === "completed" || result?.status === "failed") {
            await runtimeStore.del(getQueueMarkerKey(payload.jobId));
            return;
        }
        if (payload.attempt >= JOB_QUEUE_MAX_RETRIES) {
            await queueDeadLetter(payload, "max_retries_exceeded");
            await markJobFailed(payload.jobId, payload.userId, "max_retries_exceeded");
            await runtimeStore.del(getQueueMarkerKey(payload.jobId));
            return;
        }
        await queueRetry(payload);
    }
    catch (error) {
        if (payload.attempt >= JOB_QUEUE_MAX_RETRIES) {
            const reason = error instanceof Error ? error.message : "processing_failed";
            await queueDeadLetter(payload, reason.slice(0, 280));
            await markJobFailed(payload.jobId, payload.userId, reason);
            await runtimeStore.del(getQueueMarkerKey(payload.jobId));
            return;
        }
        await queueRetry(payload);
    }
};
const runQueueWorkerTick = async () => {
    if (queueWorkerActive) {
        return;
    }
    queueWorkerActive = true;
    try {
        await moveDueRetryJobsToReady();
        const rawPayload = await runtimeStore.lpop(JOB_QUEUE_READY_KEY);
        if (!rawPayload) {
            return;
        }
        const payload = parseQueuePayload(rawPayload);
        if (!payload) {
            return;
        }
        await processQueuePayload(payload);
    }
    finally {
        queueWorkerActive = false;
    }
};
const ensureQueueWorkerRunning = () => {
    if (queueWorkerTimer) {
        return;
    }
    queueWorkerTimer = setInterval(() => {
        void runQueueWorkerTick();
    }, JOB_QUEUE_POLL_MS);
    queueWorkerTimer.unref();
};
const resolveTargetQuestionIndex = (questions, question, preferredIndex) => {
    const normalizedQuestion = normalizedText(question);
    if (typeof preferredIndex === "number" &&
        preferredIndex >= 0 &&
        preferredIndex < questions.length &&
        normalizedText(questions[preferredIndex].question) === normalizedQuestion) {
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
export const persistFeedbackToSession = async ({ userId, sessionId, sessionQuestionIndex, question, answer, speechTranscript, answerDurationSec, cameraSnapshot, result, }) => {
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
    const sanitizedAnswer = typeof answer === "string" ? answer.trim() : "";
    if (!sanitizedAnswer) {
        return;
    }
    const targetIndex = resolveTargetQuestionIndex(session.questions, question, sessionQuestionIndex);
    const targetEntry = session.questions[targetIndex];
    targetEntry.answer = sanitizedAnswer;
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
        const alreadyExists = nextQuestion && normalizedText(nextQuestion.question) === normalizedFollowUp;
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
const resolveSessionQuestionIndex = async (params) => {
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
    if (Number.isInteger(params.sessionQuestionIndex) &&
        typeof params.sessionQuestionIndex === "number" &&
        params.sessionQuestionIndex >= 0 &&
        params.sessionQuestionIndex < session.questions.length) {
        const preferredEntry = session.questions[params.sessionQuestionIndex];
        if (normalizedText(preferredEntry.question) === normalizedText(params.question)) {
            return params.sessionQuestionIndex;
        }
    }
    return resolveTargetQuestionIndex(session.questions, params.question);
};
export const createFeedbackJob = async (params) => {
    const provisional = generateHeuristicFeedback(params.role, params.question, params.answer, params.expectedPoints);
    const sessionQuestionIndex = await resolveSessionQuestionIndex({
        userId: params.userId,
        sessionId: params.sessionId,
        question: params.question,
        sessionQuestionIndex: params.sessionQuestionIndex,
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
const claimFeedbackJob = async (jobId, userId) => {
    const staleBefore = new Date(Date.now() - JOB_PROCESS_STALE_MS);
    return FeedbackJob.findOneAndUpdate({
        _id: jobId,
        userId,
        $or: [
            { status: "pending" },
            { status: "processing", processingStartedAt: { $lt: staleBefore } },
        ],
    }, {
        status: "processing",
        processingStartedAt: new Date(),
        $inc: { attempts: 1 },
        $set: { lastError: "" },
    }, { new: true });
};
export const processFeedbackJob = async (jobId, userId) => {
    if (!mongoose.isValidObjectId(jobId)) {
        return null;
    }
    const claimedJob = await claimFeedbackJob(jobId, userId);
    if (!claimedJob) {
        return FeedbackJob.findOne({ _id: jobId, userId });
    }
    const fallbackResult = {
        feedback: claimedJob.provisionalFeedback ||
            generateHeuristicFeedback(claimedJob.role, claimedJob.question, claimedJob.answer, claimedJob.expectedPoints).feedback,
        followUp: claimedJob.provisionalFollowUp ||
            generateHeuristicFeedback(claimedJob.role, claimedJob.question, claimedJob.answer, claimedJob.expectedPoints).followUp,
        source: "heuristic",
    };
    try {
        const result = await generateFeedback(claimedJob.role, claimedJob.question, claimedJob.answer, claimedJob.expectedPoints, { providerTimeoutMs: JOB_PROVIDER_TIMEOUT_MS });
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
        return FeedbackJob.findOneAndUpdate({ _id: jobId, userId }, {
            status: "completed",
            result,
            lastError: "",
            $unset: { processingStartedAt: 1 },
        }, { new: true });
    }
    catch (error) {
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
        return FeedbackJob.findOneAndUpdate({ _id: jobId, userId }, {
            status: "completed",
            result: fallbackResult,
            lastError: errorMessage.slice(0, 280),
            $unset: { processingStartedAt: 1 },
        }, { new: true });
    }
};
export const getFeedbackJob = async (jobId, userId) => {
    if (!mongoose.isValidObjectId(jobId)) {
        return null;
    }
    return FeedbackJob.findOne({
        _id: jobId,
        userId,
    });
};
export const getFeedbackJobStatus = async (jobId, userId) => {
    ensureQueueWorkerRunning();
    const job = await getFeedbackJob(jobId, userId);
    if (!job) {
        return null;
    }
    if (job.status === "pending") {
        await enqueueFeedbackJob({
            jobId,
            userId,
            attempt: job.attempts,
            force: true,
        });
        return job;
    }
    if (job.status === "processing") {
        const startedAt = job.processingStartedAt?.getTime() ?? 0;
        if (!startedAt || Date.now() - startedAt > JOB_PROCESS_STALE_MS) {
            await enqueueFeedbackJob({
                jobId,
                userId,
                attempt: job.attempts,
                force: true,
            });
        }
    }
    return job;
};
export const startFeedbackJobProcessing = (jobId, userId) => {
    void enqueueFeedbackJob({ jobId, userId });
};
export const startFeedbackQueueWorker = () => {
    ensureQueueWorkerRunning();
};
export const mapJobToApiResponse = (job) => {
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
    if (job.status === "failed") {
        return {
            ...base,
            lastError: job.lastError || "Evaluation failed",
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
