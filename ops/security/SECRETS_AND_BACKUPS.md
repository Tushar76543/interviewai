# Security And Backup Operations

## Secrets management baseline
- Do not store production secrets in `.env` files committed to git.
- Inject runtime secrets from a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault, or platform-native secret store).
- Minimum secrets:
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `MONGO_URI`
  - `OPENROUTER_API_KEY`
  - `REDIS_REST_URL`
  - `REDIS_REST_TOKEN`
  - `METRICS_API_KEY`
- Rotate all auth/AI/DB secrets at least every 90 days.

## Dependency and container scanning
- CI now includes:
  - `npm audit` (root/backend/frontend)
  - Trivy image scan for HIGH/CRITICAL issues
- Keep lockfiles up to date and patch vulnerabilities with SLA:
  - Critical: 24h
  - High: 7 days

## MongoDB backup and restore drill
- Run weekly backup jobs and monthly restore drills.
- Example backup command:
```bash
mongodump --uri "$MONGO_URI" --archive=backup.archive --gzip
```
- Example restore drill:
```bash
mongorestore --uri "$MONGO_URI" --archive=backup.archive --gzip --drop
```
- Validate restored data with:
  - collection counts
  - index presence
  - API smoke tests against restored environment

## Incident readiness
- Keep a runbook with:
  - auth token revocation emergency procedure
  - Redis outage fallback behavior
  - AI provider outage policy (circuit breaker/fallback mode)
  - rollback and database restore decision matrix

