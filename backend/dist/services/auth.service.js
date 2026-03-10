import axios from "axios";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
const SALT_ROUNDS = 12;
const TOKEN_TTL = "7d";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_VERIFY_TIMEOUT_MS = 7000;
const normalizeEmail = (email) => email.trim().toLowerCase();
const isEmailVerified = (value) => {
    if (typeof value === "boolean")
        return value;
    return typeof value === "string" && value.toLowerCase() === "true";
};
export class AuthService {
    static async signup(name, email, password) {
        const normalizedEmail = normalizeEmail(email);
        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) {
            if (!exists.passwordHash && exists.googleId) {
                throw new Error("Account already exists with Google sign-in. Please continue with Google.");
            }
            throw new Error("User already exists");
        }
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            authProvider: "local",
        });
        return this.generateToken(user._id.toString());
    }
    static async login(email, password) {
        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user)
            throw new Error("Invalid email or password");
        if (!user.passwordHash) {
            throw new Error("This account uses Google sign-in. Continue with Google.");
        }
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            throw new Error("Invalid email or password");
        return this.generateToken(user._id.toString());
    }
    static async loginWithGoogle(credential) {
        const idToken = credential.trim();
        if (!idToken) {
            throw new Error("Google credential is required");
        }
        const profile = await this.verifyGoogleToken(idToken);
        const normalizedEmail = normalizeEmail(profile.email);
        let user = await User.findOne({
            $or: [{ googleId: profile.sub }, { email: normalizedEmail }],
        });
        if (!user) {
            user = await User.create({
                name: profile.name?.trim() || normalizedEmail.split("@")[0],
                email: normalizedEmail,
                authProvider: "google",
                googleId: profile.sub,
                avatarUrl: profile.picture,
            });
        }
        else {
            user.googleId = profile.sub;
            user.avatarUrl = profile.picture || user.avatarUrl;
            if (!user.name && profile.name) {
                user.name = profile.name.trim();
            }
            if (!user.passwordHash) {
                user.authProvider = "google";
            }
            await user.save();
        }
        return this.generateToken(user._id.toString());
    }
    static async verifyGoogleToken(idToken) {
        try {
            const response = await axios.get(GOOGLE_TOKENINFO_ENDPOINT, {
                params: { id_token: idToken },
                timeout: GOOGLE_VERIFY_TIMEOUT_MS,
            });
            const payload = response.data;
            const allowedIssuer = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
            const expectedAudience = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
            const audienceMatches = !expectedAudience || payload.aud === expectedAudience;
            if (!allowedIssuer || !audienceMatches || !payload.sub || !payload.email || !isEmailVerified(payload.email_verified)) {
                throw new Error("Google token validation failed");
            }
            return {
                ...payload,
                sub: payload.sub,
                email: payload.email,
            };
        }
        catch {
            throw new Error("Google authentication failed");
        }
    }
    static generateToken(id) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error("JWT secret is not configured");
        }
        return jwt.sign({ id }, secret, {
            expiresIn: TOKEN_TTL,
            algorithm: "HS256",
        });
    }
    static async getUserFromToken(token) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error("JWT secret is not configured");
        }
        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user)
            throw new Error("User not found");
        return user;
    }
}
