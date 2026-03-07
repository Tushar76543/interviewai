# Vercel Deployment (Single Project: Frontend + API)

## 1. Pre-deploy locally

Run from repo root:

```bash
npm run check:prod
```

## 2. Vercel project settings

Use the repo root as project root. `vercel.json` already configures:

- install command
- build command
- frontend output directory
- API routing to `api/index.js`
- SPA fallback routing

## 3. Environment variables in Vercel

Set these for **Production** (and Preview if you test preview deploys):

- `NODE_ENV=production`
- `MONGO_URI=...`
- `JWT_SECRET=...` (minimum 32 chars)
- `OPENROUTER_API_KEY=...`
- `OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free` (optional override)
- `FRONTEND_URL=https://your-domain.vercel.app`
- `CORS_ORIGINS=https://your-domain.vercel.app`
- `MAX_RESUME_FILE_SIZE_BYTES=2097152` (optional)
- `REDIS_REST_URL=...` and `REDIS_REST_TOKEN=...` (optional but recommended, set together)

Frontend:

- `VITE_API_URL=/api` (recommended for same-project API)

## 4. Deploy

Push to your connected branch in Vercel, or deploy from CLI.

## 5. Post-deploy checks

Verify:

- `GET /api/health` returns `200`
- `GET /api/ready` returns `200`
- Signup/login works
- Interview question generation works
- Feedback generation works

## 6. Known warning

Frontend build currently warns about a large JS chunk. This does not block deploy, but code-splitting can improve load performance.
