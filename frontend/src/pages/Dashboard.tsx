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
  suggestion?: string;
}

interface SessionQuestion {
  category?: string;
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

type MetricKey = "technical" | "clarity" | "completeness";

const WEEKLY_GOAL_STORAGE_KEY = "interviewpilot:weekly-goal";
const DEFAULT_WEEKLY_GOAL = 4;

const METRIC_LABELS: Record<MetricKey, string> = {
  technical: "Technical Depth",
  clarity: "Clarity",
  completeness: "Completeness",
};

const ACTION_LIBRARY: Record<MetricKey, string[]> = {
  technical: [
    "Use one concrete architecture or code-level example in every answer.",
    "State trade-offs explicitly instead of describing only the happy path.",
    "Review fundamentals for your target role before each session.",
  ],
  clarity: [
    "Use a fixed structure: context, approach, decision, impact.",
    "Keep sentences short and avoid jumping between topics.",
    "End answers with a one-line takeaway.",
  ],
  completeness: [
    "Include edge cases, testing strategy, and failure handling.",
    "Call out constraints, assumptions, and scale expectations.",
    "Add measurable outcome or KPI impact whenever possible.",
  ],
};

const questionScore = (feedback?: FeedbackScore) => {
  if (!feedback) return null;

  if (typeof feedback.overall === "number" && Number.isFinite(feedback.overall)) {
    return feedback.overall;
  }

  return (feedback.technical + feedback.clarity + feedback.completeness) / 3;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_WEEKLY_GOAL;
    }

    const stored = Number.parseInt(window.localStorage.getItem(WEEKLY_GOAL_STORAGE_KEY) || "", 10);
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, 1, 21) : DEFAULT_WEEKLY_GOAL;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WEEKLY_GOAL_STORAGE_KEY, String(weeklyGoal));
  }, [weeklyGoal]);

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

  const scoredQuestions = useMemo(() => {
    return sessions.flatMap((session) =>
      session.questions
        .filter((entry): entry is SessionQuestion & { feedback: FeedbackScore } => Boolean(entry.feedback))
        .map((entry) => ({
          category: entry.category || "General",
          score: questionScore(entry.feedback)!,
          technical: entry.feedback.technical,
          clarity: entry.feedback.clarity,
          completeness: entry.feedback.completeness,
          suggestion: entry.feedback.suggestion || "",
          lastActivityAt: session.lastActivityAt,
        }))
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

  const weeklySessionsCount = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter((session) => new Date(session.lastActivityAt).getTime() >= sevenDaysAgo).length;
  }, [sessions]);

  const weeklyProgressPct = useMemo(() => {
    if (!weeklyGoal) return 0;
    return clamp((weeklySessionsCount / weeklyGoal) * 100, 0, 100);
  }, [weeklyGoal, weeklySessionsCount]);

  const metricSummary = useMemo(() => {
    if (scoredQuestions.length === 0) {
      return {
        technical: 0,
        clarity: 0,
        completeness: 0,
      };
    }

    const totals = scoredQuestions.reduce(
      (acc, question) => {
        acc.technical += question.technical;
        acc.clarity += question.clarity;
        acc.completeness += question.completeness;
        return acc;
      },
      { technical: 0, clarity: 0, completeness: 0 }
    );

    return {
      technical: roundToOneDecimal(totals.technical / scoredQuestions.length),
      clarity: roundToOneDecimal(totals.clarity / scoredQuestions.length),
      completeness: roundToOneDecimal(totals.completeness / scoredQuestions.length),
    };
  }, [scoredQuestions]);

  const weakestMetric = useMemo<MetricKey>(() => {
    const candidates: Array<{ key: MetricKey; score: number }> = [
      { key: "technical", score: metricSummary.technical },
      { key: "clarity", score: metricSummary.clarity },
      { key: "completeness", score: metricSummary.completeness },
    ];

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].key;
  }, [metricSummary]);

  const strongestMetric = useMemo<MetricKey>(() => {
    const candidates: Array<{ key: MetricKey; score: number }> = [
      { key: "technical", score: metricSummary.technical },
      { key: "clarity", score: metricSummary.clarity },
      { key: "completeness", score: metricSummary.completeness },
    ];

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].key;
  }, [metricSummary]);

  const categoryInsights = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();

    for (const entry of scoredQuestions) {
      const current = map.get(entry.category) || { total: 0, count: 0 };
      current.total += entry.score;
      current.count += 1;
      map.set(entry.category, current);
    }

    return [...map.entries()]
      .map(([category, value]) => ({
        category,
        average: roundToOneDecimal(value.total / value.count),
        attempts: value.count,
      }))
      .sort((a, b) => a.average - b.average);
  }, [scoredQuestions]);

  const weakestCategory = categoryInsights[0];

  const readinessScore = useMemo(() => {
    if (scoredQuestions.length === 0) {
      return 0;
    }

    const averages = scoredQuestions.map((entry) => entry.score);
    const mean = averages.reduce((sum, value) => sum + value, 0) / averages.length;
    const variance = averages.reduce((sum, value) => sum + (value - mean) ** 2, 0) / averages.length;
    const stdDev = Math.sqrt(variance);

    const consistencyScore = clamp(10 - stdDev * 1.6, 0, 10);
    const volumeScore = clamp((weeklySessionsCount / Math.max(weeklyGoal, 1)) * 10, 0, 10);
    const finalTenScale = mean * 0.58 + consistencyScore * 0.2 + volumeScore * 0.22;

    return Math.round(clamp(finalTenScale, 0, 10) * 10);
  }, [scoredQuestions, weeklyGoal, weeklySessionsCount]);

  const focusActions = useMemo(() => {
    const baseActions = [...ACTION_LIBRARY[weakestMetric]];

    if (weakestCategory) {
      baseActions.unshift(
        `Prioritize ${weakestCategory.category} this week. Current average is ${weakestCategory.average}/10 across ${weakestCategory.attempts} attempts.`
      );
    }

    return baseActions.slice(0, 4);
  }, [weakestCategory, weakestMetric]);

  return (
    <div className="dashboard-container">
      <NavHeader />
      <div className="hero-section">
        <h1 className="fade-in">Welcome, {user?.name || user?.email?.split("@")[0] || "Candidate"}</h1>
        <p className="welcome-text fade-in">
          InterviewPilot turns each mock interview into an action plan you can execute this week.
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

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ color: "var(--primary-600)", marginBottom: "var(--space-xs)" }}>Readiness</h3>
            <p style={{ color: "var(--slate-800)", fontSize: "1.8rem", fontWeight: 700 }}>
              {readinessScore}/100
            </p>
            <p style={{ color: "var(--slate-500)" }}>Interview readiness index</p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "var(--space-lg)",
            marginBottom: "var(--space-2xl)",
          }}
        >
          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <h2 style={{ marginBottom: "var(--space-sm)", color: "var(--slate-800)" }}>Weekly Goal</h2>
            <p style={{ color: "var(--slate-500)", marginBottom: "var(--space-md)" }}>
              Keep a consistent cadence to improve faster.
            </p>
            <p style={{ color: "var(--slate-700)", fontWeight: 700 }}>
              {weeklySessionsCount}/{weeklyGoal} sessions this week
            </p>
            <div className="score-bar" style={{ marginTop: "var(--space-sm)" }}>
              <div className="score-fill" style={{ width: `${weeklyProgressPct}%` }} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "var(--space-md)" }}>
              <button
                type="button"
                className="btn-glass btn-sm"
                onClick={() => setWeeklyGoal((prev) => clamp(prev - 1, 1, 21))}
              >
                - Goal
              </button>
              <button
                type="button"
                className="btn-glass btn-sm"
                onClick={() => setWeeklyGoal((prev) => clamp(prev + 1, 1, 21))}
              >
                + Goal
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <h2 style={{ marginBottom: "var(--space-sm)", color: "var(--slate-800)" }}>Personalized Action Plan</h2>
            <p style={{ color: "var(--slate-500)", marginBottom: "var(--space-sm)" }}>
              Weakest area: <strong style={{ color: "var(--danger-600)" }}>{METRIC_LABELS[weakestMetric]}</strong>
            </p>
            <p style={{ color: "var(--slate-500)", marginBottom: "var(--space-md)" }}>
              Strongest area: <strong style={{ color: "var(--success-600)" }}>{METRIC_LABELS[strongestMetric]}</strong>
            </p>
            <ul style={{ margin: 0, paddingLeft: "1rem", color: "var(--slate-600)" }}>
              {focusActions.map((item) => (
                <li key={item} style={{ marginBottom: "0.35rem" }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ padding: "var(--space-xl)" }}>
            <h2 style={{ marginBottom: "var(--space-sm)", color: "var(--slate-800)" }}>Category Performance</h2>
            {categoryInsights.length === 0 ? (
              <p style={{ color: "var(--slate-500)" }}>
                Complete at least one evaluated answer to unlock category insights.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {categoryInsights.slice(0, 5).map((item) => (
                  <div key={item.category}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.3rem",
                      }}
                    >
                      <span style={{ color: "var(--slate-600)", fontSize: "0.9rem" }}>{item.category}</span>
                      <span style={{ color: "var(--slate-500)", fontSize: "0.86rem" }}>
                        {item.average}/10 ({item.attempts})
                      </span>
                    </div>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${item.average * 10}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "var(--space-xl)" }}>
          <h2 style={{ marginBottom: "var(--space-lg)", color: "var(--slate-800)" }}>Performance Trend</h2>

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
