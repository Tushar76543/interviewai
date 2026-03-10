import { useCallback, useState } from "react";
import { signup, googleLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import GoogleSignInButton from "../components/GoogleSignInButton";
import "../App.css";

export default function Signup() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const hasGoogleClientId = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErr("");

    const res = await signup(name, email, password);
    if (res.success === false) {
      setErr(res.message || "Signup failed");
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
        setErr(res.message || "Google sign-up failed");
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
          <h1>Create Account</h1>
          <p style={{ color: "var(--slate-500)", marginTop: "0.5rem" }}>
            Start practicing interviews with AI
          </p>
        </div>

        {hasGoogleClientId && (
          <>
            <GoogleSignInButton onSuccess={handleGoogleSuccess} disabled={loading} text="signup_with" />
            <div className="auth-divider">
              <span>or</span>
            </div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

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
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Min 8 chars, 1 letter, 1 number"
              required
              minLength={8}
            />
            <span className="form-hint">At least 8 characters, one letter, and one number</span>
          </div>

          {err && <div className="error-message">{err}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in here</Link>
        </div>
      </div>
    </div>
  );
}
