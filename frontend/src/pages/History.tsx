import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import NavHeader from "../components/NavHeader";
import "../App.css";
import { extractApiErrorMessage } from "../utils/http";

interface QAEntry {
  question: string;
  answer: string;
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  feedback?: {
    technical: number;
    clarity: number;
    completeness: number;
    overall?: number;
    suggestion: string;
    strengths?: string[];
    improvements?: string[];
  };
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface Session {
  _id: string;
  role: string;
  difficulty: string;
  questions: QAEntry[];
  startedAt: string;
  lastActivityAt: string;
}

const questionAverage = (entry: QAEntry) => {
  if (!entry.feedback) return null;
  if (typeof entry.feedback.overall === "number") {
    return entry.feedback.overall;
  }

  return (entry.feedback.technical + entry.feedback.clarity + entry.feedback.completeness) / 3;
};

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/history")
      .then((res) => setSessions(res.data.sessions || []))
      .catch((requestError: unknown) => {
        setError(extractApiErrorMessage(requestError, "Failed to load history."));
      })
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAvgScore = (questions: QAEntry[]) => {
    const scored = questions.map((entry) => questionAverage(entry)).filter((value): value is number => value !== null);
    if (scored.length === 0) return null;

    const total = scored.reduce((sum, score) => sum + score, 0);
    return total / scored.length;
  };

  return (
    <div className="dashboard-container">
      <NavHeader />
      <div className="history-page">
        <h1 className="fade-in">Interview History</h1>
        <p className="welcome-text fade-in">
          Review your past sessions, feedback details, and improvement areas.
        </p>

        {loading && (
          <div className="history-loading">
            <div className="loading-spinner" />
            <p>Loading your sessions...</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {!loading && !error && sessions.length === 0 && (
          <div className="glass-card" style={{ padding: "var(--space-2xl)", textAlign: "center" }}>
            <p style={{ color: "var(--slate-500)", marginBottom: "var(--space-lg)" }}>
              No interview sessions yet. Start practicing to build your progress log.
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
                      {avgScore !== null && <span className="history-score">Avg: {avgScore.toFixed(1)}/10</span>}
                    </div>
                    <span className="history-expand">{isExpanded ? "Collapse" : "Expand"}</span>
                  </div>
                  {isExpanded && (
                    <div className="history-card-body">
                      {session.questions.map((entry, index) => (
                        <div key={`${session._id}-${index}`} className="history-qa">
                          <div className="history-q">
                            <strong>Q{index + 1}:</strong> {entry.question}
                          </div>
                          {entry.answer && (
                            <div className="history-a">
                              <strong>Your answer:</strong> {entry.answer}
                            </div>
                          )}
                          {(typeof entry.answerDurationSec === "number" ||
                            entry.speechTranscript ||
                            entry.cameraSnapshot) && (
                            <div className="history-capture-meta">
                              {typeof entry.answerDurationSec === "number" && (
                                <span>Recorded duration: {formatDuration(entry.answerDurationSec)}</span>
                              )}
                              {entry.speechTranscript && (
                                <div className="history-transcript">
                                  <strong>Speech transcript:</strong> {entry.speechTranscript}
                                </div>
                              )}
                              {entry.cameraSnapshot && (
                                <div className="history-camera-preview">
                                  <strong>Camera snapshot:</strong>
                                  <img src={entry.cameraSnapshot} alt={`Camera snapshot for question ${index + 1}`} />
                                </div>
                              )}
                            </div>
                          )}
                          {entry.feedback && (
                            <div className="history-feedback">
                              <span>Technical: {entry.feedback.technical}/10</span>
                              <span>Clarity: {entry.feedback.clarity}/10</span>
                              <span>Completeness: {entry.feedback.completeness}/10</span>
                              {typeof entry.feedback.overall === "number" && (
                                <span>Overall: {entry.feedback.overall}/10</span>
                              )}
                              {entry.feedback.suggestion && (
                                <p className="history-suggestion">{entry.feedback.suggestion}</p>
                              )}
                              {entry.feedback.strengths && entry.feedback.strengths.length > 0 && (
                                <div className="history-detail-list">
                                  <strong>Strengths:</strong>
                                  <ul>
                                    {entry.feedback.strengths.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {entry.feedback.improvements && entry.feedback.improvements.length > 0 && (
                                <div className="history-detail-list">
                                  <strong>Improve next:</strong>
                                  <ul>
                                    {entry.feedback.improvements.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
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
