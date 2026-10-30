# Environment Configuration

## Local development

Create `backend/.env` from `backend/.env.example` and configure `MONGO_URI`, JWT secrets, and (for AI-powered features) `OPENROUTER_API_KEY`.

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

The frontend adds `/api` to a configured API origin. Do not put backend secrets in frontend variables.

## Production environment variables

### Render API

Required/recommended:

- `NODE_ENV=production`
- `MONGO_URI` — Atlas connection string
- `JWT_SECRET` — unique random secret, at least 32 characters
- `JWT_REFRESH_SECRET` — a different unique random secret, at least 32 characters
- `OPENROUTER_API_KEY` — needed for AI-generated feedback and questions
- `FRONTEND_URL` — exact public frontend origin, such as `https://app.example.com`
- `CORS_ORIGINS` — comma-separated list of allowed frontend origins; use the production origin
- `REDIS_REST_URL` and `REDIS_REST_TOKEN` — Upstash REST credentials; configure both for shared, restart-resilient queue/runtime state

Optional:

- `GOOGLE_CLIENT_ID` — Google OAuth web client ID, if Google sign-in is enabled
- `MAX_RESUME_FILE_SIZE_BYTES` — defaults to the application limit
- `METRICS_API_KEY` — protects metrics access when configured
- `OPENROUTER_MODEL` and fallback model variables — override the backend's defaults

Render supplies `PORT`; do not set a fixed production port.

### Vercel frontend

- `VITE_API_URL` — Render API origin, e.g. `https://interviewai-api.onrender.com` (no trailing slash or `/api`)
- `VITE_GOOGLE_CLIENT_ID` — same Google OAuth web client ID as the backend, if applicable

`VITE_*` values are embedded into the public frontend build. Never set secrets there. Redeploy Vercel after changing a frontend variable.

## Secrets

Generate two different secrets from PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep the output private and enter one as `JWT_SECRET`, the other as `JWT_REFRESH_SECRET`. Do not commit `.env` files or paste secrets into chat/issues.

For the complete provider setup, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).
