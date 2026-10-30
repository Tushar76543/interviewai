import axios, { type InternalAxiosRequestConfig } from "axios";

const normalizedApiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
const configuredApiBaseUrl =
  !normalizedApiUrl
    ? "/api"
    : normalizedApiUrl === "/api" || normalizedApiUrl.endsWith("/api")
      ? normalizedApiUrl
      : `${normalizedApiUrl}/api`;

export const apiBaseUrl = configuredApiBaseUrl;

export const resolveApiAssetUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const base =
    /^https?:\/\//i.test(apiBaseUrl)
      ? apiBaseUrl
      : typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";

  return new URL(trimmed, base).toString();
};

const CSRF_COOKIE_NAME = "csrf_token";

let csrfBootstrapPromise: Promise<void> | null = null;
let csrfTokenValue = "";

const readCookie = (name: string) => {
  if (typeof document === "undefined") return "";

  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(encodedName));

  if (!found) return "";
  return decodeURIComponent(found.slice(encodedName.length));
};

export const getCsrfToken = () => readCookie(CSRF_COOKIE_NAME) || csrfTokenValue;

export const ensureCsrfToken = async () => {
  if (getCsrfToken()) {
    return;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch(`${apiBaseUrl}/auth/csrf`, {
      method: "GET",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`CSRF bootstrap failed with status ${response.status}`);
        }

        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("csrfToken" in payload) ||
          typeof payload.csrfToken !== "string" ||
          !payload.csrfToken
        ) {
          throw new Error("CSRF bootstrap response did not include a token");
        }

        csrfTokenValue = payload.csrfToken;
      })
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  await csrfBootstrapPromise;
};

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "GET").toUpperCase();

  if (SAFE_METHODS.has(method)) {
    return config;
  }

  if (!getCsrfToken()) {
    await ensureCsrfToken();
  }

  const token = getCsrfToken();
  if (!token) {
    return config;
  }

  if (!config.headers) {
    config.headers = {};
  }

  config.headers["X-CSRF-Token"] = token;
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

const shouldSkipRefreshForUrl = (url: string | undefined) => {
  if (!url) return false;
  return /\/auth\/(login|signup|google|refresh|forgot-password|reset-password)/i.test(url);
};

const attemptSessionRefresh = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        if (!getCsrfToken()) {
          await ensureCsrfToken();
        }

        const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {},
        });

        return res.ok;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (!originalRequest || status !== 401 || originalRequest._retry) {
      throw error;
    }

    if (shouldSkipRefreshForUrl(originalRequest.url)) {
      throw error;
    }

    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      throw error;
    }

    originalRequest._retry = true;
    return api(originalRequest);
  }
);

export default api;
