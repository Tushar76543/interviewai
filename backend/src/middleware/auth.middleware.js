import jwt from "jsonwebtoken";
import User from "../models/user";
export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies?.token ||
            req.headers.authorization?.replace("Bearer ", "");
        if (!token)
            return res.status(401).json({ message: "Not authenticated" });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user)
            return res.status(401).json({ message: "Invalid token" });
        req.user = user;
        next();
    }
    catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
