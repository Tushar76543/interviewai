import { useState, useEffect } from "react";
import api from "../services/api";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

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
  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();

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
      alert("Please write or speak your answer before submitting!");
      return;
    }

    setLoading(true);
    setFeedback(null);
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
    return <p>Your browser does not support speech recognition. Please use Chrome.</p>;
  }

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "40px auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        textAlign: "center",
        backgroundColor: "#111827",
        color: "#f9fafb",
        minHeight: "100vh",
        borderRadius: 10,
      }}
    >
      <h1 style={{ fontSize: 36, marginBottom: 10 }}>🧠 AI Interview Coach</h1>
      <p style={{ marginBottom: 20, color: "#d1d5db" }}>
        Select a role and difficulty, then start your interview!
      </p>

      {/* Select Role & Difficulty */}
      <div style={{ marginBottom: 20 }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            marginRight: 10,
            padding: 8,
            borderRadius: 6,
            backgroundColor: "#1f2937",
            color: "#f9fafb",
            border: "1px solid #374151",
          }}
        >
          <option>AI Engineer</option>
          <option>Data Scientist</option>
          <option>Web Developer</option>
          <option>Software Engineer</option>
        </select>

        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{
            marginRight: 10,
            padding: 8,
            borderRadius: 6,
            backgroundColor: "#1f2937",
            color: "#f9fafb",
            border: "1px solid #374151",
          }}
        >
          <option>Easy</option>
          <option>Medium</option>
          <option>FAANG</option>
        </select>

        <button
          onClick={startInterview}
          disabled={loading}
          style={{
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Generating..." : "Start Interview"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* ✅ Question Card */}
      {question && (
        <div
          style={{
            backgroundColor: "#f9fafb",
            color: "#111827",
            padding: 20,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            marginBottom: 20,
          }}
        >
          <h3 style={{ color: "#2563eb" }}>📝 Question</h3>
          <p style={{ fontSize: 18, lineHeight: 1.6 }}>{question.prompt}</p>

          {/* Speech Controls */}
          <div style={{ marginTop: 10 }}>
            {!listening ? (
              <button onClick={startListening} style={{ marginRight: 10 }}>
                🎤 Start Speaking
              </button>
            ) : (
              <button onClick={stopListening}>🛑 Stop</button>
            )}
          </div>

          {/* ✅ Answer Input */}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type or speak your answer here..."
            style={{
              width: "100%",
              height: 100,
              marginTop: 15,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 16,
            }}
          />

          <button
            onClick={submitAnswer}
            disabled={loading}
            style={{
              backgroundColor: "#9333ea",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: "pointer",
              marginTop: 10,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Analyzing..." : "Submit Answer"}
          </button>
        </div>
      )}

      {/* ✅ Feedback Summary */}
      {feedback && (
        <div
          style={{
            backgroundColor: "#e0f2fe",
            color: "#111827",
            padding: 20,
            borderRadius: 10,
            border: "1px solid #38bdf8",
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          <h3 style={{ color: "#0369a1" }}>🧾 Feedback Summary</h3>
          <p>🎯 <strong>Technical:</strong> {feedback.technical}/10</p>
          <p>🗣️ <strong>Clarity:</strong> {feedback.clarity}/10</p>
          <p>💡 <strong>Completeness:</strong> {feedback.completeness}/10</p>
          <p>💬 <strong>Suggestion:</strong> {feedback.suggestion}</p>
        </div>
      )}

      {/* ✅ Next Question */}
      {question && (
        <button
          onClick={nextQuestion}
          disabled={loading}
          style={{
            backgroundColor: "#16a34a",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading next..." : "Next Question ➡️"}
        </button>
      )}
    </div>
  );
}

export default Interview;
