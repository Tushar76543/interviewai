# Production Readiness Runbook

## Pre-deploy Verification

Run from repository root:

```bash
npm run check:prod
```

This validates:

- Backend TypeScript build
- Frontend lint
- Frontend production build
- Vercel API bundle generation (`api/index.js`)

## Runtime Health Checks

- Liveness: `GET /api/health`
- Readiness (DB dependency): `GET /api/ready`

`/api/health` should stay `200` when the process is up.
`/api/ready` returns `503` if MongoDB is unavailable.

## Required Environment Rules

- `MONGO_URI`, `JWT_SECRET`, `OPENROUTER_API_KEY` are mandatory.
- `JWT_SECRET` must be at least 32 characters.
- In production:
  - `FRONTEND_URL` must be configured and use `https`.
  - `CORS_ORIGINS` entries must be valid origins and use `https`.
  - `REDIS_REST_URL` and `REDIS_REST_TOKEN` must be provided together if used.

## CI Gate

GitHub Actions workflow: `.github/workflows/ci.yml`

Every push/PR runs the same production checks used locally.
