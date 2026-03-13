import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api, { resolveApiAssetUrl } from "../services/api";
import NavHeader from "../components/NavHeader";
import "../App.css";
import { extractApiErrorMessage } from "../utils/http";

interface QAEntry {
  question: string;
  answer: string;
  speechTranscript?: string;
  answerDurationSec?: number;
  cameraSnapshot?: string;
  recordingFileId?: string;
  recordingMimeType?: string;
  recordingSizeBytes?: number;
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

const hasRecordedAnswer = (entry: QAEntry) =>
  typeof entry.answer === "string" && entry.answer.trim().length > 0;

const questionAverage = (entry: QAEntry) => {
  if (!hasRecordedAnswer(entry)) return null;
  if (!entry.feedback) return null;
  if (typeof entry.feedback.overall === "number") {
    return entry.feedback.overall;
  }

  return (entry.feedback.technical + entry.feedback.clarity + entry.feedback.completeness) / 3;
};

const buildDirectRecordingUrl = (recordingId: string) =>
  resolveApiAssetUrl(`/api/interview/recording/${recordingId}`);

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({});
  const [recordingLoading, setRecordingLoading] = useState<Record<string, boolean>>({});
  const [recordingFailed, setRecordingFailed] = useState<Record<string, boolean>>({});
  const [recordingDirectFallback, setRecordingDirectFallback] = useState<Record<string, boolean>>({});
  const [recordingPlaybackError, setRecordingPlaybackError] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .get("/history")
      .then((res) => setSessions(res.data.sessions || []))
      .catch((requestError: unknown) => {
        setError(extractApiErrorMessage(requestError, "Failed to load history."));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!expandedId) {
      return;
    }

    const expandedSession = sessions.find((session) => session._id === expandedId);
    if (!expandedSession) {
      return;
    }

    const recordingIds = expandedSession.questions
      .map((entry) => entry.recordingFileId)
      .filter((item): item is string => typeof item === "string" && item.length > 0);

    if (recordingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const fetchSignedRecordingUrl = async (recordingId: string) => {
      if (recordingUrls[recordingId] || recordingLoading[recordingId] || recordingFailed[recordingId]) {
        return;
      }

      setRecordingLoading((prev) => ({ ...prev, [recordingId]: true }));
      try {
        const response = await api.post(
          "/interview/recording/signed-url",
          { fileId: recordingId },
          { timeout: 10000 }
        );
        const signedUrl =
          typeof response.data?.signedUrl === "string" && response.data.signedUrl.trim()
            ? resolveApiAssetUrl(response.data.signedUrl.trim())
            : "";
        if (!signedUrl) {
          throw new Error("Signed URL unavailable");
        }

        if (!cancelled) {
          setRecordingUrls((prev) => ({ ...prev, [recordingId]: signedUrl }));
        }
      } catch {
        // Keep authenticated direct stream URL fallback when signed URL fetch fails.
        if (!cancelled) {
          setRecordingFailed((prev) => ({ ...prev, [recordingId]: true }));
        }
      } finally {
        if (!cancelled) {
          setRecordingLoading((prev) => ({ ...prev, [recordingId]: false }));
        }
      }
    };

    recordingIds.forEach((recordingId) => {
      void fetchSignedRecordingUrl(recordingId);
    });

    return () => {
      cancelled = true;
    };
  }, [expandedId, recordingFailed, recordingLoading, recordingUrls, sessions]);

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

  const getRecordingUrl = (recordingId: string) => {
    if (!recordingDirectFallback[recordingId] && recordingUrls[recordingId]) {
      return recordingUrls[recordingId];
    }

    return buildDirectRecordingUrl(recordingId);
  };

  const handleRecordingPlaybackError = (recordingId: string) => {
    if (recordingUrls[recordingId] && !recordingDirectFallback[recordingId]) {
      setRecordingDirectFallback((prev) => ({ ...prev, [recordingId]: true }));
      return;
    }

    setRecordingPlaybackError((prev) => ({
      ...prev,
      [recordingId]: "Recorded video could not be loaded.",
    }));
  };

  const handleRecordingPlaybackReady = (recordingId: string) => {
    setRecordingPlaybackError((prev) => {
      if (!prev[recordingId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[recordingId];
      return next;
    });
  };

  const downloadSessionReport = (session: Session) => {
    const lines: string[] = [];
    lines.push(`# InterviewPilot Session Report`);
    lines.push(``);
    lines.push(`Role: ${session.role}`);
    lines.push(`Difficulty: ${session.difficulty}`);
    lines.push(`Last Activity: ${formatDate(session.lastActivityAt)}`);
    lines.push(`Session ID: ${session._id}`);
    lines.push(``);

    session.questions.forEach((entry, index) => {
      lines.push(`## Q${index + 1}`);
      lines.push(`Question: ${entry.question}`);
      lines.push(``);
      lines.push(`Answer:`);
      lines.push(entry.answer || "No answer recorded.");
      lines.push(``);

      if (entry.feedback && hasRecordedAnswer(entry)) {
        const overall =
          typeof entry.feedback.overall === "number"
            ? entry.feedback.overall
            : (
                (entry.feedback.technical + entry.feedback.clarity + entry.feedback.completeness) /
                3
              ).toFixed(1);

        lines.push(`Scores:`);
        lines.push(`- Technical: ${entry.feedback.technical}/10`);
        lines.push(`- Clarity: ${entry.feedback.clarity}/10`);
        lines.push(`- Completeness: ${entry.feedback.completeness}/10`);
        lines.push(`- Overall: ${overall}/10`);
        lines.push(``);

        if (entry.feedback.suggestion) {
          lines.push(`Suggestion: ${entry.feedback.suggestion}`);
          lines.push(``);
        }
      }
    });

    const report = lines.join("\n");
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interviewpilot-session-${session._id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn-glass btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadSessionReport(session);
                        }}
                      >
                        Download Report
                      </button>
                      <span className="history-expand">{isExpanded ? "Collapse" : "Expand"}</span>
                    </div>
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
                              {entry.recordingFileId && (
                                <div className="history-video-preview">
                                  <strong>Recorded video:</strong>
                                  <video
                                    key={getRecordingUrl(entry.recordingFileId)}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    crossOrigin="use-credentials"
                                    src={getRecordingUrl(entry.recordingFileId)}
                                    onLoadedMetadata={() => handleRecordingPlaybackReady(entry.recordingFileId!)}
                                    onCanPlay={() => handleRecordingPlaybackReady(entry.recordingFileId!)}
                                    onError={() => handleRecordingPlaybackError(entry.recordingFileId!)}
                                  />
                                  {recordingLoading[entry.recordingFileId] && <span>Preparing secure video...</span>}
                                  {recordingPlaybackError[entry.recordingFileId] && (
                                    <span>{recordingPlaybackError[entry.recordingFileId]}</span>
                                  )}
                                  {typeof entry.recordingSizeBytes === "number" && (
                                    <span>
                                      Size: {(entry.recordingSizeBytes / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {entry.feedback && hasRecordedAnswer(entry) && (
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
