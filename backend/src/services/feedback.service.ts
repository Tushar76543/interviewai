import axios from "axios";

type FeedbackPayload = {
  feedback: {
    technical: number;
    clarity: number;
    completeness: number;
    suggestion: string;
  };
  followUp: {
    qid: string;
    prompt: string;
    expectedPoints: string[];
  } | null;
};

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const REQUEST_TIMEOUT_MS = 20000;

const cleanText = (value: string, maxLength: number) =>
  value.replace(/\s+/g, " ").trim().slice(0, maxLength);

const clampScore = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
};

const extractJson = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : "";
};

const parseFeedback = (raw: string): FeedbackPayload | null => {
  try {
    const parsed = JSON.parse(extractJson(raw)) as Partial<FeedbackPayload>;

    const feedback = parsed.feedback;
    if (!feedback) return null;

    const sanitizedFeedback = {
      technical: clampScore(feedback.technical),
      clarity: clampScore(feedback.clarity),
      completeness: clampScore(feedback.completeness),
      suggestion: cleanText(
        typeof feedback.suggestion === "string" ? feedback.suggestion : "No suggestion generated",
        320
      ),
    };

    const followUp = parsed.followUp;
    const sanitizedFollowUp =
      followUp && typeof followUp.prompt === "string"
        ? {
            qid: typeof followUp.qid === "string" ? cleanText(followUp.qid, 40) || "followup1" : "followup1",
            prompt: cleanText(followUp.prompt, 1000),
            expectedPoints: Array.isArray(followUp.expectedPoints)
              ? followUp.expectedPoints
                  .filter((item): item is string => typeof item === "string")
                  .map((item) => cleanText(item, 240))
                  .filter(Boolean)
                  .slice(0, 6)
              : [],
          }
        : null;

    return {
      feedback: sanitizedFeedback,
      followUp: sanitizedFollowUp,
    };
  } catch {
    return null;
  }
};

export async function generateFeedback(
  role: string,
  question: string,
  answer: string
): Promise<FeedbackPayload> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }

  const safeRole = cleanText(role, 80);
  const safeQuestion = cleanText(question, 1000);
  const safeAnswer = cleanText(answer, 5000);

  const prompt = `
You are an expert interviewer evaluating a candidate for a ${safeRole} position.

Evaluate the following answer in three areas:
1. Technical correctness (0-10)
2. Clarity and communication (0-10)
3. Completeness (0-10)

Also provide a short suggestion (1-2 lines) for improvement.
Finally, generate one short follow-up question.

Return JSON only in this format:
{
  "feedback": {
    "technical": 8.5,
    "clarity": 9,
    "completeness": 7.5,
    "suggestion": "Explain trade-offs more clearly."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "<follow-up question>",
    "expectedPoints": ["point1", "point2"]
  }
}

Question: ${safeQuestion}
Answer: ${safeAnswer}
`;

  const referer = process.env.FRONTEND_URL?.startsWith("http")
    ? process.env.FRONTEND_URL
    : "https://interviewai.app";

  try {
    const response = await axios.post(
      OPENROUTER_ENDPOINT,
      {
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are a strict but fair AI interview evaluator." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": referer,
          "X-Title": "Interview AI Coach",
          "Content-Type": "application/json",
        },
      }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Empty response from AI model");
    }

    const parsed = parseFeedback(text);
    if (!parsed) {
      throw new Error("Invalid feedback format from AI model");
    }

    return parsed;
  } catch {
    throw new Error("Feedback generation failed");
  }
}
