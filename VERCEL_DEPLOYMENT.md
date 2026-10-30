# Vercel Frontend Deployment

Vercel hosts the Vite frontend only. Deploy the Express API and its persistent feedback queue worker to Render; see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the full setup.

## Vercel project settings

1. Import the GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Keep the Vite defaults:
   - Install: `npm install`
   - Build: `npm run build`
   - Output: `dist`
4. Set the Production environment variable:

   ```text
   VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
   ```

   Set the API origin only; the app adds `/api`. Add `VITE_GOOGLE_CLIENT_ID` if Google sign-in is enabled. Preview deployments need their own environment variables and their origins must be allowed by the backend if used.

5. Deploy. Redeploy after changing any `VITE_*` setting.

Do not set `VITE_API_URL=/api` for this split deployment: the Vercel project serves only the frontend and does not proxy API calls.

## Verify

- Frontend loads at the Vercel URL.
- `https://YOUR-RENDER-SERVICE.onrender.com/api/health` returns HTTP 200.
- `https://YOUR-RENDER-SERVICE.onrender.com/api/ready` returns HTTP 200 when MongoDB is available.
- Browser DevTools shows API requests going to the Render API origin.
- Signup/login and refresh work after a reload. For the most reliable cookie behavior, use Vercel and Render custom domains under the same registrable domain.

Use the repository root directory only if you intend to deploy the legacy bundled/serverless configuration; that is not the recommended deployment for this project because its feedback worker needs a persistent process.
