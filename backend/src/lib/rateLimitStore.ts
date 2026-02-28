export type RateLimitConsumeParams = {
  bucket: string;
  key: string;
  windowMs: number;
  max: number;
};

export type RateLimitConsumeResult = {
  count: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
  limited: boolean;
};

export interface RateLimitStore {
  consume(params: RateLimitConsumeParams): Promise<RateLimitConsumeResult>;
}

type Entry = {
  count: number;
  resetAt: number;
};

const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Entry>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 60000) {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.buckets.entries()) {
        if (entry.resetAt <= now) {
          this.buckets.delete(key);
        }
      }
    }, cleanupIntervalMs);

    this.cleanupTimer.unref();
  }

  async consume(params: RateLimitConsumeParams): Promise<RateLimitConsumeResult> {
    const now = Date.now();
    const namespacedKey = `${params.bucket}:${params.key}`;

    const existing = this.buckets.get(namespacedKey);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + params.windowMs;
      this.buckets.set(namespacedKey, { count: 1, resetAt });

      return {
        count: 1,
        remaining: Math.max(0, params.max - 1),
        resetAt,
        retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        limited: false,
      };
    }

    existing.count += 1;

    return {
      count: existing.count,
      remaining: Math.max(0, params.max - existing.count),
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      limited: existing.count > params.max,
    };
  }
}

export class UpstashRedisRateLimitStore implements RateLimitStore {
  private readonly endpoint: string;
  private readonly token: string;

  constructor(endpoint: string, token: string) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.token = token;
  }

  async consume(params: RateLimitConsumeParams): Promise<RateLimitConsumeResult> {
    const now = Date.now();
    const key = `${params.bucket}:${params.key}`;

    const response = await fetch(`${this.endpoint}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, `${params.windowMs}`, "NX"],
        ["PTTL", key],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Redis rate-limit request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;

    if (!Array.isArray(payload) || payload.some((entry) => entry?.error)) {
      throw new Error("Redis rate-limit response payload is invalid");
    }

    const count = Math.max(1, Math.trunc(asNumber(payload[0]?.result)));
    let ttlMs = Math.trunc(asNumber(payload[2]?.result));

    if (ttlMs <= 0) {
      ttlMs = params.windowMs;
    }

    const resetAt = now + ttlMs;

    return {
      count,
      remaining: Math.max(0, params.max - count),
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
      limited: count > params.max,
    };
  }
}

let singletonStore: RateLimitStore | null = null;

export const getRateLimitStore = (): RateLimitStore => {
  if (singletonStore) {
    return singletonStore;
  }

  const redisUrl = process.env.REDIS_REST_URL;
  const redisToken = process.env.REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    singletonStore = new UpstashRedisRateLimitStore(redisUrl, redisToken);
    return singletonStore;
  }

  singletonStore = new InMemoryRateLimitStore();
  return singletonStore;
};
