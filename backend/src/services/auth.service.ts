import axios from "axios";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import {
  buildLoginFingerprint,
  deleteRefreshSession,
  getRefreshSession,
  hashAuthToken,
  incrementSuspiciousLogin,
  isTokenRevoked,
  revokeTokenByJti,
  storeRefreshSession,
} from "../lib/authRuntimeStore.js";
import { logger } from "../lib/observability.js";

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = ((process.env.JWT_ACCESS_TTL ?? "15m").trim() || "15m") as jwt.SignOptions["expiresIn"];
const REFRESH_TOKEN_TTL = ((process.env.JWT_REFRESH_TTL ?? "14d").trim() || "14d") as jwt.SignOptions["expiresIn"];
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_VERIFY_TIMEOUT_MS = 7000;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;
const MAX_PASSWORD_HISTORY = 5;
const MIN_PASSWORD_LENGTH = 12;
const COMPROMISED_PASSWORD_BLOCKLIST = new Set([
  "password",
  "password123",
  "qwerty123",
  "12345678",
  "letmein123",
  "welcome123",
  "admin1234",
  "passw0rd",
  "iloveyou",
  "abc12345",
]);

type GoogleTokenInfo = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
};

type TokenType = "access" | "refresh";

type AuthTokenClaims = {
  id: string;
  type: TokenType;
  sid: string;
  jti: string;
  iat?: number;
  exp?: number;
};

type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSec: number;
  refreshExpiresInSec: number;
  sessionId: string;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isEmailVerified = (value: GoogleTokenInfo["email_verified"]) => {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.toLowerCase() === "true";
};

const getAccessSecret = () => {
  const secret = (process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("JWT secret is not configured");
  }
  return secret;
};

const getRefreshSecret = () => {
  const candidate = (process.env.JWT_REFRESH_SECRET ?? "").trim();
  return candidate || getAccessSecret();
};

const parseDurationToSeconds = (value: string | number, fallbackSec: number) => {
  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSec;
  }

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallbackSec;
  }

  const unit = match[2];
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  return amount * 86400;
};

const secondsUntilExp = (exp?: number) => {
  if (!exp || !Number.isFinite(exp)) {
    return 60;
  }
  return Math.max(60, Math.floor(exp - Date.now() / 1000));
};

const sanitizeMetadata = (metadata?: RequestMetadata) => ({
  ipAddress: (metadata?.ipAddress ?? "").trim() || "unknown",
  userAgent: (metadata?.userAgent ?? "").trim() || "unknown",
});

const normalizeTokenClaims = (decoded: jwt.JwtPayload, tokenType: TokenType): AuthTokenClaims => {
  const id = typeof decoded.id === "string" ? decoded.id : "";
  if (!id) {
    throw new Error("Token payload is invalid");
  }

  const typeRaw = typeof decoded.type === "string" ? decoded.type : "";
  if (!typeRaw && tokenType === "access") {
    // Backward compatibility for legacy access tokens without rotation metadata.
    return {
      id,
      type: "access",
      sid: "legacy",
      jti: "",
      iat: decoded.iat,
      exp: decoded.exp,
    };
  }

  if (typeRaw !== tokenType) {
    throw new Error("Token type mismatch");
  }

  const sid = typeof decoded.sid === "string" ? decoded.sid : "";
  const jti = typeof decoded.jti === "string" ? decoded.jti : "";
  if (!sid || !jti) {
    throw new Error("Token session metadata is missing");
  }

  return {
    id,
    type: tokenType,
    sid,
    jti,
    iat: decoded.iat,
    exp: decoded.exp,
  };
};

const isBufferEqual = (left: string, right: string) => {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const validateStrongPassword = (password: string) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must include at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    throw new Error("Password must include at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    throw new Error("Password must include at least one number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include at least one special character");
  }

  if (/\s/.test(password)) {
    throw new Error("Password cannot include spaces");
  }

  if (COMPROMISED_PASSWORD_BLOCKLIST.has(password.toLowerCase())) {
    throw new Error("Password is too common. Choose a stronger password");
  }
};

const getPasswordHistory = (user: {
  passwordHash?: string;
  passwordHistory?: string[];
}) => {
  const history = Array.isArray(user.passwordHistory) ? user.passwordHistory : [];
  return [user.passwordHash, ...history]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, MAX_PASSWORD_HISTORY + 1);
};

export class AuthService {
  private static parseToken(token: string, tokenType: TokenType) {
    const secret = tokenType === "refresh" ? getRefreshSecret() : getAccessSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    return normalizeTokenClaims(decoded, tokenType);
  }

  private static async assertPasswordNotReused(user: {
    passwordHash?: string;
    passwordHistory?: string[];
  }, nextPassword: string) {
    for (const hash of getPasswordHistory(user)) {
      // eslint-disable-next-line no-await-in-loop
      const matched = await bcrypt.compare(nextPassword, hash);
      if (matched) {
        throw new Error("Choose a password you have not used recently");
      }
    }
  }

  private static async issueTokens(userId: string, metadata?: RequestMetadata, sessionId?: string) {
    const accessSecret = getAccessSecret();
    const refreshSecret = getRefreshSecret();
    const nextSessionId = sessionId || crypto.randomUUID();
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const accessExpiresInSec = parseDurationToSeconds(ACCESS_TOKEN_TTL ?? "15m", 900);
    const refreshExpiresInSec = parseDurationToSeconds(
      REFRESH_TOKEN_TTL ?? "14d",
      60 * 60 * 24 * 14
    );

    const accessToken = jwt.sign(
      {
        id: userId,
        type: "access",
        sid: nextSessionId,
        jti: accessJti,
      },
      accessSecret,
      {
        expiresIn: ACCESS_TOKEN_TTL,
        algorithm: "HS256",
      }
    );

    const refreshToken = jwt.sign(
      {
        id: userId,
        type: "refresh",
        sid: nextSessionId,
        jti: refreshJti,
      },
      refreshSecret,
      {
        expiresIn: REFRESH_TOKEN_TTL,
        algorithm: "HS256",
      }
    );

    const safeMetadata = sanitizeMetadata(metadata);
    await storeRefreshSession({
      sessionId: nextSessionId,
      userId,
      refreshTokenHash: hashAuthToken(refreshToken),
      fingerprint: buildLoginFingerprint(safeMetadata),
      ttlSec: refreshExpiresInSec,
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresInSec,
      refreshExpiresInSec,
      sessionId: nextSessionId,
    } satisfies AuthTokens;
  }

  private static async markSuccessfulLogin(user: {
    save: () => Promise<unknown>;
    lastLoginAt?: Date;
    lastLoginFingerprint?: string;
  }, metadata?: RequestMetadata) {
    const safeMetadata = sanitizeMetadata(metadata);
    user.lastLoginAt = new Date();
    user.lastLoginFingerprint = buildLoginFingerprint(safeMetadata);
    await user.save();
  }

  static async signup(
    name: string,
    email: string,
    password: string,
    metadata?: RequestMetadata
  ): Promise<AuthTokens> {
    validateStrongPassword(password);

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
      passwordHistory: [],
      authProvider: "local",
    });

    await this.markSuccessfulLogin(user, metadata);
    return this.issueTokens((user as { _id: { toString: () => string } })._id.toString(), metadata);
  }

  static async login(
    email: string,
    password: string,
    metadata?: RequestMetadata
  ): Promise<AuthTokens> {
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw new Error("Invalid email or password");

    if (!user.passwordHash) {
      throw new Error("This account uses Google sign-in. Continue with Google.");
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      const suspiciousCount = await incrementSuspiciousLogin({
        email: normalizedEmail,
        ipAddress: sanitizeMetadata(metadata).ipAddress,
      });

      if (suspiciousCount >= 5) {
        logger.warn("auth.suspicious_login_threshold_reached", {
          email: normalizedEmail,
          suspiciousCount,
        });
      }

      throw new Error("Invalid email or password");
    }

    await this.markSuccessfulLogin(user, metadata);
    return this.issueTokens((user as { _id: { toString: () => string } })._id.toString(), metadata);
  }

  static async loginWithGoogle(credential: string, metadata?: RequestMetadata): Promise<AuthTokens> {
    const idToken = credential.trim();
    if (!idToken) {
      throw new Error("Google credential is required");
    }

    const profile = await this.verifyGoogleToken(idToken);
    const normalizedEmail = normalizeEmail(profile.email!);

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
    } else {
      user.googleId = profile.sub;
      user.avatarUrl = profile.picture || user.avatarUrl;

      if (!user.name && profile.name) {
        user.name = profile.name.trim();
      }

      if (!user.passwordHash) {
        user.authProvider = "google";
      }
    }

    await this.markSuccessfulLogin(user, metadata);
    return this.issueTokens((user as { _id: { toString: () => string } })._id.toString(), metadata);
  }

  static async requestPasswordReset(email: string): Promise<{ resetToken?: string }> {
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return {};
    }

    const resetToken = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
    user.passwordResetTokenHash = hashResetToken(resetToken);
    user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();

    return { resetToken };
  }

  static async resetPassword(
    resetToken: string,
    nextPassword: string,
    metadata?: RequestMetadata
  ): Promise<AuthTokens> {
    validateStrongPassword(nextPassword);

    const tokenHash = hashResetToken(resetToken.trim());
    const now = new Date();

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: now },
    });

    if (!user) {
      throw new Error("Password reset link is invalid or expired");
    }

    await this.assertPasswordNotReused(user, nextPassword);

    const previousHistory = getPasswordHistory(user).slice(0, MAX_PASSWORD_HISTORY);
    user.passwordHash = await bcrypt.hash(nextPassword, SALT_ROUNDS);
    user.passwordHistory = previousHistory;
    user.authProvider = "local";
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await this.markSuccessfulLogin(user, metadata);

    return this.issueTokens((user as { _id: { toString: () => string } })._id.toString(), metadata);
  }

  static async refreshTokens(refreshToken: string, metadata?: RequestMetadata): Promise<AuthTokens> {
    const claims = this.parseToken(refreshToken, "refresh");

    if (await isTokenRevoked(claims.jti)) {
      throw new Error("Session has been revoked");
    }

    const session = await getRefreshSession(claims.sid);
    if (!session || session.userId !== claims.id) {
      throw new Error("Session is invalid or expired");
    }

    const safeMetadata = sanitizeMetadata(metadata);
    const expectedFingerprint = buildLoginFingerprint(safeMetadata);
    if (!isBufferEqual(session.fingerprint, expectedFingerprint)) {
      await incrementSuspiciousLogin({
        email: claims.id,
        ipAddress: safeMetadata.ipAddress,
      });
      throw new Error("Session fingerprint mismatch");
    }

    const providedTokenHash = hashAuthToken(refreshToken);
    if (!isBufferEqual(session.refreshTokenHash, providedTokenHash)) {
      throw new Error("Refresh token mismatch");
    }

    await revokeTokenByJti({
      jti: claims.jti,
      ttlSec: secondsUntilExp(claims.exp),
      reason: "refresh_rotated",
    });

    return this.issueTokens(claims.id, metadata, claims.sid);
  }

  static async logout(tokens: { accessToken?: string; refreshToken?: string }) {
    const accessToken = tokens.accessToken?.trim() ?? "";
    const refreshToken = tokens.refreshToken?.trim() ?? "";

    if (accessToken) {
      try {
        const claims = this.parseToken(accessToken, "access");
        if (claims.jti) {
          await revokeTokenByJti({
            jti: claims.jti,
            ttlSec: secondsUntilExp(claims.exp),
            reason: "logout",
          });
        }
      } catch {
        // Ignore invalid access token during logout.
      }
    }

    if (refreshToken) {
      try {
        const claims = this.parseToken(refreshToken, "refresh");
        await revokeTokenByJti({
          jti: claims.jti,
          ttlSec: secondsUntilExp(claims.exp),
          reason: "logout",
        });
        await deleteRefreshSession(claims.sid);
      } catch {
        // Ignore invalid refresh token during logout.
      }
    }
  }

  private static async verifyGoogleToken(
    idToken: string
  ): Promise<Required<Pick<GoogleTokenInfo, "sub" | "email">> & GoogleTokenInfo> {
    try {
      const response = await axios.get<GoogleTokenInfo>(GOOGLE_TOKENINFO_ENDPOINT, {
        params: { id_token: idToken },
        timeout: GOOGLE_VERIFY_TIMEOUT_MS,
      });

      const payload = response.data;
      const allowedIssuer =
        payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
      const expectedAudience = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
      if (!expectedAudience) {
        throw new Error("Google sign-in is not configured on the server");
      }

      const audienceMatches = payload.aud === expectedAudience;

      if (
        !allowedIssuer ||
        !audienceMatches ||
        !payload.sub ||
        !payload.email ||
        !isEmailVerified(payload.email_verified)
      ) {
        throw new Error("Google token validation failed");
      }

      return {
        ...payload,
        sub: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not configured")) {
        throw new Error("Google sign-in is not configured on the server");
      }
      throw new Error("Google authentication failed");
    }
  }

  static async getUserFromToken(token: string) {
    const claims = this.parseToken(token, "access");
    if (claims.jti && (await isTokenRevoked(claims.jti))) {
      throw new Error("Token has been revoked");
    }

    const user = await User.findById(claims.id).select(
      "-passwordHash -passwordHistory -passwordResetTokenHash -passwordResetExpiresAt"
    );

    if (!user) throw new Error("User not found");

    return user;
  }
}
