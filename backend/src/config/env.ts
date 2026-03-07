import "dotenv/config";

type RuntimeEnvironment = "development" | "test" | "production";

export type EnvConfig = {
  nodeEnv: RuntimeEnvironment;
  isProduction: boolean;
  mongoUri: string;
  jwtSecret: string;
  openRouterApiKey: string;
  frontendOrigin: string;
  allowedCorsOrigins: string[];
  redisRestUrl: string;
  redisRestToken: string;
  redisConfigured: boolean;
};

const MIN_JWT_SECRET_LENGTH = 32;

const asRuntimeEnvironment = (value: string): RuntimeEnvironment => {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
};

export const normalizeOrigin = (origin: string) => {
  const trimmed = origin.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);

    return url.origin;
  } catch {
    return "";
  }
};

const parseOrigins = (value: string) =>
  value
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const assertSecureOriginInProduction = (key: string, origin: string, isProduction: boolean) => {
  if (!origin || !isProduction) {
    return;
  }

  if (!origin.startsWith("https://")) {
    throw new Error(`${key} must use https in production`);
  }
};

const assertSecureUrlInProduction = (key: string, value: string, isProduction: boolean) => {
  if (!value || !isProduction) {
    return;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
};

let cachedConfig: EnvConfig | null = null;

export const getEnvConfig = (): EnvConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = asRuntimeEnvironment((process.env.NODE_ENV ?? "development").trim().toLowerCase());
  const isProduction = nodeEnv === "production";

  const mongoUri = requireEnv("MONGO_URI");
  const jwtSecret = requireEnv("JWT_SECRET");
  const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");

  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  const frontendOrigin = normalizeOrigin(process.env.FRONTEND_URL ?? "");
  if (isProduction && !frontendOrigin) {
    throw new Error("FRONTEND_URL must be configured in production");
  }
  assertSecureOriginInProduction("FRONTEND_URL", frontendOrigin, isProduction);

  const allowedCorsOrigins = Array.from(
    new Set([frontendOrigin, ...parseOrigins(process.env.CORS_ORIGINS ?? "")].filter(Boolean))
  );

  for (const origin of allowedCorsOrigins) {
    assertSecureOriginInProduction("CORS_ORIGINS", origin, isProduction);
  }

  if (isProduction && allowedCorsOrigins.length === 0) {
    throw new Error("At least one CORS origin must be configured in production");
  }

  const redisRestUrl = (process.env.REDIS_REST_URL ?? "").trim();
  const redisRestToken = (process.env.REDIS_REST_TOKEN ?? "").trim();

  if ((redisRestUrl && !redisRestToken) || (!redisRestUrl && redisRestToken)) {
    throw new Error("REDIS_REST_URL and REDIS_REST_TOKEN must be configured together");
  }

  assertSecureUrlInProduction("REDIS_REST_URL", redisRestUrl, isProduction);

  cachedConfig = {
    nodeEnv,
    isProduction,
    mongoUri,
    jwtSecret,
    openRouterApiKey,
    frontendOrigin,
    allowedCorsOrigins,
    redisRestUrl,
    redisRestToken,
    redisConfigured: Boolean(redisRestUrl && redisRestToken),
  };

  return cachedConfig;
};
