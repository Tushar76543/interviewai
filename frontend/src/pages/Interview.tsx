import { useState, useEffect } from "react";
import api from "../services/api";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import NavHeader from "../components/NavHeader";
import "../App.css";
import Editor from "@monaco-editor/react";
import Webcam from "react-webcam";


interface Question {
  prompt: string;
  timeLimitSec?: number;
}

interface Feedback {
  technical: number;
  clarity: number;
  completeness: number;
  suggestion: string;
}

function Interview() {
  const [role, setRole] = useState("AI Engineer");
  const [difficulty, setDifficulty] = useState("Medium");
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Question[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track if AI is speaking

  const isTechnicalRole = ["Software Engineer", "Web Developer", "AI Engineer", "Data Scientist"].includes(role);

  // 🎙️ Voice recognition setup
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  // ⏱️ Timer Countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  useEffect(() => {
    if (transcript) setAnswer(transcript); // auto-fill answer with speech text
  }, [transcript]);

  // 🗣️ Speak text aloud (question/feedback)
  const speak = (text: string) => {
    window.speechSynthesis.cancel(); // Stop any previous speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice =
      window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en")) || null;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);


    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeech = () => {
    window.speechSynthesis.pause();
    setIsSpeaking(false);
  }

  const resumeSpeech = () => {
    window.speechSynthesis.resume();
    setIsSpeaking(true);
  }

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  // 🔊 Helper to ensure speak is called correctly, now handles toggle
  const speakNow = (text: string) => {
    if (isSpeaking) {
      stopSpeech();
    } else {
      speak(text);
    }
  };

  // ✅ Start interview
  const startInterview = async () => {
    setLoading(true);
    setError("");
    setFeedback(null);
    setAnswer("");
    setSessionId(null);
    try {
      const res = await api.post("/interview/start", { role, difficulty });
      setQuestion(res.data.question);
      setHistory([res.data.question]);
      setSessionId(res.data.sessionId || null);
      setTimeLeft(res.data.question?.timeLimitSec || null);
      if (autoSpeak) {
        speak(res.data.question.prompt);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || "❌ Could not start interview. Please check backend.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Get next question (avoid repeats)
  const nextQuestion = async () => {
    setLoading(true);
    setError("");
    setFeedback(null);
    try {
      const res = await api.post("/interview/start", {
        role,
        difficulty,
        previousQuestions: history.map((q) => q.prompt),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || "❌ Could not generate next question. Please check backend.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Submit answer → get feedback + follow-up
  const submitAnswer = async () => {
    if (!question) return;
    if (!answer.trim()) {
      setError("Please write or speak your answer before submitting!");
      return;
    }

    setLoading(true);
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
          `Your scores are: Technical ${res.data.feedback.technical}, Clarity ${res.data.feedback.clarity}, Completeness ${res.data.feedback.completeness}. Suggestion: ${res.data.feedback.suggestion}`
        );
      }

      if (res.data.followUp) {
        setQuestion(res.data.followUp);
        setHistory((prev) => [...prev, res.data.followUp]);
        setTimeLeft(res.data.followUp?.timeLimitSec || null);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError("❌ Could not get feedback. Please check backend.");
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    resetTranscript();
    SpeechRecognition.startListening({ continuous: true });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
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
        <h1>🧠 AI Interview Coach</h1>
        <p style={{ color: "var(--slate-500)", marginTop: "var(--space-sm)" }}>
          Practice interviews and get instant AI-powered feedback
        </p>
      </div>

      {/* Interview Controls */}
      <div className="interview-controls">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ flex: "1 1 auto", minWidth: "150px" }}
        >
          <option>AI Engineer</option>
          <option>Data Scientist</option>
          <option>Web Developer</option>
          <option>Software Engineer</option>
        </select>

        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{ flex: "1 1 auto", minWidth: "120px" }}
        >
          <option>Easy</option>
          <option>Medium</option>
          <option>FAANG</option>
        </select>

        <button
          onClick={startInterview}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Generating..." : question ? "New Interview" : "Start Interview"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Question Card */}
      {question && (
        <div className="question-card">
          <div className="question-card-header">
            <h3 style={{ color: "var(--primary-700)", marginBottom: "var(--spacing-md)" }}>
              📝 Question
            </h3>
            <div className="question-utils">
              {timeLeft !== null && timeLeft > 0 && (
                <span className={`timer ${timeLeft <= 30 ? "timer-warning" : ""}`}>
                  ⏱️ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                </span>
              )}
              <label className="toggle-speak">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                />
                🔊 Auto-speak
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {!isSpeaking ? (
                  <button
                    type="button"
                    onClick={() => speakNow(question.prompt)}
                    className="btn-glass btn-sm"
                    style={{ minWidth: "100px" }}
                  >
                    🔊 Play
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={pauseSpeech}
                      className="btn-glass btn-sm"
                    >
                      ⏸️ Pause
                    </button>
                    <button
                      type="button"
                      onClick={stopSpeech}
                      className="btn-glass btn-sm"
                      style={{ color: "var(--danger-600)", borderColor: "var(--danger-600)" }}
                    >
                      ⏹️ Stop
                    </button>
                  </>
                )}
                <button type="button" onClick={resumeSpeech} className="btn-glass btn-sm">▶️ Resume</button>
              </div>
            </div>
          </div>
          <p className="question-text">{question.prompt}</p>

          {/* Voice Controls */}
          <div className="voice-controls">
            {!listening ? (
              <button
                onClick={startListening}
                className="btn-secondary mic-button"
              >
                🎤 Start Speaking
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="mic-button listening"
              >
                🛑 Stop Recording
              </button>
            )}
            {listening && (
              <span style={{ color: "var(--danger-600)", fontWeight: 600 }}>
                Recording...
              </span>
            )}
          </div>

          {/* Answer Input */}
          <div className="answer-area">
            <label className="form-label" htmlFor="answer-input">
              Your Answer
            </label>
            <div style={{ marginBottom: "1rem" }}>
              <button
                onClick={() => setShowCamera(!showCamera)}
                className={`btn-sm ${showCamera ? "btn-secondary" : "btn-glass"}`}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {showCamera ? "❌ Hide Camera" : "📹 Show Camera"}
              </button>
            </div>

            {showCamera && (
              <div style={{ marginBottom: "1rem", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--primary-600)" }}>
                <Webcam audio={false} width="100%" height={250} screenshotFormat="image/jpeg" />
              </div>
            )}

            {isTechnicalRole ? (
              <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", overflow: "hidden" }}>
                <Editor
                  height="300px"
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
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type or speak your answer here..."
              />
            )}
          </div>

          <div className="action-buttons">
            <button
              onClick={submitAnswer}
              disabled={loading}
              className="btn-secondary"
            >
              {loading ? "Analyzing..." : "Submit Answer"}
            </button>
          </div>
        </div>
      )}

      {/* Feedback Card */}
      {feedback && (
        <div className="feedback-card">
          <h3 className="feedback-title">🧾 Feedback Summary</h3>

          <div className="score-grid">
            <div className="score-item">
              <div className="score-label">🎯 Technical</div>
              <div className="score-value">{feedback.technical}/10</div>
              <div className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${(feedback.technical / 10) * 100}%` }}
                />
              </div>
            </div>

            <div className="score-item">
              <div className="score-label">🗣️ Clarity</div>
              <div className="score-value">{feedback.clarity}/10</div>
              <div className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${(feedback.clarity / 10) * 100}%` }}
                />
              </div>
            </div>

            <div className="score-item">
              <div className="score-label">💡 Completeness</div>
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
            <strong style={{ color: "var(--primary-600)" }}>💬 Suggestion:</strong>
            <p style={{ marginTop: "var(--space-sm)", color: "var(--slate-700)" }}>
              {feedback.suggestion}
            </p>
          </div>
        </div>
      )}

      {/* Next Question Button */}
      {question && (
        <div className="action-buttons">
          <button
            onClick={nextQuestion}
            disabled={loading}
            className="btn-success"
          >
            {loading ? "Loading next..." : "Next Question ➡️"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Interview;

