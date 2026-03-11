import { useCallback, useState } from "react";
import { signup, googleLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { Eye, EyeOff } from "lucide-react";
import "../App.css";
import "../styles/auth-modern.css";

export default function Signup() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const hasGoogleClientId = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim());
  const canSubmit =
    name.trim().length > 1 &&
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErr("");

    const res = await signup(name.trim(), email.trim(), password);
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
    <div className="auth-modern-page">
      <div className="auth-modern-card">
        <div className="auth-modern-title">
          <h1>Create Account</h1>
          <p>Build your InterviewPilot profile in seconds</p>
        </div>
        <div className="auth-modern-top-oauth">
          {hasGoogleClientId ? (
            <GoogleSignInButton
              className="auth-modern-google"
              onSuccess={handleGoogleSuccess}
              disabled={loading}
              text="signup_with"
              theme="filled_black"
              shape="pill"
              size="large"
            />
          ) : (
            <button
              type="button"
              className="auth-modern-google-fallback"
              onClick={() =>
                setErr("Google sign-up is not configured yet. Add VITE_GOOGLE_CLIENT_ID to enable it.")
              }
            >
              Sign up with Google
            </button>
          )}
        </div>

        <div className="auth-modern-divider">
          <span>Or create account with email</span>
        </div>

        <form onSubmit={submit} className="auth-modern-form">
          <div className="auth-modern-field">
            <label className="auth-modern-label" htmlFor="name">
              Full name
            </label>
            <input
              className="auth-modern-input"
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              required
            />
          </div>

          <div className="auth-modern-field">
            <label className="auth-modern-label" htmlFor="email">
              Email
            </label>
            <input
              className="auth-modern-input"
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-modern-field">
            <label className="auth-modern-label" htmlFor="password">
              Password
            </label>
            <div className="auth-modern-password-wrap">
              <input
                className="auth-modern-input auth-modern-password-input"
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-modern-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className="auth-modern-hint">Use at least 8 characters with letters and numbers</span>
          </div>

          {err && (
            <div className="auth-modern-error" role="alert">
              {err}
            </div>
          )}

          <button type="submit" className="auth-modern-submit" disabled={!canSubmit}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="auth-modern-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
        <div className="auth-modern-legal">
          By continuing you agree to InterviewPilot Terms of Service and Privacy Policy.
        </div>
      </div>
    </div>
  );
}
