const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ✔ FIX: added "/api" prefix to match backend routes
export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function signup(name: string, email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function logout() {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  return res.json();
}
