import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import NavHeader from "../components/NavHeader";
import "../App.css";
import Editor from "@monaco-editor/react";
import Webcam from "react-webcam";
import { extractApiErrorMessage } from "../utils/http";

interface Question {
  prompt: string;
  timeLimitSec?: number;
  category?: string;
  expectedPoints?: string[];
}

interface Feedback {
  technical: number;
  clarity: number;
  completeness: number;
  suggestion: string;
}

const ROLE_OPTIONS = [
  "AI Engineer",
  "Data Scientist",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "DevOps Engineer",
  "QA Engineer",
  "Product Manager",
  "Engineering Manager",
];

const DIFFICULTY_OPTIONS = [
  { value: "Easy", label: "Easy" },
  { value: "Medium", label: "Medium" },
  { value: "FAANG", label: "FAANG (Hard)" },
];

const CATEGORY_OPTIONS = [
  "Mixed",
  "Technical Fundamentals",
  "System Design",
  "Debugging",
  "Behavioral",
  "Project Deep Dive",
  "Communication",
  "Problem Solving",
  "Security",
  "Leadership and Ownership",
];

const MIN_RECOMMENDED_WORDS = 40;

const getWordCount = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const buildGuidedTemplate = (category: string, isTechnicalRole: boolean) => {
  const lowerCategory = category.toLowerCase();
  const looksBehavioral =
    lowerCategory.includes("behavioral") ||
    lowerCategory.includes("leadership") ||
    lowerCategory.includes("communication") ||
    lowerCategory.includes("project");

  if (looksBehavioral) {
    return ["Situation:", "Task:", "Action:", "Result:", "", "Key takeaway:"].join("\n");
  }

  if (isTechnicalRole) {
    return [
      "1) Clarify assumptions and constraints:",
      "2) Explain approach and trade-offs:",
      "3) Implementation details (data structures, APIs, or architecture):",
      "4) Edge cases and testing strategy:",
      "5) Performance and scalability considerations:",
    ].join("\n");
  }

  return ["Context:", "Approach:", "Why this works:", "Risks and trade-offs:", "Expected impact:"].join(
    "\n"
  );
};

function Interview() {
  const [role, setRole] = useState("AI Engineer");
  const [difficulty, setDifficulty] = useState("Medium");
  const [category, setCategory] = useState("Mixed");
  const [question, setQuestion] = useState<Question | null>(null);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Question[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSeed, setVoiceSeed] = useState("");

  const isBusy = isGeneratingQuestion || isSubmittingAnswer;
  const isTechnicalRole = useMemo(
    () => /(engineer|developer|ai|ml|data scientist|qa|sre|devops|architect)/i.test(role),
    [role]
  );
  const answerWordCount = useMemo(() => getWordCount(answer), [answer]);
  const answerCharCount = answer.trim().length;
  const isAnswerThin = answerWordCount > 0 && answerWordCount < MIN_RECOMMENDED_WORDS;

  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  useEffect(() => {
    if (!listening) return;
    const nextTranscript = transcript.trim();
    if (!nextTranscript) return;
    const nextAnswer = voiceSeed ? `${voiceSeed}\n${nextTranscript}` : nextTranscript;
    setAnswer(nextAnswer);
  }, [listening, transcript, voiceSeed]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice =
      window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith("en")) || null;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  const pauseSpeech = () => {
    window.speechSynthesis.pause();
    setIsSpeaking(false);
  };

  const resumeSpeech = () => {
    window.speechSynthesis.resume();
    setIsSpeaking(true);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speakNow = (text: string) => {
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    speak(text);
  };

  const startInterview = async () => {
    setIsGeneratingQuestion(true);
    setError("");
    setFeedback(null);
    setAnswer("");
    setSessionId(null);
    setHistory([]);

    try {
      const res = await api.post("/interview/start", { role, difficulty, category });
      setQuestion(res.data.question);
      setHistory([res.data.question]);
      setSessionId(res.data.sessionId || null);
      setTimeLeft(res.data.question?.timeLimitSec || null);
      if (autoSpeak) {
        speak(res.data.question.prompt);
      }
    } catch (requestError: unknown) {
      setError(extractApiErrorMessage(requestError, "Could not start interview."));
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const nextQuestion = async () => {
    setIsGeneratingQuestion(true);
    setError("");
    setFeedback(null);

    try {
      const res = await api.post("/interview/start", {
        role,
        difficulty,
        category,
        previousQuestions: history.map((item) => item.prompt),
        previousCategories: history
          .map((item) => item.category)
          .filter((item): item is string => typeof item === "string" && item.length > 0),
        sessionId,
      });
      setQuestion(res.data.question);
      setHistory((prev) => [...prev, res.data.question]);
      setSessionId(res.data.sessionId || sessionId);
      setAnswer("");
      setTimeLeft(res.data.question?.timeLimitSec || null);
      if (autoSpeak) {
        speak(res.data.question.prompt);
      }
    } catch (requestError: unknown) {
      setError(extractApiErrorMessage(requestError, "Could not generate next question."));
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const submitAnswer = useCallback(async () => {
    if (!question) return;
    if (!answer.trim()) {
      setError("Please write or speak your answer before submitting.");
      return;
    }

    setIsSubmittingAnswer(true);
    setFeedback(null);
    setError("");
    try {
      const res = await api.post("/interview/feedback", {
        role,
        question: question.prompt,
        answer,
        sessionId,
      });

      setFeedback(res.data.feedback);
      if (autoSpeak) {
        speak(
          `Scores: technical ${res.data.feedback.technical}, clarity ${res.data.feedback.clarity}, completeness ${res.data.feedback.completeness}. Suggestion: ${res.data.feedback.suggestion}`
        );
      }

      if (res.data.followUp) {
        const followUpQuestion: Question = {
          ...res.data.followUp,
          category: question.category || category,
          timeLimitSec: question.timeLimitSec || 120,
        };

        setQuestion(followUpQuestion);
        setHistory((prev) => [...prev, followUpQuestion]);
        setTimeLeft(followUpQuestion.timeLimitSec || null);
        setAnswer("");
      }
    } catch (requestError: unknown) {
      setError(extractApiErrorMessage(requestError, "Could not get feedback."));
    } finally {
      setIsSubmittingAnswer(false);
    }
  }, [answer, autoSpeak, category, question, role, sessionId, speak]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const isEditorTarget =
        target?.tagName === "TEXTAREA" || Boolean(target?.closest(".monaco-editor"));
      if (!isEditorTarget) return;

      event.preventDefault();
      if (!isSubmittingAnswer && !isGeneratingQuestion && answer.trim() && question) {
        void submitAnswer();
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [answer, isGeneratingQuestion, isSubmittingAnswer, question, submitAnswer]);

  const startListening = () => {
    setVoiceSeed(answer.trim());
    resetTranscript();
    SpeechRecognition.startListening({ continuous: true });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
  };

  const insertGuidedTemplate = () => {
    const template = buildGuidedTemplate(question?.category || category, isTechnicalRole);
    setAnswer((prev) => (prev.trim() ? `${prev}\n\n${template}` : template));
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="interview-container">
        <div className="error-message">
          Your browser does not support speech recognition. Please use Chrome.
        </div>
      </div>
    );
  }

  return (
    <div className="interview-container">
      <NavHeader />
      <div className="interview-header">
        <h1>AI Interview Coach</h1>
        <p style={{ color: "var(--slate-500)", marginTop: "var(--space-sm)" }}>
          Practice realistic interview rounds with broader categories and faster feedback.
        </p>
      </div>

      <div className="interview-controls">
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          {ROLE_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
          {DIFFICULTY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORY_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button type="button" onClick={startInterview} disabled={isBusy} className="btn-primary">
          {isGeneratingQuestion ? "Generating..." : question ? "Restart Interview" : "Start Interview"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {question && (
        <div className="question-card">
          <div className="question-card-header">
            <h3>Question</h3>
            <div className="question-utils">
              {timeLeft !== null && timeLeft > 0 && (
                <span className={`timer ${timeLeft <= 30 ? "timer-warning" : ""}`}>
                  Time {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                </span>
              )}
              <label className="toggle-speak">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(event) => setAutoSpeak(event.target.checked)}
                />
                Auto-speak
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {!isSpeaking ? (
                  <button
                    type="button"
                    onClick={() => speakNow(question.prompt)}
                    className="btn-glass btn-sm"
                    style={{ minWidth: "100px" }}
                  >
                    Play
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={pauseSpeech} className="btn-glass btn-sm">
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={stopSpeech}
                      className="btn-glass btn-sm"
                      style={{ color: "var(--danger-600)", borderColor: "var(--danger-600)" }}
                    >
                      Stop
                    </button>
                  </>
                )}
                <button type="button" onClick={resumeSpeech} className="btn-glass btn-sm">
                  Resume
                </button>
              </div>
            </div>
          </div>

          <div className="question-badges">
            <span className="category-badge">{question.category || category}</span>
            <span className="difficulty-badge">{difficulty}</span>
          </div>

          <p className="question-text">{question.prompt}</p>

          {question.expectedPoints && question.expectedPoints.length > 0 && (
            <div className="expected-points">
              <p>What interviewers usually listen for:</p>
              <ul>
                {question.expectedPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="voice-controls">
            {!listening ? (
              <button type="button" onClick={startListening} className="btn-secondary mic-button">
                Start Speaking
              </button>
            ) : (
              <button type="button" onClick={stopListening} className="mic-button listening">
                Stop Recording
              </button>
            )}
            {listening && (
              <span style={{ color: "var(--danger-600)", fontWeight: 600 }}>Recording...</span>
            )}
          </div>

          <div className="answer-area">
            <div className="answer-header">
              <label className="form-label" htmlFor="answer-input">
                Your Answer
              </label>
              <div className="answer-meta">
                <span>{answerWordCount} words</span>
                <span>{answerCharCount} chars</span>
                <span className="answer-shortcut">Shortcut: Ctrl/Cmd + Enter to submit</span>
              </div>
            </div>

            <div className="answer-toolbar">
              <button type="button" onClick={insertGuidedTemplate} className="btn-glass btn-sm">
                Insert Guided Template
              </button>
              <button type="button" onClick={() => setAnswer("")} className="btn-glass btn-sm">
                Clear Answer
              </button>
              <button
                type="button"
                onClick={() => setShowCamera((prev) => !prev)}
                className={`btn-sm ${showCamera ? "btn-secondary" : "btn-glass"}`}
              >
                {showCamera ? "Hide Camera" : "Show Camera"}
              </button>
            </div>

            {isAnswerThin && (
              <p className="answer-short-warning">
                Add a little more detail for stronger feedback. Aim for at least {MIN_RECOMMENDED_WORDS}{" "}
                words.
              </p>
            )}

            {showCamera && (
              <div
                style={{
                  marginBottom: "1rem",
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid var(--primary-600)",
                }}
              >
                <Webcam audio={false} width="100%" height={250} screenshotFormat="image/jpeg" />
              </div>
            )}

            {isTechnicalRole ? (
              <div
                style={{
                  border: "1px solid var(--slate-200)",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <Editor
                  height="320px"
                  defaultLanguage="javascript"
                  theme="vs-dark"
                  value={answer}
                  onChange={(value) => setAnswer(value || "")}
                  options={{ minimap: { enabled: false }, fontSize: 14 }}
                />
              </div>
            ) : (
              <textarea
                id="answer-input"
                className="answer-textarea"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type or speak your answer here..."
              />
            )}
          </div>

          <div className="action-buttons">
            <button
              type="button"
              onClick={submitAnswer}
              disabled={isBusy || !answer.trim()}
              className="btn-secondary"
            >
              {isSubmittingAnswer ? "Analyzing..." : "Submit Answer"}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="feedback-card">
          <h3 className="feedback-title">Feedback Summary</h3>

          <div className="score-grid">
            <div className="score-item">
              <div className="score-label">Technical</div>
              <div className="score-value">{feedback.technical}/10</div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${(feedback.technical / 10) * 100}%` }} />
              </div>
            </div>

            <div className="score-item">
              <div className="score-label">Clarity</div>
              <div className="score-value">{feedback.clarity}/10</div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${(feedback.clarity / 10) * 100}%` }} />
              </div>
            </div>

            <div className="score-item">
              <div className="score-label">Completeness</div>
              <div className="score-value">{feedback.completeness}/10</div>
              <div className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${(feedback.completeness / 10) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="suggestion-box">
            <strong style={{ color: "var(--primary-600)" }}>Suggestion:</strong>
            <p style={{ marginTop: "var(--space-sm)", color: "var(--slate-700)" }}>{feedback.suggestion}</p>
          </div>
        </div>
      )}

      {question && (
        <div className="action-buttons">
          <button type="button" onClick={nextQuestion} disabled={isBusy} className="btn-success">
            {isGeneratingQuestion ? "Loading next..." : "Next Question"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Interview;
