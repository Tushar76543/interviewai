import crypto from "crypto";
import { getRuntimeStore } from "./runtimeStore.js";
import { getEnvConfig } from "../config/env.js";

type RefreshSessionRecord = {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  fingerprint: string;
  createdAt: number;
  rotatedAt: number;
};

const { redisKeyPrefix } = getEnvConfig();
const AUTH_NAMESPACE = `${redisKeyPrefix}:auth`;
const REFRESH_SESSION_PREFIX = `${AUTH_NAMESPACE}:refresh`;
const TOKEN_REVOKE_PREFIX = `${AUTH_NAMESPACE}:revoked`;
const SUSPICIOUS_LOGIN_PREFIX = `${AUTH_NAMESPACE}:suspicious`;

const runtimeStore = getRuntimeStore();

const stableHash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const safeText = (value: string) => value.trim().toLowerCase();

const buildRefreshSessionKey = (sessionId: string) => `${REFRESH_SESSION_PREFIX}:${sessionId}`;
const buildRevokedTokenKey = (jti: string) => `${TOKEN_REVOKE_PREFIX}:${jti}`;

const suspiciousIdentityKey = (email: string, ipAddress: string) =>
  `${SUSPICIOUS_LOGIN_PREFIX}:${stableHash(`${safeText(email)}|${safeText(ipAddress)}`)}`;

export const hashAuthToken = (token: string) => stableHash(token.trim());

export const buildLoginFingerprint = (params: {
  userAgent: string;
  ipAddress: string;
}) => stableHash(safeText(params.userAgent) || safeText(params.ipAddress));

export const storeRefreshSession = async (params: {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  fingerprint: string;
  ttlSec: number;
}) => {
  const payload: RefreshSessionRecord = {
    sessionId: params.sessionId,
    userId: params.userId,
    refreshTokenHash: params.refreshTokenHash,
    fingerprint: params.fingerprint,
    createdAt: Date.now(),
    rotatedAt: Date.now(),
  };

  await runtimeStore.setEx(
    buildRefreshSessionKey(params.sessionId),
    JSON.stringify(payload),
    Math.max(60, params.ttlSec)
  );
};

export const getRefreshSession = async (sessionId: string) => {
  const raw = await runtimeStore.get(buildRefreshSessionKey(sessionId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RefreshSessionRecord>;
    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.refreshTokenHash !== "string" ||
      typeof parsed.fingerprint !== "string"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      userId: parsed.userId,
      refreshTokenHash: parsed.refreshTokenHash,
      fingerprint: parsed.fingerprint,
      createdAt:
        typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
      rotatedAt:
        typeof parsed.rotatedAt === "number" && Number.isFinite(parsed.rotatedAt)
          ? parsed.rotatedAt
          : Date.now(),
    } satisfies RefreshSessionRecord;
  } catch {
    return null;
  }
};

export const deleteRefreshSession = async (sessionId: string) => {
  await runtimeStore.del(buildRefreshSessionKey(sessionId));
};

export const revokeTokenByJti = async (params: {
  jti: string;
  ttlSec: number;
  reason: string;
}) => {
  if (!params.jti.trim()) {
    return;
  }

  await runtimeStore.setEx(
    buildRevokedTokenKey(params.jti.trim()),
    params.reason.slice(0, 120) || "revoked",
    Math.max(60, params.ttlSec)
  );
};

export const isTokenRevoked = async (jti: string) => {
  if (!jti.trim()) {
    return false;
  }

  const value = await runtimeStore.get(buildRevokedTokenKey(jti.trim()));
  return Boolean(value);
};

export const incrementSuspiciousLogin = async (params: {
  email: string;
  ipAddress: string;
  ttlSec?: number;
}) => {
  const key = suspiciousIdentityKey(params.email, params.ipAddress);
  return runtimeStore.incrWithTtl(key, Math.max(300, params.ttlSec ?? 3600));
};
