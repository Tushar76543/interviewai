import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "../App.css";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dashboard-container">
      <div className="hero-section">
        <h1 className="fade-in">
          Welcome, {user?.name || user?.email?.split("@")[0] || "Guest"}! 👋
        </h1>
        <p className="welcome-text fade-in">
          Get ready to ace your next interview with AI-powered practice sessions
        </p>

        <button
          onClick={() => navigate("/interview")}
          className="btn-primary cta-button"
        >
          🚀 Start Interview Practice
        </button>
      </div>

      <div className="container" style={{ marginTop: "var(--spacing-2xl)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--spacing-lg)",
          }}
        >
          <div className="glass-card" style={{ padding: "var(--spacing-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--spacing-md)" }}>
              🎯
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--spacing-sm)" }}>
              Targeted Practice
            </h3>
            <p style={{ color: "var(--light-300)" }}>
              Choose from multiple roles and difficulty levels to match your goals
            </p>
          </div>

          <div className="glass-card" style={{ padding: "var(--spacing-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--spacing-md)" }}>
              🎤
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--spacing-sm)" }}>
              Voice Recognition
            </h3>
            <p style={{ color: "var(--light-300)" }}>
              Practice speaking your answers with real-time speech-to-text
            </p>
          </div>

          <div className="glass-card" style={{ padding: "var(--spacing-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--spacing-md)" }}>
              📊
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--spacing-sm)" }}>
              Instant Feedback
            </h3>
            <p style={{ color: "var(--light-300)" }}>
              Get detailed scores on technical accuracy, clarity, and completeness
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

