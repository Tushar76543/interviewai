import mongoose, { Schema } from "mongoose";
const UserSchema = new Schema({
    name: { type: String },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    rolePreferences: { type: [String], default: [] },
    interviewHistory: { type: Array, default: [] },
});
export default mongoose.model("User", UserSchema);
