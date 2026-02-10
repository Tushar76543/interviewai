import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import NavHeader from "../components/NavHeader";
import "../App.css";

interface QAEntry {
  question: string;
  answer: string;
  feedback?: {
    technical: number;
    clarity: number;
    completeness: number;
    suggestion: string;
  };
}

interface Session {
  _id: string;
  role: string;
  difficulty: string;
  questions: QAEntry[];
  startedAt: string;
  lastActivityAt: string;
}

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/history")
      .then((res) => setSessions(res.data.sessions || []))
      .catch((err) => {
        setError(err.response?.data?.error || "Failed to load history.");
      })
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAvgScore = (questions: QAEntry[]) => {
    const withFeedback = questions.filter((q) => q.feedback);
    if (withFeedback.length === 0) return null;
    const total = withFeedback.reduce(
      (sum, q) =>
        sum +
        (q.feedback!.technical + q.feedback!.clarity + q.feedback!.completeness) / 3,
      0
    );
    return total / withFeedback.length;
  };

  return (
    <div className="dashboard-container">
      <NavHeader />
      <div className="history-page">
        <h1 className="fade-in">📊 Interview History</h1>
        <p className="welcome-text fade-in">
          Review your past practice sessions and track your progress
        </p>

        {loading && (
          <div className="history-loading">
            <div className="loading-spinner" />
            <p>Loading your sessions...</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {!loading && !error && sessions.length === 0 && (
          <div className="glass-card" style={{ padding: "var(--spacing-2xl)", textAlign: "center" }}>
            <p style={{ color: "var(--light-300)", marginBottom: "var(--spacing-lg)" }}>
              No interview sessions yet. Start practicing to see your history here!
            </p>
            <Link to="/interview" className="btn-primary">
              Start Interview
            </Link>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="history-list">
            {sessions.map((session) => {
              const avgScore = getAvgScore(session.questions);
              const isExpanded = expandedId === session._id;
              return (
                <div key={session._id} className="glass-card history-card">
                  <div
                    className="history-card-header"
                    onClick={() => setExpandedId(isExpanded ? null : session._id)}
                  >
                    <div className="history-card-meta">
                      <span className="history-role">{session.role}</span>
                      <span className="history-difficulty">{session.difficulty}</span>
                      <span className="history-date">{formatDate(session.lastActivityAt)}</span>
                      {avgScore !== null && (
                        <span className="history-score">
                          Avg: {avgScore.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                    <span className="history-expand">{isExpanded ? "▼" : "▶"}</span>
                  </div>
                  {isExpanded && (
                    <div className="history-card-body">
                      {session.questions.map((q, i) => (
                        <div key={i} className="history-qa">
                          <div className="history-q">
                            <strong>Q{i + 1}:</strong> {q.question}
                          </div>
                          {q.answer && (
                            <div className="history-a">
                              <strong>Your answer:</strong> {q.answer}
                            </div>
                          )}
                          {q.feedback && (
                            <div className="history-feedback">
                              <span>Technical: {q.feedback.technical}/10</span>
                              <span>Clarity: {q.feedback.clarity}/10</span>
                              <span>Completeness: {q.feedback.completeness}/10</span>
                              {q.feedback.suggestion && (
                                <p className="history-suggestion">{q.feedback.suggestion}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
