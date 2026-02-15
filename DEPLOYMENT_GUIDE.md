# 🚀 Vercel Deployment Guide - Interview AI

## ⚠️ Current Deployment Issues & Fixes

### Issue 1: React Hydration Error (#418)
**Symptoms:** 
- 401 Unauthorized errors
- "Minified React error #418" 
- App not loading properly

**Root Cause:** Missing or incorrect environment variables + build configuration

---

## 📝 Deployment Steps (CORRECT METHOD)

### Option A: Deploy Frontend + Backend Separately (RECOMMENDED)

#### **1. Deploy Frontend to Vercel**

1. **Push your code to GitHub** (already done ✅)

2. **Import project in Vercel:**
   - Go to https://vercel.com/new
   - Import your `Tushar76543/interviewai` repository
   - Select **Frontend framework**: Vite
   - Set **Root Directory**: `frontend`
   - Leave Build Command as default (`npm run build`)
   - Leave Output Directory as default (`dist`)

3. **Configure Environment Variables:**
   - Go to Project Settings → Environment Variables
   - Add the following:

   ```
   Variable Name: VITE_API_URL
   Value: https://your-backend-url.onrender.com/api
   ```

   **IMPORTANT**: Replace `your-backend-url` with your actual Render backend URL

4. **Deploy!**

#### **2. Deploy Backend to Render**

1. **Create a new Web Service:**
   - Go to https://render.com
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Build Settings:**
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node

3. **Set Environment Variables:**
   ```
   MONGO_URI=mongodb+srv://...your-connection-string
   OPENROUTER_API_KEY=sk-or-v1-...your-api-key
   JWT_SECRET=your-super-secret-jwt-key-change-this
   FRONTEND_URL=https://your-vercel-app.vercel.app
   NODE_ENV=production
   PORT=5000
   ```

4. **Deploy!**

---

### Option B: Deploy Everything to Vercel (Serverless)

If you want to keep everything on Vercel (less recommended due to serverless limitations):

#### **1. Configure Project Root**

1. **Import project in Vercel** (use repository root, not frontend subdirectory)

2. **Override Build Settings:**
   - **Build Command**: `npm run build`
   - **Output Directory**: `frontend/dist`
   - **Install Command**: `npm install`

3. **Set Environment Variables:**

   **For Frontend (used during build):**
   ```
   VITE_API_URL=/api
   ```

   **For Backend (used at runtime):**
   ```
   MONGO_URI=mongodb+srv://...your-connection-string
   OPENROUTER_API_KEY=sk-or-v1-...your-api-key
   JWT_SECRET=your-super-secret-jwt-key
   NODE_ENV=production
   ```

4. **Important: Bundle API before each deployment**
   
   Run locally before pushing:
   ```bash
   npm run bundle:api
   ```
   
   This creates `api/index.js` which Vercel will use as a serverless function.

5. **Commit and push:**
   ```bash
   git add api/index.js
   git commit -m "Update bundled API"
   git push
   ```

---

## 🔧 Troubleshooting Common Errors

### Error: "401 Unauthorized" on `/vite.svg`
**Solution:** This is a red herring. The real issue is missing environment variables or build failure. Check Vercel build logs.

### Error: "Minified React error #418"
**Solution:** 
1. Ensure `VITE_API_URL` is set in Vercel environment variables
2. Rebuild the deployment after adding env vars
3. Check browser console for actual error details

### Error: "500 Internal Server Error" on API calls
**Solution:**
1. Check that all backend environment variables are set (especially `MONGO_URI` and `OPENROUTER_API_KEY`)
2. View Function Logs in Vercel dashboard
3. Ensure `api/index.js` is committed and up to date

### Error: "Module not found" during build
**Solution:**
1. Make sure you ran `npm run bundle:api` before deploying
2. Ensure `api/index.js` is in your git repository
3. Check that all dependencies are in `package.json`, not devDependencies

### Build fails with timeout
**Solution:**
1. Increase function timeout in `vercel.json` (already set to 30s)
2. Consider moving backend to Render (recommended)
3. Optimize bundle size by removing unused dependencies

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Frontend loads at `https://your-app.vercel.app`
- [ ] Can access signup page
- [ ] Can create an account (tests database connection)
- [ ] Can login (tests JWT and API)
- [ ] Can start an interview (tests OpenRouter API)
- [ ] Check Vercel Functions logs for any errors

---

## 🎯 Recommended Architecture

**BEST PRACTICE:**

```
Frontend (Vercel)
    ↓
   API calls over HTTPS
    ↓
Backend (Render Web Service)
    ↓
MongoDB Atlas
OpenRouter API
```

**Why?**
- ✅ No serverless cold starts
- ✅ Better for WebSocket/long-running connections
- ✅ Easier debugging
- ✅ Better error logging
- ✅ More predictable costs

---

## 📞 Still Having Issues?

1. **Check Vercel Build Logs:**
   - Go to your deployment in Vercel
   - Click on the deployment
   - View "Building" logs

2. **Check Vercel Function Logs:**
   - Go to your project in Vercel
   - Navigate to "Functions" tab
   - View real-time logs

3. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Look for error messages

4. **Common fixes:**
   - Redeploy after setting environment variables
   - Clear Vercel build cache (in deployment settings)
   - Ensure git repository is up to date

---

## 🔄 Quick Fix Commands

If deploying with Option B (all on Vercel), run these before each deployment:

```bash
# Bundle the API
npm run bundle:api

# Commit the bundled API
git add api/index.js
git commit -m "Update API bundle"

# Push to trigger deployment
git push
```

---

## 📚 Additional Resources

- [Vercel Deployment Docs](https://vercel.com/docs)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Render Deployment Guide](https://render.com/docs)

---

**Last Updated:** 2026-02-15
