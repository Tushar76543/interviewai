import axios from "axios";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const REQUEST_TIMEOUT_MS = 20000;
const cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
const clampScore = (value) => {
    if (typeof value !== "number" || Number.isNaN(value))
        return 0;
    return Math.max(0, Math.min(10, Number(value.toFixed(1))));
};
const roundToOneDecimal = (value) => Math.round(value * 10) / 10;
const extractJson = (value) => {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : "";
};
const sanitizeList = (value, maxItems, itemMaxLength) => {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, itemMaxLength))
        .filter(Boolean)
        .slice(0, maxItems);
};
const parseFeedback = (raw) => {
    try {
        const parsed = JSON.parse(extractJson(raw));
        const feedback = parsed.feedback;
        if (!feedback)
            return null;
        const technical = clampScore(feedback.technical);
        const clarity = clampScore(feedback.clarity);
        const completeness = clampScore(feedback.completeness);
        const fallbackOverall = roundToOneDecimal((technical + clarity + completeness) / 3);
        const strengths = sanitizeList(feedback.strengths, 4, 160);
        const improvements = sanitizeList(feedback.improvements, 4, 160);
        const sanitizedFeedback = {
            technical,
            clarity,
            completeness,
            overall: typeof feedback.overall === "number" && Number.isFinite(feedback.overall)
                ? clampScore(feedback.overall)
                : fallbackOverall,
            suggestion: cleanText(typeof feedback.suggestion === "string" ? feedback.suggestion : "No suggestion generated", 420),
            strengths: strengths.length > 0 ? strengths : ["Good attempt to answer the core question."],
            improvements: improvements.length > 0
                ? improvements
                : ["Add clearer structure and concrete evidence to improve impact."],
        };
        const followUp = parsed.followUp;
        const sanitizedFollowUp = followUp && typeof followUp.prompt === "string"
            ? {
                qid: typeof followUp.qid === "string"
                    ? cleanText(followUp.qid, 40) || "followup1"
                    : "followup1",
                prompt: cleanText(followUp.prompt, 1000),
                expectedPoints: sanitizeList(followUp.expectedPoints, 6, 240),
            }
            : null;
        return {
            feedback: sanitizedFeedback,
            followUp: sanitizedFollowUp,
        };
    }
    catch {
        return null;
    }
};
export async function generateFeedback(role, question, answer, expectedPoints = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("AI provider is not configured");
    }
    const safeRole = cleanText(role, 80);
    const safeQuestion = cleanText(question, 1000);
    const safeAnswer = cleanText(answer, 5000);
    const safeExpectedPoints = expectedPoints
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 200))
        .filter(Boolean)
        .slice(0, 8);
    const expectedPointsGuidance = safeExpectedPoints.length
        ? `Expected points to check for coverage:\n- ${safeExpectedPoints.join("\n- ")}`
        : "No expected points were provided; evaluate based on interview best practices.";
    const prompt = `
You are an expert interviewer evaluating a candidate for a ${safeRole} position.

Evaluate this answer with strict but constructive scoring.

Scoring rubric (0-10 each):
1) Technical correctness: factual accuracy, depth, and relevance.
2) Clarity and communication: organization, precision, and readability.
3) Completeness: coverage of key points, trade-offs, risks, and practical details.

Also provide:
- overall score (0-10): weighted average where technical has highest weight.
- strengths: 2 to 4 concise bullets.
- improvements: 2 to 4 concise bullets.
- suggestion: one high-impact next step the candidate should take in the next answer.
- follow-up question: one realistic follow-up question.

${expectedPointsGuidance}

Return JSON only in this format:
{
  "feedback": {
    "technical": 8.2,
    "clarity": 7.8,
    "completeness": 7.4,
    "overall": 7.9,
    "strengths": ["...", "..."],
    "improvements": ["...", "..."],
    "suggestion": "..."
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
        const response = await axios.post(OPENROUTER_ENDPOINT, {
            model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
            messages: [
                { role: "system", content: "You are a strict but fair AI interview evaluator." },
                { role: "user", content: prompt },
            ],
            temperature: 0.25,
        }, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": referer,
                "X-Title": "Interview AI Coach",
                "Content-Type": "application/json",
            },
        });
        const text = response.data?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
            throw new Error("Empty response from AI model");
        }
        const parsed = parseFeedback(text);
        if (!parsed) {
            throw new Error("Invalid feedback format from AI model");
        }
        return parsed;
    }
    catch {
        throw new Error("Feedback generation failed");
    }
}
