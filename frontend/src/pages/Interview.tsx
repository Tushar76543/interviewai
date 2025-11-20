import { useState, useEffect } from "react";
import api from "../services/api";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import "../App.css";

function Interview() {
  const [role, setRole] = useState("AI Engineer");
  const [difficulty, setDifficulty] = useState("Medium");
  const [question, setQuestion] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<any>(null);

  // 🎙️ Voice recognition setup
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) setAnswer(transcript); // auto-fill answer with speech text
  }, [transcript]);

  // 🗣️ Speak text aloud (question/feedback)
  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice =
      speechSynthesis.getVoices().find((v) => v.lang.startsWith("en")) || null;
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  };

  // ✅ Start interview
  const startInterview = async () => {
    setLoading(true);
    setError("");
    setFeedback(null);
    setAnswer("");
    try {
      const res = await api.post("/api/interview/start", { role, difficulty });
      setQuestion(res.data.question);
      setHistory([res.data.question]);
      speak(res.data.question.prompt); // 🔊 speak new question
    } catch (err: any) {
      console.error(err);
      setError("❌ Could not start interview. Please check backend.");
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
      const res = await api.post("/api/interview/start", {
        role,
        difficulty,
        previousQuestions: history.map((q) => q.prompt),
      });
      setQuestion(res.data.question);
      setHistory((prev) => [...prev, res.data.question]);
      setAnswer("");
      speak(res.data.question.prompt); // 🔊 speak next question
    } catch (err: any) {
      console.error(err);
      setError("❌ Could not generate next question. Please check backend.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Submit answer → get feedback + follow-up
  const submitAnswer = async () => {
    if (!answer.trim()) {
      setError("Please write or speak your answer before submitting!");
      return;
    }

    setLoading(true);
    setFeedback(null);
    setError("");
    try {
      const res = await api.post("/api/interview/feedback", {
        role,
        question: question.prompt,
        answer,
      });

      setFeedback(res.data.feedback);
      speak(
        `Your scores are: Technical ${res.data.feedback.technical}, Clarity ${res.data.feedback.clarity}, Completeness ${res.data.feedback.completeness}. Suggestion: ${res.data.feedback.suggestion}`
      ); // 🔊 speak feedback summary

      if (res.data.followUp) {
        setQuestion(res.data.followUp);
        setHistory((prev) => [...prev, res.data.followUp]);
      }
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
      <div className="interview-header">
        <h1>🧠 AI Interview Coach</h1>
        <p style={{ color: "var(--light-300)", marginTop: "var(--spacing-sm)" }}>
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
          <h3 style={{ color: "var(--primary-700)", marginBottom: "var(--spacing-md)" }}>
            📝 Question
          </h3>
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
            <textarea
              id="answer-input"
              className="answer-textarea"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type or speak your answer here..."
            />
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
            <p style={{ marginTop: "var(--spacing-xs)", color: "var(--light-200)" }}>
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

