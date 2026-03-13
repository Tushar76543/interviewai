import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const LOADTEST_EMAIL = (__ENV.LOADTEST_EMAIL || "").trim();
const LOADTEST_PASSWORD = (__ENV.LOADTEST_PASSWORD || "").trim();

const hasCredentials = Boolean(LOADTEST_EMAIL && LOADTEST_PASSWORD);

export const options = {
  scenarios: {
    api_smoke: {
      executor: "constant-vus",
      vus: Number(__ENV.K6_VUS || 3),
      duration: __ENV.K6_DURATION || "45s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
    "http_req_duration{endpoint:health}": ["p(95)<600", "p(99)<900"],
    "http_req_duration{endpoint:interview_start}": ["p(95)<2200", "p(99)<3000"],
    "http_req_duration{endpoint:feedback_jobs}": ["p(95)<2400", "p(99)<3200"],
    "http_req_duration{endpoint:recording_upload}": ["p(95)<3500", "p(99)<4500"],
    "http_req_duration{endpoint:recording_stream}": ["p(95)<1800", "p(99)<2600"],
  },
};

const requestCsrfToken = () => {
  const response = http.get(`${BASE_URL}/api/auth/csrf`, {
    tags: { endpoint: "csrf" },
  });
  const payload = response.json();
  return typeof payload?.csrfToken === "string" ? payload.csrfToken : "";
};

const loginAndGetCsrf = () => {
  const csrfToken = requestCsrfToken();
  if (!csrfToken) {
    return "";
  }

  const response = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: LOADTEST_EMAIL,
      password: LOADTEST_PASSWORD,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      tags: { endpoint: "login" },
    }
  );

  if (response.status !== 200) {
    return "";
  }

  return csrfToken;
};

const runAuthenticatedFlow = (csrfToken) => {
  const startRes = http.post(
    `${BASE_URL}/api/interview/start`,
    JSON.stringify({
      role: "Backend Engineer",
      difficulty: "Medium",
      category: "Mixed",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      tags: { endpoint: "interview_start" },
    }
  );

  const startPayload = startRes.json();
  const sessionId = typeof startPayload?.sessionId === "string" ? startPayload.sessionId : "";
  const questionPrompt =
    typeof startPayload?.question?.prompt === "string"
      ? startPayload.question.prompt
      : "Tell me about a difficult debugging issue you solved.";
  const expectedPoints = Array.isArray(startPayload?.question?.expectedPoints)
    ? startPayload.question.expectedPoints
    : [];

  check(startRes, {
    "interview start accepted": (res) => res.status === 200 || res.status === 201,
  });

  const feedbackRes = http.post(
    `${BASE_URL}/api/interview/feedback/jobs`,
    JSON.stringify({
      role: "Backend Engineer",
      question: questionPrompt,
      answer:
        "I isolated the bottleneck, added profiling, patched query indexes, and deployed a rollback-safe fix with dashboards.",
      expectedPoints,
      sessionId: sessionId || undefined,
      sessionQuestionIndex: 0,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      tags: { endpoint: "feedback_jobs" },
    }
  );

  check(feedbackRes, {
    "feedback job accepted": (res) => res.status === 202 || res.status === 200,
  });

  if (!sessionId) {
    return;
  }

  const bytes = new Uint8Array(2048);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index % 255;
  }

  const uploadRes = http.post(
    `${BASE_URL}/api/interview/recording`,
    {
      recording: http.file(bytes.buffer, "loadtest.webm", "video/webm"),
      sessionId,
      questionIndex: "0",
    },
    {
      headers: { "X-CSRF-Token": csrfToken },
      tags: { endpoint: "recording_upload" },
    }
  );

  check(uploadRes, {
    "recording upload success": (res) => res.status === 200,
  });

  const fileId = uploadRes.json()?.recording?.fileId;
  if (typeof fileId === "string" && fileId) {
    const streamRes = http.get(`${BASE_URL}/api/interview/recording/${fileId}`, {
      tags: { endpoint: "recording_stream" },
    });

    check(streamRes, {
      "recording stream success": (res) => res.status === 200 || res.status === 206,
    });
  }
};

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { endpoint: "health" },
  });

  check(healthRes, {
    "health is ok": (res) => res.status === 200,
  });

  if (hasCredentials) {
    const csrfToken = loginAndGetCsrf();
    if (csrfToken) {
      runAuthenticatedFlow(csrfToken);
    }
  }

  sleep(1);
}

