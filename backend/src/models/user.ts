import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name?: string;
  email: string;
  passwordHash: string;
  rolePreferences: string[];
  interviewHistory: any[];
}

const UserSchema = new Schema<IUser>({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  rolePreferences: { type: [String], default: [] },
  interviewHistory: { type: [String], default: [] },
});

export default mongoose.model<IUser>("User", UserSchema);
