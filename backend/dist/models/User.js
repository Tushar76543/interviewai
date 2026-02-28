import mongoose, { Schema } from "mongoose";
const UserSchema = new Schema({
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
}, { timestamps: true });
UserSchema.pre("save", function normalizeUser(next) {
    if (this.email) {
        this.email = this.email.toLowerCase().trim();
    }
    next();
});
export default mongoose.models.User || mongoose.model("User", UserSchema);
