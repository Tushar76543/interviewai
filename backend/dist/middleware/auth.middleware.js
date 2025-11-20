import jwt from "jsonwebtoken";
import User from "../models/user.js";
export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies?.token ||
            req.headers.authorization?.replace("Bearer ", "");
        console.log("🔹 Auth Middleware - Token present:", !!token);
        if (!token) {
            console.log("❌ No token found in cookies or headers");
            return res.status(401).json({ message: "Not authenticated" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user) {
            console.log("❌ User not found for token");
            return res.status(401).json({ message: "Invalid token" });
        }
        req.user = user;
        console.log("✅ Auth successful for user:", user._id);
        next();
    }
    catch (err) {
        console.error("❌ Auth error:", err);
        return res.status(401).json({ message: "Invalid token" });
    }
};
