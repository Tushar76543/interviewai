import mongoose, { Schema, Document } from "mongoose";

export type AuthProvider = "local" | "google";

export interface IUser extends Document {
  name?: string;
  email: string;
  passwordHash?: string;
  passwordHistory?: string[];
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  authProvider: AuthProvider;
  googleId?: string;
  avatarUrl?: string;
  lastLoginAt?: Date;
  lastLoginFingerprint?: string;
  rolePreferences: string[];
  interviewHistory: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String },
    passwordHistory: { type: [String], default: [] },
    passwordResetTokenHash: { type: String, index: true },
    passwordResetExpiresAt: { type: Date },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
      required: true,
    },
    googleId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    avatarUrl: { type: String, trim: true },
    lastLoginAt: { type: Date },
    lastLoginFingerprint: { type: String },
    rolePreferences: { type: [String], default: [] },
    interviewHistory: { type: [String], default: [] },
  },
  { timestamps: true }
);

UserSchema.pre("save", function normalizeUser(next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }

  if (this.googleId) {
    this.googleId = this.googleId.trim();
  }

  next();
});

UserSchema.index({ lastLoginAt: -1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
