# Environment Configuration Guide

## Local Development
Create a `.env.local` file in the frontend directory:
```
VITE_API_URL=http://localhost:5000
```

## Production (Vercel)
Set environment variable in Vercel dashboard:
- Variable name: `VITE_API_URL`
- Value: Your Render backend URL (e.g., `https://your-backend.onrender.com`)

## Backend (Render)
Set these environment variables in Render dashboard:
- `MONGO_URI` - Your MongoDB connection string
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `OPENROUTER_MODEL` - (Optional) OpenRouter model, e.g. `meta-llama/llama-3-70b-instruct`
- `JWT_SECRET` - Secret for JWT tokens
- `FRONTEND_URL` - Your Vercel frontend URL (e.g., `https://your-app.vercel.app`)
- `NODE_ENV` - Set to `production`
