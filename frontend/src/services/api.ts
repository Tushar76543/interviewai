import axios, { type InternalAxiosRequestConfig } from "axios";

const normalizedApiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
const configuredApiBaseUrl =
  !normalizedApiUrl
    ? "/api"
    : normalizedApiUrl === "/api" || normalizedApiUrl.endsWith("/api")
      ? normalizedApiUrl
      : `${normalizedApiUrl}/api`;

const resolveApiBaseUrl = () => {
  if (
    configuredApiBaseUrl === "/api" ||
    import.meta.env.DEV ||
    typeof window === "undefined" ||
    !/^https?:\/\//i.test(configuredApiBaseUrl)
  ) {
    return configuredApiBaseUrl;
  }

  try {
    const configuredOrigin = new URL(configuredApiBaseUrl).origin;
    if (configuredOrigin !== window.location.origin) {
      return "/api";
    }
  } catch {
    return "/api";
  }

  return configuredApiBaseUrl;
};

export const apiBaseUrl = resolveApiBaseUrl();
const CSRF_COOKIE_NAME = "csrf_token";

let csrfBootstrapPromise: Promise<void> | null = null;

const readCookie = (name: string) => {
  if (typeof document === "undefined") return "";

  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(encodedName));

  if (!found) return "";
  return decodeURIComponent(found.slice(encodedName.length));
};

export const getCsrfToken = () => readCookie(CSRF_COOKIE_NAME);

export const ensureCsrfToken = async () => {
  if (getCsrfToken()) {
    return;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch(`${apiBaseUrl}/auth/csrf`, {
      method: "GET",
      credentials: "include",
    })
      .then(() => undefined)
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

export default api;
