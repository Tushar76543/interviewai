import mongoose, { Schema, Document } from "mongoose";

export interface IQAEntry {
  question: string;
  answer: string;
  category?: string;
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  recordingFileId?: string;
  recordingMimeType?: string;
  recordingSizeBytes?: number;
  feedback?: {
    technical: number;
    clarity: number;
    completeness: number;
    overall?: number;
    suggestion: string;
    strengths?: string[];
    improvements?: string[];
  };
}

export interface IInterviewSession extends Document {
  userId: mongoose.Types.ObjectId;
  role: string;
  difficulty: string;
  questions: IQAEntry[];
  startedAt: Date;
  lastActivityAt: Date;
}

const QAEntrySchema = new Schema<IQAEntry>(
  {
    question: { type: String, required: true },
    answer: { type: String, default: "" },
    category: { type: String },
    speechTranscript: { type: String, maxlength: 5000 },
    answerDurationSec: { type: Number, min: 0, max: 7200 },
    cameraSnapshot: { type: String, maxlength: 450000 },
    recordingFileId: { type: String },
    recordingMimeType: { type: String },
    recordingSizeBytes: { type: Number, min: 0 },
    feedback: {
      technical: Number,
      clarity: Number,
      completeness: Number,
      overall: Number,
      suggestion: String,
      strengths: [String],
      improvements: [String],
    },
  },
  { _id: false }
);

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    difficulty: { type: String, required: true },
    questions: { type: [QAEntrySchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

InterviewSessionSchema.index({ userId: 1, lastActivityAt: -1 });

export default mongoose.models.InterviewSession || mongoose.model<IInterviewSession>(
  "InterviewSession",
  InterviewSessionSchema
);
