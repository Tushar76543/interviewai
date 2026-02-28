import jwt from "jsonwebtoken";
import User from "../models/user.js";
const extractToken = (req) => {
    const authHeader = req.headers.authorization;
    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";
    return req.cookies?.token || bearerToken;
};
export const authMiddleware = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ message: "Server configuration error" });
        }
        const decoded = jwt.verify(token, jwtSecret);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user) {
            return res.status(401).json({ message: "Invalid token" });
        }
        req.user = user;
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid token" });
    }
};
