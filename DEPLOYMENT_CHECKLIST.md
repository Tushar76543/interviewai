# ✅ Vercel Deployment Checklist

## Before Deploying

- [ ] **Bundle the API** (if using Vercel serverless)
  ```bash
  npm run bundle:api
  ```

- [ ] **Commit the bundled API**
  ```bash
  git add api/index.js
  git commit -m "Update API bundle for deployment"
  ```

- [ ] **Push to GitHub**
  ```bash
  git push origin main
  ```

## In Vercel Dashboard

- [ ] **1. Import project from GitHub**
  - Repository: `Tushar76543/interviewai`

- [ ] **2. Configure Build Settings**
  - Framework Preset: `Vite` (or Other if deploying from root)
  - Root Directory: `frontend` (or leave blank if deploying from root)
  - Build Command: `npm run build` (or leave default)
  - Output Directory: `dist` (or `frontend/dist` if deploying from root)

- [ ] **3. Set Environment Variables**
  
  **Required for Build (Frontend):**
  ```
  VITE_API_URL = /api
  ```
  OR (if backend is on Render):
  ```
  VITE_API_URL = https://your-backend.onrender.com/api
  ```

  **Required for Runtime (Backend/API Functions):**
  ```
  MONGO_URI = mongodb+srv://...
  OPENROUTER_API_KEY = sk-or-v1-...
  JWT_SECRET = your-secret-key
  FRONTEND_URL = https://your-app.vercel.app
  NODE_ENV = production
  ```

- [ ] **4. Click "Deploy"**

## After First Deployment

- [ ] **Get your Vercel URL** (e.g., `https://interviewai-xyz.vercel.app`)

- [ ] **Update FRONTEND_URL environment variable**
  - Go to Project Settings → Environment Variables
  - Update `FRONTEND_URL` with your actual Vercel URL
  - Redeploy

## Testing the Deployment

- [ ] **Frontend loads** (visit your Vercel URL)
- [ ] **Can access login page** (`/login`)
- [ ] **Can access signup page** (`/signup`)
- [ ] **Can create account** (tests MongoDB connection)
- [ ] **Can login** (tests JWT)
- [ ] **Can start interview** (tests OpenRouter API)
- [ ] **Can receive AI questions** (tests full backend integration)

## Troubleshooting

If deployment fails:

1. **Check Build Logs**
   - In Vercel, click on failed deployment
   - Expand "Building" section
   - Look for error messages

2. **Check Function Logs**
   - Go to "Functions" tab in Vercel
   - Monitor real-time logs during testing

3. **Common Issues:**
   - ❌ `VITE_API_URL` not set → Set in environment variables
   - ❌ `api/index.js` missing → Run `npm run bundle:api` and commit
   - ❌ MongoDB connection fails → Check `MONGO_URI` is correct
   - ❌ OpenRouter fails → Check `OPENROUTER_API_KEY` is correct
   - ❌ CORS errors → Check `FRONTEND_URL` matches your Vercel URL

4. **Force Redeploy:**
   - Go to deployments
   - Click "..." on latest deployment
   - Click "Redeploy"
   - Check "Clear Build Cache"

## Alternative: Deploy Backend to Render

If Vercel serverless functions are problematic:

1. **Deploy frontend only to Vercel**
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Environment Variable: `VITE_API_URL=https://your-backend.onrender.com/api`

2. **Deploy backend to Render**
   - Create Web Service
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Set all backend environment variables

## Notes

- 📝 Environment variables are only applied to NEW deployments
- 📝 After changing env vars, you must redeploy
- 📝 `VITE_*` variables are embedded during build time
- 📝 Other variables are used at runtime

---

**Status:** Ready for deployment ✨
