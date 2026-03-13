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
  source?: "heuristic" | "ai_calibrated";
  provisional?: boolean;
}

interface FeedbackJobCreateResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  pollAfterMs?: number;
  provisionalFeedback?: Feedback;
  provisionalFollowUp?: Question | null;
}

interface FeedbackJobStatusResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  pollAfterMs?: number;
  lastError?: string;
  provisionalFeedback?: Feedback;
  result?: {
    feedback: Feedback;
    followUp?: Question | null;
    source?: "heuristic" | "ai_calibrated";
  };
}

interface InterviewStartResponse {
  question: Question;
  sessionId?: string;
  questionIndex?: number;
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

const SPEECH_LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-GB", label: "English (UK)" },
];

const MIN_RECOMMENDED_WORDS = 40;
const MIN_RECORDING_SIZE_BYTES = 1024;

const getPreferredRecordingMimeType = () => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const mimeCandidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];

  return mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
};

const getWordCount = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const formatElapsedTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const normalizeMultiline = (value: string) => value.replace(/\r/g, "").trim();
const DRAFT_STORAGE_PREFIX = "interviewpilot:draft";

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const normalizeFeedbackScores = (
  feedback: Feedback,
  options?: { source?: "heuristic" | "ai_calibrated"; provisional?: boolean }
) => {
  const overallFromScores = roundToOneDecimal(
    (feedback.technical + feedback.clarity + feedback.completeness) / 3
  );

  return {
    ...feedback,
    overall:
      typeof feedback.overall === "number" && Number.isFinite(feedback.overall)
        ? roundToOneDecimal(feedback.overall)
        : overallFromScores,
    source: options?.source ?? feedback.source,
    provisional: options?.provisional ?? false,
  };
};

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

const cleanTranscriptText = (value: string) =>
  value.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [lastAnswerDurationSec, setLastAnswerDurationSec] = useState<number | null>(null);
  const [templateNotice, setTemplateNotice] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-US");
  const [speechTranscriptLog, setSpeechTranscriptLog] = useState("");
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [recordingError, setRecordingError] = useState("");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [isEvaluationPending, setIsEvaluationPending] = useState(false);
  const [evaluationStatusText, setEvaluationStatusText] = useState("");
  const [evaluationJobId, setEvaluationJobId] = useState<string | null>(null);

  const webcamRef = useRef<Webcam | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number | null>(null);

  const isBusy = isGeneratingQuestion || isSubmittingAnswer || isEvaluationPending;
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
  const draftStorageKey = useMemo(() => {
    if (!questionPrompt) return "";
    return `${DRAFT_STORAGE_PREFIX}:${hashText(questionPrompt)}`;
  }, [questionPrompt]);

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
  const coachSuggestions = useMemo(() => {
    const pending = answerChecklist.filter((item) => !item.done).map((item) => item.label);
    const suggestions: string[] = [];

    if (answerWordCount < MIN_RECOMMENDED_WORDS) {
      suggestions.push(`Increase depth to at least ${MIN_RECOMMENDED_WORDS} words.`);
    }

    if (pending.includes("Trade-offs or alternatives")) {
      suggestions.push("Add one trade-off decision and justify your final choice.");
    }

    if (pending.includes("Validation or testing")) {
      suggestions.push("Mention how you would test and monitor this in production.");
    }

    if (pending.includes("Concrete example or metric")) {
      suggestions.push("Add a real example with a measurable impact or KPI.");
    }

    if (suggestions.length === 0) {
      suggestions.push("Solid structure detected. Add one extra edge case to make it interview-ready.");
    }

    return suggestions.slice(0, 3);
  }, [answerChecklist, answerWordCount]);

  useEffect(() => {
    transcriptRef.current = combinedTranscript;
    if (listening) {
      setLiveTranscript(combinedTranscript);
    }
  }, [combinedTranscript, listening]);

  useEffect(() => {
    if (!voiceModeActive || listening || isBusy) return;

    const retryId = window.setTimeout(() => {
      void SpeechRecognition.startListening({
        continuous: true,
        interimResults: true,
        language: speechLanguage,
      }).catch(() => {
        setVoiceError("Live transcription was interrupted. Please restart recording.");
      });
    }, 350);

    return () => window.clearTimeout(retryId);
  }, [voiceModeActive, listening, isBusy, speechLanguage]);

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
    setSpeechTranscriptLog("");
    setVoiceModeActive(false);
    setIsEvaluationPending(false);
    setEvaluationStatusText("");
    setEvaluationJobId(null);
    setFeedback(null);
    SpeechRecognition.stopListening();
    resetTranscript();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsVideoRecording(false);
    setRecordingBlob(null);
    setRecordingDurationSec(0);
    setRecordingStatus("");
    setRecordingError("");
    setRecordingUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return "";
    });
  }, [questionPrompt, resetTranscript]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") {
      return;
    }

    const savedDraft = window.localStorage.getItem(draftStorageKey);
    if (!savedDraft || answer.trim()) {
      return;
    }

    setAnswer(savedDraft);
    setTemplateNotice("Recovered your saved draft for this question.");
  }, [answer, draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") {
      return;
    }

    if (!answer.trim()) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    window.localStorage.setItem(draftStorageKey, answer);
  }, [answer, draftStorageKey]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      SpeechRecognition.abortListening();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl]);

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
    setCurrentQuestionIndex(null);
    setHistory([]);
    setTemplateNotice("");
    setVoiceError("");
    setLiveTranscript("");
    setVoiceModeActive(false);
    setSpeechTranscriptLog("");
    setElapsedSeconds(0);
    setLastAnswerDurationSec(null);
    setIsEvaluationPending(false);
    setEvaluationStatusText("");
    setEvaluationJobId(null);

    try {
      const res = await api.post("/interview/start", { role, difficulty, category }, { timeout: 12000 });
      const payload = res.data as InterviewStartResponse;
      setQuestion(payload.question);
      setHistory([payload.question]);
      setSessionId(payload.sessionId || null);
      setCurrentQuestionIndex(
        typeof payload.questionIndex === "number" && Number.isFinite(payload.questionIndex)
          ? payload.questionIndex
          : 0
      );
      if (autoSpeak) {
        speak(payload.question.prompt);
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
    setVoiceModeActive(false);
    setSpeechTranscriptLog("");
    setLastAnswerDurationSec(null);
    setIsEvaluationPending(false);
    setEvaluationStatusText("");
    setEvaluationJobId(null);

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
      }, { timeout: 12000 });
      const payload = res.data as InterviewStartResponse;
      setQuestion(payload.question);
      setHistory((prev) => [...prev, payload.question]);
      setSessionId(payload.sessionId || sessionId);
      setCurrentQuestionIndex((prev) => {
        if (typeof payload.questionIndex === "number" && Number.isFinite(payload.questionIndex)) {
          return payload.questionIndex;
        }
        return typeof prev === "number" ? prev + 1 : null;
      });
      setAnswer("");
      if (autoSpeak) {
        speak(payload.question.prompt);
      }
    } catch (requestError: unknown) {
      setError(extractApiErrorMessage(requestError, "Could not generate next question."));
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const captureCameraSnapshot = useCallback(() => {
    if (!showCamera || !webcamRef.current) {
      return "";
    }

    const shot = webcamRef.current.getScreenshot();
    if (typeof shot !== "string" || !shot.startsWith("data:image/")) {
      return "";
    }

    return shot;
  }, [showCamera]);

  const clearRecordingArtifacts = useCallback(() => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }
    setRecordingUrl("");
    setRecordingBlob(null);
    setRecordingDurationSec(0);
    setRecordingStatus("");
    setRecordingError("");
  }, [recordingUrl]);

  const stopVideoRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsVideoRecording(false);
      return;
    }

    setRecordingStatus("Finalizing recording...");
    try {
      recorder.requestData();
    } catch {
      // Some browsers throw if requestData is called at the wrong state.
    }
    recorder.stop();
  }, []);

  const startVideoRecording = useCallback(() => {
    if (!showCamera) {
      setRecordingError("Enable camera first.");
      return;
    }

    const stream = webcamRef.current?.stream;
    if (!stream) {
      setRecordingError("Camera stream is unavailable. Allow camera access and try again.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordingError("Video recording is not supported in this browser.");
      return;
    }

    clearRecordingArtifacts();
    recordingChunksRef.current = [];
    setRecordingError("");
    setRecordingStatus("Recording in progress...");
    recordingStartRef.current = Date.now();

    const selectedMime = getPreferredRecordingMimeType();

    const recorder = selectedMime
      ? new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 900000,
        })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setRecordingError("Recording failed. Please retry.");
      setRecordingStatus("");
      setIsVideoRecording(false);
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || selectedMime || "video/webm";
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      recordingChunksRef.current = [];

      if (blob.size < MIN_RECORDING_SIZE_BYTES) {
        setRecordingBlob(null);
        setRecordingUrl("");
        setRecordingDurationSec(0);
        setIsVideoRecording(false);
        setRecordingStatus("");
        setRecordingError("Recording is empty or too short. Please record again.");
        return;
      }

      const nextUrl = URL.createObjectURL(blob);
      const startedAt = recordingStartRef.current ?? Date.now();
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

      setRecordingBlob(blob);
      setRecordingUrl(nextUrl);
      setRecordingDurationSec(durationSeconds);
      setIsVideoRecording(false);
      setRecordingStatus("Recording captured. It will be saved to history after submit.");
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsVideoRecording(true);
  }, [clearRecordingArtifacts, showCamera]);

  useEffect(() => {
    if (showCamera) {
      return;
    }

    stopVideoRecording();
    setIsVideoRecording(false);
  }, [showCamera, stopVideoRecording]);

  const uploadRecordingIfNeeded = useCallback(async () => {
    if (!recordingBlob || !sessionId) {
      return;
    }

    if (recordingBlob.size < MIN_RECORDING_SIZE_BYTES) {
      throw new Error("Recording is empty or too short");
    }

    const extension = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
    const formData = new FormData();
    formData.append("recording", recordingBlob, `answer-recording-${Date.now()}.${extension}`);
    formData.append("sessionId", sessionId);
    if (typeof currentQuestionIndex === "number" && Number.isFinite(currentQuestionIndex)) {
      formData.append("questionIndex", String(currentQuestionIndex));
    }

    await api.post("/interview/recording", formData, {
      timeout: 20000,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  }, [currentQuestionIndex, recordingBlob, sessionId]);

  const pollFeedbackJob = useCallback(async (jobId: string, initialPollAfterMs: number) => {
    let delayMs = Math.max(450, Math.min(2600, initialPollAfterMs || 1200));
    const maxAttempts = 18;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(delayMs);
      }

      setEvaluationStatusText(`Evaluating answer... (${attempt + 1}/${maxAttempts})`);

      try {
        const statusRes = await api.get(`/interview/feedback/jobs/${jobId}`, { timeout: 9000 });
        const payload = statusRes.data as FeedbackJobStatusResponse;

        if (payload.status === "completed" && payload.result?.feedback) {
          return payload.result;
        }

        if (payload.status === "failed") {
          throw new Error(payload.lastError || "Evaluation job failed. Please submit again.");
        }

        if (payload.provisionalFeedback) {
          setFeedback((prev) => {
            if (prev && !prev.provisional) {
              return prev;
            }
            return normalizeFeedbackScores(payload.provisionalFeedback as Feedback, {
              source: "heuristic",
              provisional: true,
            });
          });
        }

        delayMs = Math.max(450, Math.min(2600, payload.pollAfterMs ?? delayMs + 250));
      } catch (pollError) {
        if (attempt >= maxAttempts - 1) {
          throw pollError;
        }
        delayMs = Math.min(2800, delayMs + 350);
      }
    }

    throw new Error("Evaluation is taking longer than expected. Please retry.");
  }, []);

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
    setIsEvaluationPending(false);
    setEvaluationStatusText("");
    setEvaluationJobId(null);
    setFeedback(null);
    setError("");
    setTemplateNotice("");
    setTimerRunning(false);
    setLastAnswerDurationSec(elapsedSeconds);
    const speechTranscript = cleanTranscriptText(speechTranscriptLog || transcriptRef.current);
    const answerDurationSec = Math.max(0, Math.round(elapsedSeconds));
    const cameraSnapshot = captureCameraSnapshot();
    const activeQuestionIndex = currentQuestionIndex;
    let hasProvisionalFeedback = false;

    try {
      setRecordingError("");
      if (recordingBlob && sessionId) {
        try {
          await uploadRecordingIfNeeded();
        } catch (uploadError: unknown) {
          setRecordingError(extractApiErrorMessage(uploadError, "Recording upload failed. Continuing without video."));
        }
      }

      const createJobResponse = await api.post("/interview/feedback/jobs", {
        role,
        question: question.prompt,
        answer: trimmedAnswer,
        expectedPoints: question.expectedPoints || [],
        speechTranscript: speechTranscript || undefined,
        answerDurationSec,
        cameraSnapshot: cameraSnapshot || undefined,
        sessionId,
        sessionQuestionIndex:
          typeof activeQuestionIndex === "number" && Number.isFinite(activeQuestionIndex)
            ? activeQuestionIndex
            : undefined,
      }, { timeout: 9000 });

      const jobPayload = createJobResponse.data as FeedbackJobCreateResponse;
      if (!jobPayload.jobId) {
        throw new Error("Evaluation job did not start. Please retry.");
      }

      setEvaluationJobId(jobPayload.jobId);
      setIsEvaluationPending(true);
      setEvaluationStatusText("Evaluating your answer...");

      if (jobPayload.provisionalFeedback) {
        hasProvisionalFeedback = true;
        setFeedback(
          normalizeFeedbackScores(jobPayload.provisionalFeedback, {
            source: "heuristic",
            provisional: true,
          })
        );
      }

      const finalResult = await pollFeedbackJob(jobPayload.jobId, jobPayload.pollAfterMs ?? 1200);
      const nextFeedback = normalizeFeedbackScores(finalResult.feedback, {
        source: finalResult.source ?? finalResult.feedback.source ?? "heuristic",
        provisional: false,
      });

      setFeedback(nextFeedback);
      if (draftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      clearRecordingArtifacts();

      if (autoSpeak) {
        speak(
          `Overall ${nextFeedback.overall}. Technical ${nextFeedback.technical}, clarity ${nextFeedback.clarity}, completeness ${nextFeedback.completeness}. ${nextFeedback.suggestion}`
        );
      }

      if (finalResult.followUp) {
        const followUpQuestion: Question = {
          ...finalResult.followUp,
          category: question.category || category,
        };

        setQuestion(followUpQuestion);
        setHistory((prev) => [...prev, followUpQuestion]);
        if (typeof activeQuestionIndex === "number" && Number.isFinite(activeQuestionIndex)) {
          setCurrentQuestionIndex(activeQuestionIndex + 1);
        }
        setAnswer("");
      }
    } catch (requestError: unknown) {
      const baseMessage = extractApiErrorMessage(requestError, "Could not get feedback.");
      if (hasProvisionalFeedback) {
        setError(`${baseMessage} Preliminary feedback is shown while final evaluation catches up.`);
      } else {
        setError(baseMessage);
      }
    } finally {
      setIsSubmittingAnswer(false);
      setIsEvaluationPending(false);
      setEvaluationStatusText("");
      setEvaluationJobId(null);
    }
  }, [
    answer,
    autoSpeak,
    captureCameraSnapshot,
    category,
    clearRecordingArtifacts,
    currentQuestionIndex,
    elapsedSeconds,
    listening,
    recordingBlob,
    question,
    role,
    sessionId,
    speak,
    speechTranscriptLog,
    draftStorageKey,
    pollFeedbackJob,
    uploadRecordingIfNeeded,
  ]);

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
    setVoiceModeActive(true);
    resetTranscript();

    void SpeechRecognition.startListening({
      continuous: true,
      interimResults: true,
      language: speechLanguage,
    }).catch(() => {
      setVoiceModeActive(false);
      setVoiceError("Could not start microphone. Please allow microphone access and retry.");
    });
  };

  const stopListening = () => {
    setVoiceModeActive(false);
    SpeechRecognition.stopListening();
    window.setTimeout(() => {
      const spokenText = cleanTranscriptText(transcriptRef.current);
      if (!spokenText) {
        setTemplateNotice("No transcript captured. Try speaking closer to your microphone.");
        resetTranscript();
        setLiveTranscript("");
        return;
      }

      setAnswer((prev) => mergeDictationText(prev, spokenText));
      setSpeechTranscriptLog((prev) => mergeDictationText(prev, spokenText));
      setTemplateNotice("Voice transcript added to your answer.");
      setLiveTranscript("");
      resetTranscript();
    }, 220);
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
      {recordingError && <div className="error-message">{recordingError}</div>}
      {templateNotice && <div className="notice-message">{templateNotice}</div>}
      {recordingStatus && <div className="notice-message">{recordingStatus}</div>}
      {isEvaluationPending && (
        <div className="notice-message">
          {evaluationStatusText || "Evaluating your answer..."}
          {evaluationJobId ? ` Job: ${evaluationJobId.slice(0, 8)}...` : ""}
        </div>
      )}
      {feedback?.provisional && (
        <div className="notice-message">
          Preliminary feedback is shown now. Final calibrated feedback will replace it automatically.
        </div>
      )}

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
            <select
              value={speechLanguage}
              onChange={(event) => setSpeechLanguage(event.target.value)}
              className="voice-language-select"
              disabled={listening}
            >
              {SPEECH_LANGUAGE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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
            {voiceModeActive && !listening && (
              <span className="recording-status">Reconnecting microphone...</span>
            )}
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
                {draftStorageKey && <span>Draft auto-save enabled</span>}
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

            <div className="answer-checklist" style={{ marginTop: "var(--space-sm)" }}>
              <div className="answer-checklist-header">
                <strong>Live Coach Suggestions</strong>
              </div>
              <ul>
                {coachSuggestions.map((item) => (
                  <li key={item} className="check-pending">
                    Tip - {item}
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
                  padding: "0.5rem",
                  background: "var(--slate-50)",
                }}
              >
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  width="100%"
                  height={250}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.6}
                  videoConstraints={{ width: 640, height: 360, facingMode: "user" }}
                />
                <div className="camera-recording-controls">
                  {!isVideoRecording ? (
                    <button
                      type="button"
                      onClick={startVideoRecording}
                      className="btn-secondary btn-sm"
                      disabled={isBusy}
                    >
                      Start Video Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopVideoRecording}
                      className="btn-secondary btn-sm"
                    >
                      Stop Video Recording
                    </button>
                  )}
                  {recordingDurationSec > 0 && (
                    <span className="recording-status">
                      Captured: {formatElapsedTime(recordingDurationSec)}
                    </span>
                  )}
                </div>
                {recordingUrl && (
                  <div className="recorded-video-preview">
                    <p>Recorded preview:</p>
                    <video src={recordingUrl} controls preload="metadata" />
                  </div>
                )}
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
              {isSubmittingAnswer ? "Submitting..." : isEvaluationPending ? "Evaluating..." : "Submit Answer"}
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

          <p className="feedback-timing">
            {feedback.provisional
              ? "Evaluation status: preliminary heuristic scoring."
              : feedback.source === "ai_calibrated"
                ? "Evaluation source: AI + calibration guardrails."
                : "Evaluation source: calibrated heuristic fallback."}
          </p>

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
