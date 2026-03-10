import { useCallback, useState } from "react";
import { login, googleLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import GoogleSignInButton from "../components/GoogleSignInButton";
import "../App.css";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const hasGoogleClientId = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErr("");

    const res = await login(email, password);

    if (res.error || res.success === false) {
      setErr(res.message || "Login failed");
      setLoading(false);
      return;
    }

    setUser(res.user);
    setLoading(false);
    navigate("/dashboard");
  };

  const handleGoogleSuccess = useCallback(
    async (credential: string) => {
      setLoading(true);
      setErr("");

      const res = await googleLogin(credential);
      if (res.error || res.success === false) {
        setErr(res.message || "Google sign-in failed");
        setLoading(false);
        return;
      }

      setUser(res.user);
      setLoading(false);
      navigate("/dashboard");
    },
    [navigate, setUser]
  );

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-title">
          <h1>Welcome Back</h1>
          <p className="auth-subtitle">
            Sign in to continue your interview practice
          </p>
          <p className="auth-highlights">Secure sessions, CSRF protection, and private history tracking.</p>
        </div>

        {hasGoogleClientId && (
          <>
            <GoogleSignInButton onSuccess={handleGoogleSuccess} disabled={loading} text="continue_with" />
            <div className="auth-divider">
              <span>or</span>
            </div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div className="password-field-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {err && <div className="error-message">{err}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/signup">Create one here</Link>
        </div>
      </div>
    </div>
  );
}
