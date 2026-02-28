import { Request, RequestHandler } from "express";
import { getRateLimitStore } from "../lib/rateLimitStore.js";

type RateLimiterOptions = {
  bucket: string;
  windowMs: number;
  max: number;
  message: string;
};

const rateLimitStore = getRateLimitStore();

const getClientKey = (req: Request) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwarded = typeof forwardedValue === "string" ? forwardedValue.split(",")[0].trim() : "";
  return forwarded || req.ip || "unknown";
};

export const createRateLimiter = ({ bucket, windowMs, max, message }: RateLimiterOptions): RequestHandler => {
  return async (req, res, next) => {
    try {
      const result = await rateLimitStore.consume({
        bucket,
        key: getClientKey(req),
        windowMs,
        max,
      });

      res.setHeader("X-RateLimit-Limit", max.toString());
      res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

      if (result.limited) {
        res.setHeader("Retry-After", result.retryAfterSec.toString());
        return res.status(429).json({
          success: false,
          message,
        });
      }

      next();
    } catch (error) {
      // Fail open if the store is unavailable to avoid turning transient infra issues into full outages.
      if (process.env.NODE_ENV !== "production") {
        console.error("Rate limiter fallback (store unavailable):", error);
      }
      next();
    }
  };
};

export const authRateLimit = createRateLimiter({
  bucket: "rl:auth",
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts. Try again later.",
});

export const interviewRateLimit = createRateLimiter({
  bucket: "rl:interview",
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many interview requests. Please slow down.",
});

export const feedbackRateLimit = createRateLimiter({
  bucket: "rl:feedback",
  windowMs: 60 * 1000,
  max: 25,
  message: "Too many feedback requests. Please slow down.",
});

export const resumeRateLimit = createRateLimiter({
  bucket: "rl:resume",
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many resume upload attempts. Please wait and try again.",
});
