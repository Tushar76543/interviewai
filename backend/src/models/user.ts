import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name?: string;
  email: string;
  passwordHash: string;
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
    passwordHash: { type: String, required: true },
    rolePreferences: { type: [String], default: [] },
    interviewHistory: { type: [String], default: [] },
  },
  { timestamps: true }
);

UserSchema.pre("save", function normalizeUser(next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  next();
});

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
