import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";
import "../App.css";
import "../styles/auth-modern.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetUrl, setResetUrl] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    setResetUrl("");

    const res = await forgotPassword(email.trim());
    if (res.success === false) {
      setError(res.message || "Unable to process your request.");
      setLoading(false);
      return;
    }

    setNotice(
      res.message ||
        "If an account exists for this email, password reset instructions were sent."
    );
    if (typeof res.resetUrl === "string" && res.resetUrl.trim()) {
      setResetUrl(res.resetUrl.trim());
    }
    setLoading(false);
  };

  return (
    <div className="auth-modern-page">
      <div className="auth-modern-card">
        <div className="auth-modern-title">
          <h1>Reset Password</h1>
          <p>Enter your account email to receive a reset link.</p>
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

          {error && (
            <div className="auth-modern-error" role="alert">
              {error}
            </div>
          )}

          {notice && <div className="notice-message">{notice}</div>}

          {resetUrl && (
            <div className="notice-message">
              Development reset link:{" "}
              <a href={resetUrl} target="_blank" rel="noreferrer">
                Open reset page
              </a>
            </div>
          )}

          <button
            type="submit"
            className="auth-modern-submit"
            disabled={loading || email.trim().length === 0}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="auth-modern-footer">
          Remembered your password? <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
