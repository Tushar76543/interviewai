import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
const SALT_ROUNDS = 12;
const TOKEN_TTL = "7d";
const normalizeEmail = (email) => email.trim().toLowerCase();
export class AuthService {
    static async signup(name, email, password) {
        const normalizedEmail = normalizeEmail(email);
        const exists = await User.findOne({ email: normalizedEmail });
        if (exists)
            throw new Error("User already exists");
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
        });
        return this.generateToken(user._id.toString());
    }
    static async login(email, password) {
        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user)
            throw new Error("Invalid email or password");
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            throw new Error("Invalid email or password");
        return this.generateToken(user._id.toString());
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
