type AppHandler = (req: any, res: any) => unknown;

let appPromise: Promise<AppHandler> | null = null;

const loadApp = async () => {
  if (!appPromise) {
    appPromise = import("./app.js").then((module) => module.default as AppHandler);
  }

  return appPromise;
};

const rewriteRequestUrl = (req: any) => {
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
};

// Vercel rewrites /api/:path* to /api/index.js; preserve the original path for Express.
export default async function handler(req: any, res: any) {
  try {
    rewriteRequestUrl(req);
    const app = await loadApp();
    return app(req, res);
  } catch (error) {
    console.error("Server bootstrap failed", error);

    if (res.headersSent) {
      return;
    }

    const detail = error instanceof Error ? error.message : "Unknown startup failure";
    res.status(500).json({
      success: false,
      message: "Server configuration error",
      detail: process.env.NODE_ENV === "production" ? undefined : detail,
    });
  }
}
