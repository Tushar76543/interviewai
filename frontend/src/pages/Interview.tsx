import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  overall?: number;
  suggestion: string;
  strengths?: string[];
  improvements?: string[];
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

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const formatElapsedTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const normalizeMultiline = (value: string) => value.replace(/\r/g, "").trim();

const mergeDictationText = (currentAnswer: string, spokenText: string) => {
  const trimmedCurrent = currentAnswer.trim();
  const trimmedSpoken = spokenText.trim();

  if (!trimmedSpoken) {
    return currentAnswer;
  }

  if (!trimmedCurrent) {
    return trimmedSpoken;
  }

  const normalizedCurrent = trimmedCurrent.toLowerCase();
  const normalizedSpoken = trimmedSpoken.toLowerCase();

  if (normalizedCurrent.endsWith(normalizedSpoken)) {
    return currentAnswer;
  }

  return `${trimmedCurrent}\n${trimmedSpoken}`;
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
  const [showCamera, setShowCamera] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [lastAnswerDurationSec, setLastAnswerDurationSec] = useState<number | null>(null);
  const [templateNotice, setTemplateNotice] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");

  const isBusy = isGeneratingQuestion || isSubmittingAnswer;
  const isTechnicalRole = useMemo(
    () => /(engineer|developer|ai|ml|data scientist|qa|sre|devops|architect)/i.test(role),
    [role]
  );
  const answerWordCount = useMemo(() => getWordCount(answer), [answer]);
  const answerCharCount = answer.trim().length;
  const isAnswerThin = answerWordCount > 0 && answerWordCount < MIN_RECOMMENDED_WORDS;

  const {
    transcript,
    finalTranscript,
    interimTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();
  const transcriptRef = useRef("");

  const combinedTranscript = useMemo(() => {
    const fullTranscript = [finalTranscript, interimTranscript]
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(" ")
      .trim();

    return fullTranscript || transcript.trim();
  }, [finalTranscript, interimTranscript, transcript]);
  const questionPrompt = question?.prompt ?? "";

  const answerChecklist = useMemo(() => {
    const lowerAnswer = answer.toLowerCase();

    return [
      {
        label: "Clear structure",
        done: /(first|second|finally|step|approach|situation|task|action|result)/i.test(answer),
      },
      {
        label: "Concrete example or metric",
        done: /(\d+%|\d+\s?(ms|s|sec|minutes|hours|days)|metric|impact|result|kpi)/i.test(lowerAnswer),
      },
      {
        label: "Trade-offs or alternatives",
        done: /(trade\s?-?off|alternative|pros|cons|risk|decision)/i.test(lowerAnswer),
      },
      {
        label: "Validation or testing",
        done: /(test|monitor|validate|rollback|edge case|quality)/i.test(lowerAnswer),
      },
    ];
  }, [answer]);

  const checklistDoneCount = answerChecklist.filter((item) => item.done).length;

  useEffect(() => {
    transcriptRef.current = combinedTranscript;
    if (listening) {
      setLiveTranscript(combinedTranscript);
    }
  }, [combinedTranscript, listening]);

  useEffect(() => {
    if (!question || !timerRunning) return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [question, timerRunning]);

  useEffect(() => {
    if (!questionPrompt) {
      setElapsedSeconds(0);
      setTimerRunning(false);
      return;
    }

    setElapsedSeconds(0);
    setTimerRunning(true);
    setTemplateNotice("");
    setVoiceError("");
    setLiveTranscript("");
    resetTranscript();
  }, [questionPrompt, resetTranscript]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      SpeechRecognition.abortListening();
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
    setTemplateNotice("");
    setVoiceError("");
    setLiveTranscript("");
    setElapsedSeconds(0);
    setLastAnswerDurationSec(null);

    try {
      const res = await api.post("/interview/start", { role, difficulty, category });
      setQuestion(res.data.question);
      setHistory([res.data.question]);
      setSessionId(res.data.sessionId || null);
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
    setTemplateNotice("");
    setVoiceError("");
    setLiveTranscript("");
    setLastAnswerDurationSec(null);

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

    if (listening) {
      setError("Stop recording first so your full transcript is captured.");
      return;
    }

    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      setError("Please write or speak your answer before submitting.");
      return;
    }

    setIsSubmittingAnswer(true);
    setFeedback(null);
    setError("");
    setTemplateNotice("");
    setTimerRunning(false);
    setLastAnswerDurationSec(elapsedSeconds);

    try {
      const res = await api.post("/interview/feedback", {
        role,
        question: question.prompt,
        answer: trimmedAnswer,
        expectedPoints: question.expectedPoints || [],
        sessionId,
      });

      const nextFeedback = res.data.feedback as Feedback;
      const overallFromScores = roundToOneDecimal(
        (nextFeedback.technical + nextFeedback.clarity + nextFeedback.completeness) / 3
      );

      setFeedback({
        ...nextFeedback,
        overall:
          typeof nextFeedback.overall === "number" && Number.isFinite(nextFeedback.overall)
            ? roundToOneDecimal(nextFeedback.overall)
            : overallFromScores,
      });

      if (autoSpeak) {
        speak(
          `Overall ${nextFeedback.overall ?? overallFromScores}. Technical ${nextFeedback.technical}, clarity ${nextFeedback.clarity}, completeness ${nextFeedback.completeness}. ${nextFeedback.suggestion}`
        );
      }

      if (res.data.followUp) {
        const followUpQuestion: Question = {
          ...res.data.followUp,
          category: question.category || category,
        };

        setQuestion(followUpQuestion);
        setHistory((prev) => [...prev, followUpQuestion]);
        setAnswer("");
      }
    } catch (requestError: unknown) {
      setError(extractApiErrorMessage(requestError, "Could not get feedback."));
    } finally {
      setIsSubmittingAnswer(false);
    }
  }, [answer, autoSpeak, category, elapsedSeconds, listening, question, role, sessionId, speak]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const isEditorTarget =
        target?.tagName === "TEXTAREA" || Boolean(target?.closest(".monaco-editor"));
      if (!isEditorTarget) return;

      event.preventDefault();
      if (!isSubmittingAnswer && !isGeneratingQuestion && answer.trim() && question && !listening) {
        void submitAnswer();
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [answer, isGeneratingQuestion, isSubmittingAnswer, listening, question, submitAnswer]);

  const startListening = () => {
    if (isBusy || listening) return;
    setVoiceError("");
    setTemplateNotice("");
    setError("");
    setLiveTranscript("");
    resetTranscript();

    void SpeechRecognition.startListening({
      continuous: true,
      language: "en-US",
    }).catch(() => {
      setVoiceError("Could not start microphone. Please allow microphone access and retry.");
    });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    window.setTimeout(() => {
      const spokenText = transcriptRef.current.trim();
      if (!spokenText) {
        setTemplateNotice("No transcript captured. Try speaking closer to your microphone.");
        resetTranscript();
        setLiveTranscript("");
        return;
      }

      setAnswer((prev) => mergeDictationText(prev, spokenText));
      setTemplateNotice("Voice transcript added to your answer.");
      setLiveTranscript("");
      resetTranscript();
    }, 180);
  };

  const insertGuidedTemplate = () => {
    const template = buildGuidedTemplate(question?.category || category, isTechnicalRole);
    const normalizedTemplate = normalizeMultiline(template);
    const normalizedAnswer = normalizeMultiline(answer);

    if (normalizedAnswer.includes(normalizedTemplate)) {
      setTemplateNotice("Template already exists in your answer.");
      return;
    }

    const nextAnswer = normalizedAnswer ? `${answer.trimEnd()}\n\n${template}` : template;
    setAnswer(nextAnswer);
    setTemplateNotice("Template inserted once. Fill it with your own points.");
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="interview-container">
        <div className="error-message">
          Your browser does not support speech recognition. Please use a Chromium-based browser.
        </div>
      </div>
    );
  }

  return (
    <div className="interview-container">
      <NavHeader />
      <div className="interview-header">
        <h1>Interview Practice Workspace</h1>
        <p style={{ color: "var(--slate-500)", marginTop: "var(--space-sm)" }}>
          Practice real interview rounds with live voice capture, structured answers, and detailed feedback.
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
      {voiceError && <div className="error-message">{voiceError}</div>}
      {templateNotice && <div className="notice-message">{templateNotice}</div>}

      {question && (
        <div className="question-card">
          <div className="question-card-header">
            <h3>Question</h3>
            <div className="question-utils">
              <span className="timer">Elapsed {formatElapsedTime(elapsedSeconds)}</span>
              <button
                type="button"
                className="btn-glass btn-sm"
                onClick={() => setTimerRunning((prev) => !prev)}
              >
                {timerRunning ? "Pause Timer" : "Resume Timer"}
              </button>
              <button
                type="button"
                className="btn-glass btn-sm"
                onClick={() => setElapsedSeconds(0)}
                disabled={elapsedSeconds === 0}
              >
                Reset Timer
              </button>
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
              <button
                type="button"
                onClick={startListening}
                className="btn-secondary mic-button"
                disabled={isBusy || isMicrophoneAvailable === false}
              >
                Start Speaking
              </button>
            ) : (
              <button type="button" onClick={stopListening} className="mic-button listening">
                Stop Recording
              </button>
            )}
            {listening && <span className="recording-status">Recording in progress...</span>}
            {isMicrophoneAvailable === false && (
              <span className="recording-status">Microphone access is blocked in this browser.</span>
            )}
          </div>

          {listening && (
            <div className="live-transcript-card">
              <p className="live-transcript-label">Live Transcript</p>
              <p className="live-transcript-text">{liveTranscript || "Listening..."}</p>
            </div>
          )}

          <div className="answer-area">
            <div className="answer-header">
              <label className="form-label" htmlFor="answer-input">
                Your Answer
              </label>
              <div className="answer-meta">
                <span>{answerWordCount} words</span>
                <span>{answerCharCount} chars</span>
                <span>Recorded time: {formatElapsedTime(elapsedSeconds)}</span>
                <span className="answer-shortcut">Shortcut: Ctrl/Cmd + Enter to submit</span>
              </div>
            </div>

            <div className="answer-toolbar">
              <button type="button" onClick={insertGuidedTemplate} className="btn-glass btn-sm">
                Insert Guided Template
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnswer("");
                  setTemplateNotice("");
                }}
                className="btn-glass btn-sm"
              >
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

            <div className="answer-checklist">
              <div className="answer-checklist-header">
                <strong>Answer Quality Checklist</strong>
                <span>
                  {checklistDoneCount}/{answerChecklist.length}
                </span>
              </div>
              <ul>
                {answerChecklist.map((item) => (
                  <li key={item.label} className={item.done ? "check-done" : "check-pending"}>
                    {item.done ? "Complete" : "Pending"} - {item.label}
                  </li>
                ))}
              </ul>
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
              disabled={isBusy || !answer.trim() || listening}
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
            <div className="score-item overall-score-item">
              <div className="score-label">Overall</div>
              <div className="score-value">{feedback.overall}/10</div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${((feedback.overall || 0) / 10) * 100}%` }} />
              </div>
            </div>

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

          {lastAnswerDurationSec !== null && (
            <p className="feedback-timing">Recorded answer time: {formatElapsedTime(lastAnswerDurationSec)}</p>
          )}

          {(feedback.strengths?.length || feedback.improvements?.length) && (
            <div className="feedback-lists">
              {feedback.strengths && feedback.strengths.length > 0 && (
                <div className="feedback-list-card">
                  <h4>Strengths</h4>
                  <ul>
                    {feedback.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.improvements && feedback.improvements.length > 0 && (
                <div className="feedback-list-card">
                  <h4>Improve Next</h4>
                  <ul>
                    {feedback.improvements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="suggestion-box">
            <strong style={{ color: "var(--primary-600)" }}>Next action:</strong>
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
