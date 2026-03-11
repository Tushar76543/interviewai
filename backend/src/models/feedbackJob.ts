import mongoose, { Document, Schema } from "mongoose";

type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface IFeedbackJob extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  sessionQuestionIndex?: number;
  role: string;
  question: string;
  answer: string;
  expectedPoints: string[];
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  status: JobStatus;
  attempts: number;
  processingStartedAt?: Date;
  lastError?: string;
  provisionalFeedback?: {
    technical: number;
    clarity: number;
    completeness: number;
    overall?: number;
    suggestion: string;
    strengths?: string[];
    improvements?: string[];
  };
  provisionalFollowUp?: {
    qid: string;
    prompt: string;
    expectedPoints: string[];
  } | null;
  result?: {
    feedback: {
      technical: number;
      clarity: number;
      completeness: number;
      overall?: number;
      suggestion: string;
      strengths?: string[];
      improvements?: string[];
    };
    followUp?: {
      qid: string;
      prompt: string;
      expectedPoints: string[];
    } | null;
    source?: "heuristic" | "ai_calibrated";
  };
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const FollowUpSchema = new Schema(
  {
    qid: { type: String, maxlength: 40 },
    prompt: { type: String, maxlength: 1000 },
    expectedPoints: [{ type: String, maxlength: 240 }],
  },
  { _id: false }
);

const FeedbackBreakdownSchema = new Schema(
  {
    technical: { type: Number, min: 0, max: 10 },
    clarity: { type: Number, min: 0, max: 10 },
    completeness: { type: Number, min: 0, max: 10 },
    overall: { type: Number, min: 0, max: 10 },
    suggestion: { type: String, maxlength: 420 },
    strengths: [{ type: String, maxlength: 160 }],
    improvements: [{ type: String, maxlength: 160 }],
  },
  { _id: false }
);

const FeedbackJobSchema = new Schema<IFeedbackJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "InterviewSession" },
    sessionQuestionIndex: { type: Number, min: 0, max: 200 },
    role: { type: String, required: true, maxlength: 80 },
    question: { type: String, required: true, maxlength: 1000 },
    answer: { type: String, required: true, maxlength: 5000 },
    expectedPoints: { type: [String], default: [] },
    speechTranscript: { type: String, maxlength: 5000 },
    answerDurationSec: { type: Number, min: 0, max: 7200 },
    cameraSnapshot: { type: String, maxlength: 450000 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      required: true,
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    processingStartedAt: { type: Date },
    lastError: { type: String, maxlength: 280 },
    provisionalFeedback: { type: FeedbackBreakdownSchema },
    provisionalFollowUp: { type: FollowUpSchema, default: null },
    result: {
      feedback: { type: FeedbackBreakdownSchema },
      followUp: { type: FollowUpSchema, default: null },
      source: { type: String, enum: ["heuristic", "ai_calibrated"] },
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24),
      index: true,
    },
  },
  { timestamps: true }
);

FeedbackJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
FeedbackJobSchema.index({ userId: 1, createdAt: -1 });
FeedbackJobSchema.index({ status: 1, processingStartedAt: 1 });

export default mongoose.models.FeedbackJob || mongoose.model<IFeedbackJob>("FeedbackJob", FeedbackJobSchema);
