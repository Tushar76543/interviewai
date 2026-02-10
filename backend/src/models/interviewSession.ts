import mongoose, { Schema, Document } from "mongoose";

export interface IQAEntry {
  question: string;
  answer: string;
  feedback?: {
    technical: number;
    clarity: number;
    completeness: number;
    suggestion: string;
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
    feedback: {
      technical: Number,
      clarity: Number,
      completeness: Number,
      suggestion: String,
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

export default mongoose.model<IInterviewSession>(
  "InterviewSession",
  InterviewSessionSchema
);
