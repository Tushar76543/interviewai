import { useState } from "react";
import { login } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
  e.preventDefault();

  const res = await login(email, password);
  console.log("BACKEND LOGIN RESPONSE:", res);

  if (res.error || res.success === false) {
    setErr(res.message || "Login failed");
    return;
  }

  setUser(res.user);
  navigate("/dashboard");
};

  return (
    <div>
      <h1>Login</h1>

      <form onSubmit={submit}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button>Login</button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}
    </div>
  );
}
