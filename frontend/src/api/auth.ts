import { ensureCsrfToken, getCsrfToken } from "../services/api";

const API_BASE =
  import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? "" : "");

const getCsrfHeaders = () => {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
};

export async function login(email: string, password: string) {
  await ensureCsrfToken();

  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
    },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function signup(name: string, email: string, password: string) {
  await ensureCsrfToken();

  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
    },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function logout() {
  await ensureCsrfToken();

  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: getCsrfHeaders(),
  });
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  return res.json();
}

export async function getCsrf() {
  const res = await fetch(`${API_BASE}/api/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });
  return res.json();
}
