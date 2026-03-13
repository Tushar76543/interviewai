# Redis Production Baseline

## Key namespace and TTL policy
- Key prefix is controlled by `REDIS_KEY_PREFIX` (default: `ip`).
- Every runtime key created by this app has an explicit TTL:
  - Rate limits: `ip:rl:*` via `INCR + EXPIRE`.
  - Feedback queue: `ip:queue:feedback:*` with queue/list/zset marker TTL.
  - Auth revocation/session/suspicious login: `ip:auth:*` with explicit expiry.

## Memory policy
- Recommended cache-heavy mode: `allkeys-lfu`.
- If all keys are guaranteed TTL-based: use `volatile-lfu` or `volatile-ttl`.
- Expose configured intent in app env:
  - `REDIS_MEMORY_POLICY=allkeys-lfu`
  - `REDIS_PERSISTENCE_MODE=cache-only` or `durable`

## Persistence mode guidance
- `cache-only`:
  - Use `appendonly no`.
  - Best for rate limiting, revocation cache, and retry queues that can be rebuilt.
- `durable`:
  - Use `appendonly yes` and periodic snapshots.
  - Use for state where data loss would cause correctness issues.

## Operational checks
- Confirm key TTL discipline regularly:
  - `TTL ip:queue:feedback:ready`
  - `TTL ip:auth:refresh:<session-id>`
  - `TTL ip:rl:auth:<client-key>`
- Ensure `used_memory` and `evicted_keys` are tracked in Redis monitoring.

