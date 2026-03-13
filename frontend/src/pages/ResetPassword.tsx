import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { resetPassword } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import "../App.css";
import "../styles/auth-modern.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [searchParams] = useSearchParams();
  const resetToken = (searchParams.get("token") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    !loading &&
    resetToken.length > 0 &&
    password.trim().length >= 12 &&
    confirmPassword.trim().length >= 12;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!resetToken) {
      setError("Reset token is missing. Request a new password reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await resetPassword(resetToken, password);
    if (res.success === false) {
      setError(res.message || "Password reset failed.");
      setLoading(false);
      return;
    }

    if (res.user) {
      setUser(res.user);
      navigate("/dashboard");
      return;
    }

    setLoading(false);
    navigate("/login");
  };

  return (
    <div className="auth-modern-page">
      <div className="auth-modern-card">
        <div className="auth-modern-title">
          <h1>Set New Password</h1>
          <p>Use at least 12 characters with uppercase, lowercase, number, and symbol.</p>
        </div>

        <form onSubmit={submit} className="auth-modern-form">
          <div className="auth-modern-field">
            <label className="auth-modern-label" htmlFor="password">
              New password
            </label>
            <div className="auth-modern-password-wrap">
              <input
                className="auth-modern-input auth-modern-password-input"
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 12 characters"
                autoComplete="new-password"
                minLength={12}
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

          <div className="auth-modern-field">
            <label className="auth-modern-label" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="auth-modern-password-wrap">
              <input
                className="auth-modern-input auth-modern-password-input"
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <button
                type="button"
                className="auth-modern-password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-modern-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="auth-modern-submit" disabled={!canSubmit}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <div className="auth-modern-footer">
          Back to <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}
