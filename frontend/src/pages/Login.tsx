import { useState } from "react";
import { login } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");

    const res = await login(email, password);

    if (res.error || res.success === false) {
      setErr(res.message || "Login failed");
      setLoading(false);
      return;
    }

    // 🔥 Save JWT token locally
    if (res.token) {
      localStorage.setItem("token", res.token);
    }

    // 🔥 Save user details in auth context
    setUser(res.user);

    setLoading(false);
    navigate("/dashboard");
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-title">
          <h1>Welcome Back</h1>
          <p style={{ color: "var(--light-300)", marginTop: "0.5rem" }}>
            Sign in to continue your interview practice
          </p>
        </div>

        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {err && <div className="error-message">{err}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account?{" "}
          <Link to="/signup">Create one here</Link>
        </div>
      </div>
    </div>
  );
}
