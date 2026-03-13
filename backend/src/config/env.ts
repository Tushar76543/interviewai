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
  redisKeyPrefix: string;
  redisMemoryPolicy: string;
  redisPersistenceMode: string;
  metricsApiKey: string;
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

const parseVercelOrigins = () =>
  [
    process.env.VERCEL_URL ?? "",
    process.env.VERCEL_BRANCH_URL ?? "",
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "",
  ]
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

const readEnv = (key: string) => (process.env[key] ?? "").trim();

const isOriginAllowedForRuntime = (origin: string, isProduction: boolean) =>
  !origin || !isProduction || origin.startsWith("https://");

const isUrlAllowedForRuntime = (value: string, isProduction: boolean) => {
  if (!value || !isProduction) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

let cachedConfig: EnvConfig | null = null;

export const getEnvConfig = (): EnvConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = asRuntimeEnvironment((process.env.NODE_ENV ?? "development").trim().toLowerCase());
  const isProduction = nodeEnv === "production";

  const mongoUri = readEnv("MONGO_URI");
  const jwtSecret = readEnv("JWT_SECRET");
  const openRouterApiKey = readEnv("OPENROUTER_API_KEY");

  if (jwtSecret && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    console.warn(`JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  const frontendOriginCandidate = normalizeOrigin(readEnv("FRONTEND_URL"));
  const vercelOrigins = parseVercelOrigins();
  const allowedCorsOrigins = Array.from(
    new Set([
      frontendOriginCandidate,
      ...parseOrigins(process.env.CORS_ORIGINS ?? ""),
      ...vercelOrigins,
    ].filter((origin) => isOriginAllowedForRuntime(origin, isProduction)))
  );

  const frontendOrigin =
    frontendOriginCandidate && allowedCorsOrigins.includes(frontendOriginCandidate)
      ? frontendOriginCandidate
      : "";

  const redisRestUrlCandidate = readEnv("REDIS_REST_URL");
  const redisRestTokenCandidate = readEnv("REDIS_REST_TOKEN");
  const redisPairProvided = Boolean(redisRestUrlCandidate && redisRestTokenCandidate);
  const redisPairAllowed = redisPairProvided && isUrlAllowedForRuntime(redisRestUrlCandidate, isProduction);

  const redisRestUrl = redisPairAllowed ? redisRestUrlCandidate : "";
  const redisRestToken = redisPairAllowed ? redisRestTokenCandidate : "";
  const redisKeyPrefixCandidate = readEnv("REDIS_KEY_PREFIX").replace(/[:\s]+$/g, "");
  const redisKeyPrefix = redisKeyPrefixCandidate || "ip";

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
    redisKeyPrefix,
    redisMemoryPolicy: readEnv("REDIS_MEMORY_POLICY") || "allkeys-lfu",
    redisPersistenceMode: readEnv("REDIS_PERSISTENCE_MODE") || "cache-only",
    metricsApiKey: readEnv("METRICS_API_KEY"),
  };

  return cachedConfig;
};
