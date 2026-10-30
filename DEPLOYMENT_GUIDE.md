# Production Deployment Guide

This repository is configured for a split deployment:

- **Frontend:** Vercel (Vite static site)
- **API and feedback queue worker:** Render (long-running Node web service)
- **Database:** MongoDB Atlas
- **Queue and shared runtime state:** Upstash Redis
- **AI provider:** OpenRouter

Do not deploy the repository root as a Vercel serverless app for the recommended setup. The feedback queue worker needs a persistent Node process.

## 1. Prepare external services

### MongoDB Atlas

1. Create a production cluster and a dedicated database user.
2. Save the connection URI for the Render `MONGO_URI` variable.
3. Configure Atlas Network Access to allow the Render service's outbound IP addresses. If your Render plan does not provide stable outbound IPs, Atlas may require a broader IP allowlist; use strong unique database credentials and prefer Render static outbound IPs for production.

### Upstash Redis

1. Create a Redis database in a region near the Render service.
2. Copy its **REST URL** and **REST token**. Do not use the Redis TCP URL/password for these variables.
3. These credentials are used by the feedback queue and shared rate-limit/runtime state. Configure both variables; do not configure only one.

### OpenRouter

Create an API key and keep it available for Render. The backend can return heuristic feedback when AI is unavailable, but the AI features need this key.

## 2. Deploy the backend to Render

1. Push the project to the GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository. The repository's `render.yaml` defines the API service. Keep the service root directory at the repository root.
3. Choose the paid `starter` instance for a persistent service. A free instance may sleep, delaying queued feedback until the service wakes.
4. Add the values requested by the Blueprint:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `OPENROUTER_API_KEY`
   - `FRONTEND_URL`
   - `CORS_ORIGINS`
   - `REDIS_REST_URL`
   - `REDIS_REST_TOKEN`
5. Generate two different random secrets, each at least 32 characters. For example, run this twice in PowerShell and use a different output for each secret:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

6. For the first deployment, `FRONTEND_URL` and `CORS_ORIGINS` can temporarily contain the Vercel production URL you plan to use. Update them to the exact final frontend origin after Vercel is deployed.
7. Deploy. The health check is `/api/health`; after deployment also check `https://YOUR-RENDER-SERVICE.onrender.com/api/ready`. Readiness should return HTTP 200 and `"status":"ready"` when MongoDB is reachable.

The Render Blueprint uses the repository root and runs:

```text
npm --prefix backend ci && npm --prefix backend run build
npm --prefix backend start
```

Render supplies `PORT`; do not hardcode a production port.

## 3. Deploy the frontend to Vercel

1. Import the same GitHub repository in Vercel.
2. Set **Root Directory** to `frontend` and enable **Include source files outside of the Root Directory** only if Vercel asks (the frontend does not need backend source).
3. Use Vercel's Vite defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Set these Vercel environment variables for Production (and Preview if you want to test previews):
   - `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com`
   - `VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com` (only if Google sign-in is enabled)
5. Deploy. `VITE_API_URL` is the backend origin; the frontend adds `/api` automatically. Redeploy after changing any `VITE_*` value.

The frontend calls the Render API directly, includes credentials, and bootstraps the CSRF token from the API response. For best browser-cookie compatibility in production, use custom domains under the same registrable domain, for example `app.example.com` on Vercel and `api.example.com` on Render. Set `VITE_API_URL` to the API custom domain and set Render's frontend/CORS origins to the app custom domain. With the default `vercel.app` and `onrender.com` domains, some browsers' third-party-cookie restrictions may prevent login from persisting.

## 4. Set final production origins

After you know the final Vercel URL (or custom domain), update the Render environment:

```text
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN
```

Use the origin only: no path and no trailing `/api`. For a custom domain, use that stable production origin. Add preview origins to `CORS_ORIGINS` only if you intentionally allow those deployments to access production data. Save the changes and redeploy/restart the Render service.

## 5. Optional Google sign-in

If Google sign-in is used:

1. Set `GOOGLE_CLIENT_ID` in Render.
2. Set the same client ID as `VITE_GOOGLE_CLIENT_ID` in Vercel.
3. Add the production frontend domain to the OAuth client's authorized JavaScript origins.
4. Redeploy the frontend after changing its variable.

## 6. Verify the deployment

1. Open `https://YOUR-RENDER-SERVICE.onrender.com/api/health` and confirm HTTP 200.
2. Open `https://YOUR-RENDER-SERVICE.onrender.com/api/ready` and confirm HTTP 200 with `"status":"ready"`.
3. Open the Vercel site and test signup, login, logout, and refresh after a page reload.
4. Start an interview, submit an answer, and confirm the feedback job reaches `completed`.
5. Check Render logs for startup, MongoDB, Redis, CORS, or OpenRouter errors.
6. Verify browser DevTools shows API requests going to the configured Render API origin, not back to the Vercel `/api` path.

## Production notes

- Never put MongoDB, JWT, Redis, or OpenRouter secrets in Vercel `VITE_*` variables; Vite variables are public in the built frontend.
- Keep `REDIS_REST_URL` and `REDIS_REST_TOKEN` configured together. Without Redis the service falls back to in-memory state, which is not durable across restarts or shared across multiple instances.
- Uploaded recordings use the configured recording store; verify its production persistence/retention configuration before relying on recordings as durable data.
- Restrict Atlas network access as much as your Render plan allows, use a least-privilege database user, and rotate any credentials that have ever been committed or shared.
- Do not deploy the root `vercel.json` API/serverless configuration for this architecture. In Vercel set the project Root Directory to `frontend`; it uses `frontend/vercel.json`.
