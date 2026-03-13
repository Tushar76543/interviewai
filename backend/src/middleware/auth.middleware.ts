import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import User from "../models/user.js";
import { isTokenRevoked } from "../lib/authRuntimeStore.js";

const extractToken = (req: Request) => {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

  return (req.cookies?.token || bearerToken).trim();
};

const decodeAccessToken = (token: string) => {
  const jwtSecret = (process.env.JWT_SECRET ?? "").trim();
  if (!jwtSecret) {
    throw new Error("Server configuration error");
  }

  const decoded = jwt.verify(token, jwtSecret, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;

  const userId = typeof decoded.id === "string" ? decoded.id : "";
  if (!userId) {
    throw new Error("Invalid token payload");
  }

  const tokenType = typeof decoded.type === "string" ? decoded.type : "";
  if (tokenType && tokenType !== "access") {
    throw new Error("Invalid token type");
  }

  return {
    userId,
    jti: typeof decoded.jti === "string" ? decoded.jti : "",
  };
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = decodeAccessToken(token);
    if (decoded.jti && (await isTokenRevoked(decoded.jti))) {
      return res.status(401).json({ message: "Token has been revoked" });
    }

    const user = await User.findById(decoded.userId).select(
      "-passwordHash -passwordHistory -passwordResetTokenHash -passwordResetExpiresAt"
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    (req as Request & { user: typeof user }).user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

