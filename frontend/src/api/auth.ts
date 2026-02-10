const API_BASE =
  import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? "" : "");

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function signup(name: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function logout() {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function getMe() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: "GET",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.json();
}
