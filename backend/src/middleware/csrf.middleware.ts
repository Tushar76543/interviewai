import crypto from "crypto";
import type { CookieOptions, RequestHandler } from "express";

const isProduction = process.env.NODE_ENV === "production";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const CSRF_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24,
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const generateToken = () => crypto.randomBytes(32).toString("hex");

const ensureTokenCookie = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => {
  const existing = req.cookies?.[CSRF_COOKIE_NAME];

  if (typeof existing === "string" && existing.length >= 32) {
    return existing;
  }

  const token = generateToken();
  res.cookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
  return token;
};

export const csrfCookieMiddleware: RequestHandler = (req, res, next) => {
  ensureTokenCookie(req, res);
  next();
};

export const requireCsrfProtection: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const cookieToken = ensureTokenCookie(req, res);
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({
      success: false,
      message: "Invalid CSRF token",
    });
    return;
  }

  next();
};

export const issueCsrfToken: RequestHandler = (req, res) => {
  const token = ensureTokenCookie(req, res);

  res.status(200).json({
    success: true,
    csrfToken: token,
  });
};
