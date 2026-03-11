import axios from "axios";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.FEEDBACK_PROVIDER_TIMEOUT_MS ?? "5200", 10);
const RESPONSE_MAX_TOKENS = 450;
const STOP_WORDS = new Set([
    "the",
    "and",
    "with",
    "that",
    "this",
    "from",
    "have",
    "your",
    "into",
    "about",
    "would",
    "there",
    "their",
    "should",
    "were",
    "then",
    "they",
    "them",
    "been",
    "over",
    "only",
    "also",
    "just",
    "some",
    "when",
    "what",
    "where",
    "while",
    "which",
    "through",
    "because",
    "could",
    "being",
    "very",
    "more",
    "than",
    "will",
    "each",
    "other",
]);
const cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
const normalizeText = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
const toMeaningfulTokens = (value) => normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
const uniqueRatio = (tokens) => {
    if (tokens.length === 0)
        return 1;
    return new Set(tokens).size / tokens.length;
};
const extractKeywords = (value, maxItems) => {
    const counts = new Map();
    for (const token of toMeaningfulTokens(value)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([token]) => token)
        .slice(0, maxItems);
};
const topicalityScore = (question, answer) => {
    const questionKeywords = extractKeywords(question, 16);
    if (questionKeywords.length === 0) {
        return 0.5;
    }
    const answerTokenSet = new Set(toMeaningfulTokens(answer));
    const overlapCount = questionKeywords.filter((token) => answerTokenSet.has(token)).length;
    return overlapCount / questionKeywords.length;
};
const hasLowConfidenceLanguage = (answer) => /\b(i\s+(don'?t|do not|can'?t|cannot|am not sure)|not sure|no idea|idk|just guessing)\b/i.test(answer);
const matchesExpectedPoint = (expectedPoint, normalizedAnswer) => {
    const normalizedPoint = normalizeText(expectedPoint);
    if (!normalizedPoint)
        return false;
    if (normalizedAnswer.includes(normalizedPoint)) {
        return true;
    }
    const keywords = normalizedPoint
        .split(" ")
        .filter((token) => token.length > 3 && !STOP_WORDS.has(token))
        .slice(0, 6);
    if (keywords.length === 0) {
        return false;
    }
    const matchCount = keywords.filter((keyword) => normalizedAnswer.includes(keyword)).length;
    const threshold = Math.max(1, Math.ceil(keywords.length * 0.5));
    return matchCount >= threshold;
};
const buildHeuristicAssessment = (question, answer, expectedPoints) => {
    const normalizedAnswer = normalizeText(answer);
    const wordCount = normalizedAnswer ? normalizedAnswer.split(" ").length : 0;
    const lowConfidence = hasLowConfidenceLanguage(answer);
    const topicalityRatio = topicalityScore(question, answer);
    const answerTokens = toMeaningfulTokens(answer);
    const repeatedLanguage = wordCount >= 24 && uniqueRatio(answerTokens) < 0.42;
    const matchedPoints = expectedPoints.filter((point) => matchesExpectedPoint(point, normalizedAnswer));
    const missingPoints = expectedPoints.filter((point) => !matchedPoints.includes(point));
    const coverageRatio = expectedPoints.length > 0 ? matchedPoints.length / expectedPoints.length : 0;
    let technical = 2.2;
    let completeness = 2.2;
    let clarity = 2.6 + Math.min(wordCount, 180) / 36;
    if (expectedPoints.length > 0) {
        technical = 1.4 + coverageRatio * 7.6;
        completeness = 1.2 + coverageRatio * 8.1;
    }
    else {
        const topicalityBoost = topicalityRatio * 5.1;
        technical = 1.8 + topicalityBoost + Math.min(wordCount, 140) / 70;
        completeness = 1.7 + topicalityBoost + Math.min(wordCount, 140) / 72;
    }
    if (wordCount < 45) {
        clarity -= 0.7;
    }
    if (wordCount < 22) {
        technical = Math.min(technical, 4.3);
        completeness = Math.min(completeness, 4.1);
        clarity = Math.min(clarity, 5.1);
    }
    if (wordCount < 12) {
        technical = Math.min(technical, 2.9);
        completeness = Math.min(completeness, 2.8);
        clarity = Math.min(clarity, 4.2);
    }
    if (expectedPoints.length >= 2) {
        if (coverageRatio < 0.34) {
            technical = Math.min(technical, 4.8);
            completeness = Math.min(completeness, 4.6);
        }
        if (coverageRatio === 0) {
            technical = Math.min(technical, 2.9);
            completeness = Math.min(completeness, 2.7);
        }
    }
    if (topicalityRatio < 0.22) {
        technical = Math.min(technical, 4.2);
        completeness = Math.min(completeness, 4.0);
    }
    if (topicalityRatio < 0.1) {
        technical = Math.min(technical, 3.2);
        completeness = Math.min(completeness, 3.0);
    }
    if (repeatedLanguage) {
        technical = Math.min(technical, 3.4);
        completeness = Math.min(completeness, 3.3);
        clarity = Math.min(clarity, 4.8);
    }
    if (lowConfidence) {
        technical = Math.min(technical, 2.5);
        completeness = Math.min(completeness, 2.6);
        clarity = Math.min(clarity, 4.5);
    }
    technical = clampScore(technical);
    clarity = clampScore(clarity);
    completeness = clampScore(completeness);
    const overall = clampScore(roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3));
    let confidenceBand = "high";
    if (lowConfidence ||
        repeatedLanguage ||
        wordCount < 20 ||
        topicalityRatio < 0.2 ||
        (expectedPoints.length >= 2 && coverageRatio === 0)) {
        confidenceBand = "low";
    }
    else if (topicalityRatio < 0.42 ||
        (expectedPoints.length >= 2 && coverageRatio < 0.6)) {
        confidenceBand = "medium";
    }
    const strengths = [];
    if (clarity >= 6) {
        strengths.push("Your response is easy to follow.");
    }
    if (wordCount >= 35) {
        strengths.push("You provided enough detail for meaningful evaluation.");
    }
    if (topicalityRatio >= 0.45) {
        strengths.push("You stayed relevant to the exact question.");
    }
    if (matchedPoints.length > 0) {
        strengths.push(`You covered ${matchedPoints.length} key point${matchedPoints.length > 1 ? "s" : ""}.`);
    }
    if (strengths.length === 0) {
        strengths.push("You attempted the question and gave an initial direction.");
    }
    const improvements = [];
    if (topicalityRatio < 0.28) {
        improvements.push("Stay closer to the exact question and avoid generic statements.");
    }
    if (missingPoints.length > 0) {
        improvements.push(`Address these missing points: ${missingPoints.join("; ")}.`);
    }
    if (technical <= 4.5) {
        improvements.push("Correct technical inaccuracies before the next attempt.");
    }
    if (completeness <= 4.5) {
        improvements.push("Explain trade-offs, edge cases, and implementation details.");
    }
    if (improvements.length === 0) {
        improvements.push("Add one concrete project example to make your answer stronger.");
    }
    const suggestion = cleanText(improvements[0], 420) || "Add clearer technical depth and concrete evidence.";
    const followUpPoint = missingPoints[0];
    const followUpPrompt = followUpPoint
        ? `Can you explain ${followUpPoint.toLowerCase()} and how you would apply it in this scenario?`
        : `Can you walk through one concrete example for this question and discuss the trade-offs?`;
    return {
        feedback: {
            technical,
            clarity,
            completeness,
            overall,
            suggestion,
            strengths: strengths.map((item) => cleanText(item, 160)).slice(0, 4),
            improvements: improvements.map((item) => cleanText(item, 160)).slice(0, 4),
        },
        followUp: {
            qid: "followup1",
            prompt: cleanText(followUpPrompt, 1000),
            expectedPoints: missingPoints.map((item) => cleanText(item, 240)).slice(0, 3),
        },
        coverageRatio,
        expectedPointCount: expectedPoints.length,
        lowConfidence,
        wordCount,
        topicalityRatio,
        repeatedLanguage,
        confidenceBand,
    };
};
const calibrateFeedback = (aiFeedback, heuristics) => {
    const technicalHeadroom = heuristics.confidenceBand === "high" ? 1.1 : 0.6;
    const completenessHeadroom = heuristics.confidenceBand === "high" ? 1.1 : 0.6;
    const clarityHeadroom = heuristics.confidenceBand === "low" ? 0.8 : 1.4;
    let technical = clampScore(Math.min(aiFeedback.technical, heuristics.feedback.technical + technicalHeadroom));
    let completeness = clampScore(Math.min(aiFeedback.completeness, heuristics.feedback.completeness + completenessHeadroom));
    let clarity = clampScore(Math.min(aiFeedback.clarity, heuristics.feedback.clarity + clarityHeadroom));
    if (heuristics.expectedPointCount >= 2 && heuristics.coverageRatio < 0.34) {
        technical = Math.min(technical, 5);
        completeness = Math.min(completeness, 5);
    }
    if (heuristics.expectedPointCount >= 2 && heuristics.coverageRatio === 0) {
        technical = Math.min(technical, 3);
        completeness = Math.min(completeness, 3);
    }
    if (heuristics.lowConfidence || heuristics.wordCount < 12) {
        technical = Math.min(technical, 3.5);
        completeness = Math.min(completeness, 3.5);
    }
    if (heuristics.topicalityRatio < 0.22) {
        technical = Math.min(technical, 4.3);
        completeness = Math.min(completeness, 4.1);
    }
    if (heuristics.topicalityRatio < 0.12) {
        technical = Math.min(technical, 3.3);
        completeness = Math.min(completeness, 3.2);
    }
    if (heuristics.repeatedLanguage) {
        technical = Math.min(technical, 3.5);
        completeness = Math.min(completeness, 3.4);
        clarity = Math.min(clarity, 5);
    }
    if (heuristics.confidenceBand === "low") {
        technical = Math.min(technical, 5);
        completeness = Math.min(completeness, 5);
    }
    technical = clampScore(technical);
    clarity = clampScore(clarity);
    completeness = clampScore(completeness);
    const overall = clampScore(roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3));
    return {
        technical,
        clarity,
        completeness,
        overall,
        suggestion: cleanText(aiFeedback.suggestion, 420) || heuristics.feedback.suggestion,
        strengths: aiFeedback.strengths.length > 0
            ? aiFeedback.strengths.map((item) => cleanText(item, 160)).slice(0, 4)
            : heuristics.feedback.strengths,
        improvements: aiFeedback.improvements.length > 0
            ? aiFeedback.improvements.map((item) => cleanText(item, 160)).slice(0, 4)
            : heuristics.feedback.improvements,
    };
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
        const fallbackOverall = roundToOneDecimal(technical * 0.5 + clarity * 0.2 + completeness * 0.3);
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
            strengths,
            improvements,
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
export const generateHeuristicFeedback = (role, question, answer, expectedPoints = []) => {
    const safeRole = cleanText(role || "Software Engineer", 80);
    const safeQuestion = cleanText(question, 1000);
    const safeAnswer = cleanText(answer, 5000);
    const safeExpectedPoints = expectedPoints
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 200))
        .filter(Boolean)
        .slice(0, 8);
    const heuristics = buildHeuristicAssessment(safeQuestion, safeAnswer, safeExpectedPoints);
    return {
        feedback: {
            ...heuristics.feedback,
            suggestion: heuristics.feedback.suggestion ||
                `Keep your answer for ${safeRole} focused on technical correctness and concrete examples.`,
        },
        followUp: heuristics.followUp,
        source: "heuristic",
    };
};
export async function generateFeedback(role, question, answer, expectedPoints = [], options = {}) {
    const heuristicResult = generateHeuristicFeedback(role, question, answer, expectedPoints);
    const heuristics = buildHeuristicAssessment(cleanText(question, 1000), cleanText(answer, 5000), expectedPoints
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 200))
        .filter(Boolean)
        .slice(0, 8));
    if (options.skipProvider || heuristics.lowConfidence || heuristics.wordCount < 8) {
        return heuristicResult;
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return heuristicResult;
    }
    const safeRole = cleanText(role, 80);
    const safeQuestion = cleanText(question, 1000);
    const safeAnswer = cleanText(answer, 5000);
    const safeExpectedPoints = expectedPoints
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 200))
        .filter(Boolean)
        .slice(0, 8);
    const requestTimeoutMs = Number.isFinite(options.providerTimeoutMs)
        ? Math.max(2000, Math.min(9000, Number(options.providerTimeoutMs)))
        : DEFAULT_REQUEST_TIMEOUT_MS;
    const expectedPointsGuidance = safeExpectedPoints.length
        ? `Expected points:\n- ${safeExpectedPoints.join("\n- ")}`
        : "Expected points were not supplied.";
    const prompt = `
You are an interviewer evaluating a ${safeRole} candidate.

Score this answer from 0 to 10 in:
1) technical correctness
2) clarity
3) completeness

Important:
- Penalize incorrect facts and missing key concepts.
- Do not give high technical/completeness scores when core points are wrong or missing.
- If the answer is generic or off-topic, keep technical/completeness low.
- Keep output concise and specific.

${expectedPointsGuidance}

Return JSON only:
{
  "feedback": {
    "technical": 0,
    "clarity": 0,
    "completeness": 0,
    "overall": 0,
    "strengths": ["..."],
    "improvements": ["..."],
    "suggestion": "..."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "...",
    "expectedPoints": ["..."]
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
            model: process.env.OPENROUTER_FEEDBACK_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
            messages: [
                { role: "system", content: "You are a strict and accurate interview evaluator." },
                { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: RESPONSE_MAX_TOKENS,
        }, {
            timeout: requestTimeoutMs,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "HTTP-Referer": referer,
                "X-Title": "Interview AI Coach",
                "Content-Type": "application/json",
            },
        });
        const text = response.data?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
            return heuristicResult;
        }
        const parsed = parseFeedback(text);
        if (!parsed) {
            return heuristicResult;
        }
        return {
            feedback: calibrateFeedback(parsed.feedback, heuristics),
            followUp: parsed.followUp || heuristicResult.followUp,
            source: "ai_calibrated",
        };
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            console.warn("Feedback provider fallback used", {
                status: error.response?.status,
                code: error.code,
            });
        }
        return heuristicResult;
    }
}
