# Production Deployment Checklist

## Before deploying

- [ ] MongoDB Atlas cluster and least-privilege database user are ready.
- [ ] Atlas Network Access allows the Render service's outbound IP addresses.
- [ ] Upstash Redis REST URL and token are ready.
- [ ] OpenRouter API key is ready.
- [ ] Two distinct JWT secrets of at least 32 characters have been generated.
- [ ] Secrets are not committed and are entered only in the provider dashboards.

## Render API and feedback worker

- [ ] Create a Render Blueprint from the repository root using `render.yaml`.
- [ ] Use a persistent paid web-service instance for production; a sleeping free instance can delay queued feedback.
- [ ] Set `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OPENROUTER_API_KEY`, `FRONTEND_URL`, `CORS_ORIGINS`, `REDIS_REST_URL`, and `REDIS_REST_TOKEN`.
- [ ] Confirm the Render build succeeds and the service starts.
- [ ] Confirm `/api/health` returns HTTP 200.
- [ ] Confirm `/api/ready` returns HTTP 200 and reports `"status":"ready"`.

## Vercel frontend

- [ ] Import the repository with Root Directory set to `frontend`.
- [ ] Build command is `npm run build`; output directory is `dist`.
- [ ] Set `VITE_API_URL` to the Render API origin, e.g. `https://interviewai-api.onrender.com` (do not add `/api`).
- [ ] Set `VITE_GOOGLE_CLIENT_ID` if Google sign-in is enabled.
- [ ] Deploy and open the production site.

## After deploying

- [ ] Set Render `FRONTEND_URL` and `CORS_ORIGINS` to the exact production frontend origin.
- [ ] Redeploy/restart the Render service after changing those values.
- [ ] Test signup, login, logout, and login persistence after a full page reload.
- [ ] Test interview creation and ensure feedback jobs complete.
- [ ] Check browser Network/Console and Render logs for CORS, cookies, Redis, MongoDB, and OpenRouter errors.
- [ ] Prefer Vercel and Render custom domains under the same registrable domain for reliable browser cookie behavior.
- [ ] Confirm recording storage and retention are suitable for production.

For detailed instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).
