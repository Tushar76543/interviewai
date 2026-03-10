import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import NavHeader from "../components/NavHeader";
import api from "../services/api";
import { extractApiErrorMessage } from "../utils/http";
import "../App.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface FeedbackScore {
  technical: number;
  clarity: number;
  completeness: number;
  overall?: number;
}

interface SessionQuestion {
  feedback?: FeedbackScore;
}

interface SessionRecord {
  _id: string;
  role: string;
  difficulty: string;
  questions: SessionQuestion[];
  lastActivityAt: string;
}

interface TrendPoint {
  label: string;
  score: number;
  role: string;
  difficulty: string;
  date: string;
}

const questionScore = (feedback?: FeedbackScore) => {
  if (!feedback) return null;

  if (typeof feedback.overall === "number" && Number.isFinite(feedback.overall)) {
    return feedback.overall;
  }

  return (feedback.technical + feedback.clarity + feedback.completeness) / 3;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    api
      .get("/history")
      .then((res) => {
        if (!active) return;
        setSessions(Array.isArray(res.data.sessions) ? res.data.sessions : []);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(extractApiErrorMessage(requestError, "Failed to load performance trends."));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const scoredSessions = useMemo(() => {
    return sessions
      .map((session) => {
        const scores = session.questions
          .map((entry) => questionScore(entry.feedback))
          .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

        if (scores.length === 0) {
          return null;
        }

        const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

        return {
          ...session,
          averageScore,
          scoredQuestionCount: scores.length,
        };
      })
      .filter(
        (
          item
        ): item is SessionRecord & {
          averageScore: number;
          scoredQuestionCount: number;
        } => item !== null
      );
  }, [sessions]);

  const trendData = useMemo<TrendPoint[]>(() => {
    const sorted = [...scoredSessions].sort(
      (a, b) => new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
    );

    return sorted.map((session, index) => ({
      label: `Session ${index + 1}`,
      score: Number(session.averageScore.toFixed(1)),
      role: session.role,
      difficulty: session.difficulty,
      date: new Date(session.lastActivityAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [scoredSessions]);

  const stats = useMemo(() => {
    const answeredQuestions = scoredSessions.reduce((sum, session) => sum + session.scoredQuestionCount, 0);

    if (scoredSessions.length === 0) {
      return {
        totalSessions: sessions.length,
        answeredQuestions,
        averageScore: 0,
        trendDelta: 0,
      };
    }

    const overallAverage =
      scoredSessions.reduce((sum, session) => sum + session.averageScore, 0) / scoredSessions.length;

    const first = trendData[0]?.score ?? overallAverage;
    const last = trendData[trendData.length - 1]?.score ?? overallAverage;

    return {
      totalSessions: sessions.length,
      answeredQuestions,
      averageScore: Number(overallAverage.toFixed(1)),
      trendDelta: Number((last - first).toFixed(1)),
    };
  }, [scoredSessions, sessions.length, trendData]);

  return (
    <div className="dashboard-container">
      <NavHeader />
      <div className="hero-section">
        <h1 className="fade-in">Welcome, {user?.name || user?.email?.split("@")[0] || "Guest"}</h1>
        <p className="welcome-text fade-in">
          Build interview confidence through realistic practice and measurable progress.
        </p>

        <button onClick={() => navigate("/interview")} className="btn-primary cta-button">
          Start Interview Practice
        </button>
      </div>

      <div className="container" style={{ marginTop: "var(--space-2xl)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--space-lg)",
            marginBottom: "var(--space-2xl)",
          }}
        >
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-xs)" }}>Sessions</h3>
            <p style={{ color: "var(--slate-800)", fontSize: "1.8rem", fontWeight: 700 }}>
              {stats.totalSessions}
            </p>
            <p style={{ color: "var(--slate-500)" }}>Total interview sessions</p>
          </div>

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-xs)" }}>Answers</h3>
            <p style={{ color: "var(--slate-800)", fontSize: "1.8rem", fontWeight: 700 }}>
              {stats.answeredQuestions}
            </p>
            <p style={{ color: "var(--slate-500)" }}>Evaluated responses</p>
          </div>

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-xs)" }}>Average Score</h3>
            <p style={{ color: "var(--slate-800)", fontSize: "1.8rem", fontWeight: 700 }}>
              {stats.averageScore.toFixed(1)}/10
            </p>
            <p style={{ color: "var(--slate-500)" }}>Across scored sessions</p>
          </div>

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-xs)" }}>Trend</h3>
            <p
              style={{
                color: stats.trendDelta >= 0 ? "var(--success-600)" : "var(--danger-600)",
                fontSize: "1.8rem",
                fontWeight: 700,
              }}
            >
              {stats.trendDelta > 0 ? "+" : ""}
              {stats.trendDelta.toFixed(1)}
            </p>
            <p style={{ color: "var(--slate-500)" }}>Change from first scored session</p>
          </div>
        </div>

        <div className="card" style={{ padding: "var(--space-xl)" }}>
          <h2 style={{ marginBottom: "var(--space-lg)", color: "var(--slate-800)" }}>Performance Trends</h2>

          {loading && <p style={{ color: "var(--slate-500)" }}>Loading performance data...</p>}

          {!loading && error && <div className="error-message">{error}</div>}

          {!loading && !error && trendData.length === 0 && (
            <p style={{ color: "var(--slate-500)" }}>
              Complete at least one scored answer to unlock your trend chart.
            </p>
          )}

          {!loading && !error && trendData.length > 0 && (
            <div style={{ height: "320px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--slate-200)" />
                  <XAxis dataKey="label" stroke="var(--slate-400)" />
                  <YAxis domain={[0, 10]} stroke="var(--slate-400)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--white)",
                      border: "1px solid var(--slate-200)",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}/10`, "Average Score"]}
                    labelFormatter={(label: string, payload) => {
                      const entry = payload && payload.length > 0 ? (payload[0].payload as TrendPoint) : null;
                      if (!entry) return label;
                      return `${entry.date} | ${entry.role} | ${entry.difficulty}`;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--primary-600)"
                    strokeWidth={3}
                    activeDot={{ r: 7 }}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
