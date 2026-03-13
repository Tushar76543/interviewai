import { getEnvConfig } from "../config/env.js";

type StringEntry = {
  value: string;
  expiresAt: number | null;
};

type SortedSetEntry = {
  score: number;
  member: string;
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const toInt = (value: unknown, fallback = 0) =>
  Math.trunc(toFiniteNumber(value, fallback));

const nowMs = () => Date.now();

export interface RuntimeStore {
  readonly isDistributed: boolean;
  get(key: string): Promise<string | null>;
  setEx(key: string, value: string, ttlSec: number): Promise<void>;
  setNxEx(key: string, value: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incrWithTtl(key: string, ttlSec: number): Promise<number>;
  rpush(key: string, value: string): Promise<number>;
  lpop(key: string): Promise<string | null>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrangeByScore(key: string, maxScore: number, limit: number): Promise<string[]>;
  zrem(key: string, member: string): Promise<void>;
  expire(key: string, ttlSec: number): Promise<void>;
}

class InMemoryRuntimeStore implements RuntimeStore {
  readonly isDistributed = false;

  private readonly strings = new Map<string, StringEntry>();
  private readonly lists = new Map<string, string[]>();
  private readonly sortedSets = new Map<string, SortedSetEntry[]>();
  private readonly expiresAtByKey = new Map<string, number>();

  private hasAnyValue(key: string) {
    return this.strings.has(key) || this.lists.has(key) || this.sortedSets.has(key);
  }

  private clearKey(key: string) {
    this.strings.delete(key);
    this.lists.delete(key);
    this.sortedSets.delete(key);
    this.expiresAtByKey.delete(key);
  }

  private cleanupKeyIfExpired(key: string) {
    const expiresAt = this.expiresAtByKey.get(key);
    if (!expiresAt) {
      return;
    }

    if (expiresAt <= nowMs()) {
      this.clearKey(key);
    }
  }

  private cleanupExpired() {
    const now = nowMs();
    for (const [key, expiresAt] of this.expiresAtByKey.entries()) {
      if (expiresAt <= now) {
        this.clearKey(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    return this.strings.get(key)?.value ?? null;
  }

  async setEx(key: string, value: string, ttlSec: number): Promise<void> {
    this.cleanupExpired();
    const ttlMs = Math.max(1, ttlSec) * 1000;
    this.strings.set(key, {
      value,
      expiresAt: null,
    });
    this.expiresAtByKey.set(key, nowMs() + ttlMs);
  }

  async setNxEx(key: string, value: string, ttlSec: number): Promise<boolean> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);

    const existing = this.strings.get(key);
    if (existing) {
      return false;
    }

    await this.setEx(key, value, ttlSec);
    return true;
  }

  async del(key: string): Promise<void> {
    this.clearKey(key);
  }

  async incrWithTtl(key: string, ttlSec: number): Promise<number> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const existing = this.strings.get(key);

    if (!existing) {
      await this.setEx(key, "1", ttlSec);
      return 1;
    }

    const count = toInt(existing.value, 0) + 1;
    this.strings.set(key, {
      value: `${count}`,
      expiresAt: null,
    });
    return count;
  }

  async rpush(key: string, value: string): Promise<number> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lpop(key: string): Promise<string | null> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const list = this.lists.get(key);
    if (!list || list.length === 0) {
      return null;
    }

    const item = list.shift() ?? null;
    if (list.length === 0) {
      this.lists.delete(key);
    } else {
      this.lists.set(key, list);
    }
    return item;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const set = this.sortedSets.get(key) ?? [];
    const filtered = set.filter((item) => item.member !== member);
    filtered.push({ score, member });
    filtered.sort((a, b) => a.score - b.score);
    this.sortedSets.set(key, filtered);
  }

  async zrangeByScore(key: string, maxScore: number, limit: number): Promise<string[]> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const set = this.sortedSets.get(key) ?? [];
    return set
      .filter((item) => item.score <= maxScore)
      .slice(0, Math.max(1, limit))
      .map((item) => item.member);
  }

  async zrem(key: string, member: string): Promise<void> {
    this.cleanupExpired();
    this.cleanupKeyIfExpired(key);
    const set = this.sortedSets.get(key) ?? [];
    const filtered = set.filter((item) => item.member !== member);
    if (filtered.length === 0) {
      this.sortedSets.delete(key);
      return;
    }
    this.sortedSets.set(key, filtered);
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    this.cleanupExpired();
    if (!this.hasAnyValue(key)) {
      return;
    }

    this.expiresAtByKey.set(key, nowMs() + Math.max(1, ttlSec) * 1000);
  }
}

class UpstashRuntimeStore implements RuntimeStore {
  readonly isDistributed = true;

  private readonly endpoint: string;
  private readonly token: string;

  constructor(endpoint: string, token: string) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.token = token;
  }

  private async runPipeline(commands: string[][]): Promise<unknown[]> {
    const response = await fetch(`${this.endpoint}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      throw new Error(`Redis pipeline failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(payload) || payload.some((entry) => entry?.error)) {
      throw new Error("Redis pipeline response is invalid");
    }

    return payload.map((entry) => entry?.result);
  }

  async get(key: string): Promise<string | null> {
    const [result] = await this.runPipeline([["GET", key]]);
    return typeof result === "string" ? result : null;
  }

  async setEx(key: string, value: string, ttlSec: number): Promise<void> {
    await this.runPipeline([["SET", key, value, "EX", `${Math.max(1, ttlSec)}`]]);
  }

  async setNxEx(key: string, value: string, ttlSec: number): Promise<boolean> {
    const [result] = await this.runPipeline([
      ["SET", key, value, "EX", `${Math.max(1, ttlSec)}`, "NX"],
    ]);

    return typeof result === "string" && result.toUpperCase() === "OK";
  }

  async del(key: string): Promise<void> {
    await this.runPipeline([["DEL", key]]);
  }

  async incrWithTtl(key: string, ttlSec: number): Promise<number> {
    const [countResult] = await this.runPipeline([
      ["INCR", key],
      ["EXPIRE", key, `${Math.max(1, ttlSec)}`, "NX"],
    ]);
    return Math.max(1, toInt(countResult, 1));
  }

  async rpush(key: string, value: string): Promise<number> {
    const [result] = await this.runPipeline([["RPUSH", key, value]]);
    return Math.max(0, toInt(result, 0));
  }

  async lpop(key: string): Promise<string | null> {
    const [result] = await this.runPipeline([["LPOP", key]]);
    return typeof result === "string" ? result : null;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.runPipeline([["ZADD", key, `${Math.trunc(score)}`, member]]);
  }

  async zrangeByScore(key: string, maxScore: number, limit: number): Promise<string[]> {
    const [result] = await this.runPipeline([
      ["ZRANGEBYSCORE", key, "-inf", `${Math.trunc(maxScore)}`, "LIMIT", "0", `${Math.max(1, limit)}`],
    ]);

    if (!Array.isArray(result)) {
      return [];
    }

    return result.filter((item): item is string => typeof item === "string");
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.runPipeline([["ZREM", key, member]]);
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    await this.runPipeline([["EXPIRE", key, `${Math.max(1, ttlSec)}`]]);
  }
}

let singletonStore: RuntimeStore | null = null;

export const getRuntimeStore = (): RuntimeStore => {
  if (singletonStore) {
    return singletonStore;
  }

  const { redisRestUrl, redisRestToken } = getEnvConfig();
  if (redisRestUrl && redisRestToken) {
    singletonStore = new UpstashRuntimeStore(redisRestUrl, redisRestToken);
    return singletonStore;
  }

  singletonStore = new InMemoryRuntimeStore();
  return singletonStore;
};
