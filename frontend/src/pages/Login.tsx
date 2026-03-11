import { useCallback, useState } from "react";
import { login, googleLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { Eye, EyeOff } from "lucide-react";
import "../App.css";
import "../styles/auth-modern.css";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const hasGoogleClientId = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim());
  const canSubmit = email.trim().length > 0 && password.trim().length > 0 && !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErr("");

    const res = await login(email.trim(), password);

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
    <div className="auth-modern-page">
      <div className="auth-modern-card">
        <div className="auth-modern-title">
          <h1>Welcome Back</h1>
          <p>Sign in to continue to InterviewAI</p>
        </div>

        <form onSubmit={submit} className="auth-modern-form">
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
            <div className="auth-modern-label-row">
              <label className="auth-modern-label" htmlFor="password">
                Password
              </label>
              <a
                className="auth-modern-inline-link"
                href="mailto:support@interviewai.app?subject=Password%20reset%20request"
              >
                Forgot your password?
              </a>
            </div>
            <div className="auth-modern-password-wrap">
              <input
                className="auth-modern-input auth-modern-password-input"
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
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
          </div>

          {err && (
            <div className="auth-modern-error" role="alert">
              {err}
            </div>
          )}

          <button type="submit" className="auth-modern-submit" disabled={!canSubmit}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {hasGoogleClientId && (
          <>
            <div className="auth-modern-divider">
              <span>Or</span>
            </div>
            <GoogleSignInButton
              className="auth-modern-google"
              onSuccess={handleGoogleSuccess}
              disabled={loading}
              text="signin_with"
              theme="filled_black"
              shape="pill"
              size="large"
            />
          </>
        )}

        <div className="auth-modern-footer">
          You don't have an account? <Link to="/signup">Sign up</Link>
        </div>
        <div className="auth-modern-legal">
          By continuing you agree to InterviewAI Terms of Service and Privacy Policy.
        </div>
      </div>
    </div>
  );
}
