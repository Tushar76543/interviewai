import app from "./app.js";

// Vercel rewrites /api/:path* to /api/index.js; preserve the original path for Express.
export default function handler(req: any, res: any) {
  const url = new URL(req.url || "/", "http://localhost");
  const forwardedPath = url.searchParams.get("path");

  if (forwardedPath !== null) {
    url.searchParams.delete("path");
    const normalizedPath = forwardedPath.startsWith("/") ? forwardedPath : `/${forwardedPath}`;
    const query = url.searchParams.toString();
    req.url = `/api${normalizedPath}${query ? `?${query}` : ""}`;
  } else if (url.pathname.startsWith("/api/index.js")) {
    const query = url.searchParams.toString();
    req.url = `/api${query ? `?${query}` : ""}`;
  }

  return app(req, res);
}
