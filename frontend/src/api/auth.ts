import { apiBaseUrl, ensureCsrfToken, getCsrfToken } from "../services/api";

const parseApiResponse = async (res: Response) => {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      success: false,
      message: raw || `Request failed with status ${res.status}`,
    };
  }
};

const getCsrfHeaders = () => {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
};

export async function login(email: string, password: string) {
  await ensureCsrfToken();

  const res = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
    },
    body: JSON.stringify({ email, password }),
  });
  return parseApiResponse(res);
}

export async function googleLogin(credential: string) {
  await ensureCsrfToken();

  const res = await fetch(`${apiBaseUrl}/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
    },
    body: JSON.stringify({ credential }),
  });

  return parseApiResponse(res);
}

export async function signup(name: string, email: string, password: string) {
  await ensureCsrfToken();

  const res = await fetch(`${apiBaseUrl}/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
    },
    body: JSON.stringify({ name, email, password }),
  });
  return parseApiResponse(res);
}

export async function logout() {
  await ensureCsrfToken();

  const res = await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: getCsrfHeaders(),
  });
  return parseApiResponse(res);
}

export async function getMe() {
  const res = await fetch(`${apiBaseUrl}/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  return parseApiResponse(res);
}

export async function getCsrf() {
  const res = await fetch(`${apiBaseUrl}/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });
  return parseApiResponse(res);
}
