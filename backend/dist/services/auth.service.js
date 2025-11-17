import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user";
const SALT_ROUNDS = 10;
export class AuthService {
    // ============= SIGNUP =============
    static async signup(name, email, password) {
        const exists = await User.findOne({ email });
        if (exists)
            throw new Error("User already exists");
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
            name,
            email,
            passwordHash,
        });
        return this.generateToken(user._id.toString());
    }
    // ============= LOGIN =============
    static async login(email, password) {
        const user = await User.findOne({ email });
        if (!user)
            throw new Error("Invalid email or password");
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            throw new Error("Invalid email or password");
        return this.generateToken(user._id.toString());
    }
    // ============= GENERATE TOKEN =============
    static generateToken(id) {
        return jwt.sign({ id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });
    }
    // ============= GET USER FROM TOKEN =============
    static async getUserFromToken(token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user)
            throw new Error("User not found");
        return user;
    }
}
