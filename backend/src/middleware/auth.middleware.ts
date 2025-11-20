import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import User from "../models/user";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.cookies?.token ||
      req.headers.authorization?.replace("Bearer ", "");

    console.log("🔹 Auth Middleware - Token present:", !!token);

    if (!token) {
      console.log("❌ No token found in cookies or headers");
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
    };

    const user = await User.findById(decoded.id).select("-passwordHash");

    if (!user) {
      console.log("❌ User not found for token");
      return res.status(401).json({ message: "Invalid token" });
    }

    (req as any).user = user;
    console.log("✅ Auth successful for user:", user._id);

    next();
  } catch (err) {
    console.error("❌ Auth error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
};

