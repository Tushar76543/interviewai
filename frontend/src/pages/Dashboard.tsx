import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import NavHeader from "../components/NavHeader";
import "../App.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Mock data for the chart (replace with real history later)
  const data = [
    { name: 'Session 1', score: 6 },
    { name: 'Session 2', score: 7.5 },
    { name: 'Session 3', score: 5 },
    { name: 'Session 4', score: 8 },
    { name: 'Session 5', score: 8.5 },
  ];

  return (
    <div className="dashboard-container">
      <NavHeader />
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

      <div className="container" style={{ marginTop: "var(--space-2xl)" }}>
        {/* Stats Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-lg)",
            marginBottom: "var(--space-2xl)"
          }}
        >
          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-md)" }}>
              🎯
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-sm)" }}>
              Targeted Practice
            </h3>
            <p style={{ color: "var(--slate-500)" }}>
              Choose from multiple roles and difficulty levels to match your goals
            </p>
          </div>

          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-md)" }}>
              🎤
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-sm)" }}>
              Voice Recognition
            </h3>
            <p style={{ color: "var(--slate-500)" }}>
              Practice speaking your answers with real-time speech-to-text
            </p>
          </div>

          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-md)" }}>
              📊
            </div>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-sm)" }}>
              Instant Feedback
            </h3>
            <p style={{ color: "var(--slate-500)" }}>
              Get detailed scores on technical accuracy, clarity, and completeness
            </p>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="card" style={{ padding: "var(--space-xl)" }}>
          <h2 style={{ marginBottom: "var(--space-lg)", color: "var(--slate-800)" }}>
            📈 Performance Trends
          </h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--slate-200)" />
                <XAxis dataKey="name" stroke="var(--slate-400)" />
                <YAxis domain={[0, 10]} stroke="var(--slate-400)" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--white)', border: '1px solid var(--slate-200)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--slate-700)' }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--primary-600)"
                  strokeWidth={3}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

