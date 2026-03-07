import axios from "axios";
export class AiProviderError extends Error {
    constructor(code, message, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const REQUEST_TIMEOUT_MS = 20000;
const cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
const extractJson = (value) => {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : "";
};
const parseQuestion = (raw) => {
    try {
        const parsed = JSON.parse(extractJson(raw));
        if (!parsed || typeof parsed.prompt !== "string") {
            return null;
        }
        const prompt = cleanText(parsed.prompt, 1000);
        const expectedPoints = Array.isArray(parsed.expectedPoints)
            ? parsed.expectedPoints
                .filter((item) => typeof item === "string")
                .map((item) => cleanText(item, 240))
                .filter(Boolean)
                .slice(0, 6)
            : [];
        return {
            qid: typeof parsed.qid === "string" && parsed.qid.trim() ? parsed.qid.trim() : "q1",
            prompt,
            expectedPoints,
            timeLimitSec: typeof parsed.timeLimitSec === "number" && parsed.timeLimitSec > 0
                ? Math.min(parsed.timeLimitSec, 600)
                : 120,
        };
    }
    catch {
        return null;
    }
};
export async function generateQuestion(role, difficulty, previousQuestions = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new AiProviderError("AI_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured", 500);
    }
    const safeRole = cleanText(role || "Software Engineer", 80) || "Software Engineer";
    const safeDifficulty = cleanText(difficulty || "Medium", 20) || "Medium";
    const safePrevious = previousQuestions
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 500))
        .filter(Boolean)
        .slice(0, 20);
    const previousList = safePrevious.length
        ? `Avoid repeating these previous prompts:\n${safePrevious.join("\n")}`
        : "";
    const prompt = `
You are an expert interviewer.
Generate one unique ${safeDifficulty} interview question for a ${safeRole} role.
${previousList}

Return JSON only in this format:
{"qid":"q1","prompt":"<question>","expectedPoints":["point1","point2"],"timeLimitSec":120}
`;
    const referer = process.env.FRONTEND_URL?.startsWith("http")
        ? process.env.FRONTEND_URL
        : "https://interviewai.app";
    try {
        const response = await axios.post(OPENROUTER_ENDPOINT, {
            model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
            messages: [
                { role: "system", content: "You are an AI Interview Coach." },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
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
            throw new AiProviderError("AI_BAD_RESPONSE", "AI provider returned an empty response", 502);
        }
        const parsed = parseQuestion(text);
        if (!parsed) {
            throw new AiProviderError("AI_BAD_RESPONSE", "AI provider returned an invalid response format", 502);
        }
        return parsed;
    }
    catch (error) {
        if (error instanceof AiProviderError) {
            throw error;
        }
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const rawPayload = error.response?.data;
            const providerMessage = typeof rawPayload === "string"
                ? rawPayload
                : typeof rawPayload === "object" && rawPayload !== null
                    ? JSON.stringify(rawPayload)
                    : "";
            console.error("OpenRouter question generation error", {
                status,
                axiosCode: error.code,
                message: error.message,
                providerMessage,
            });
            if (status === 401 || status === 403) {
                throw new AiProviderError("AI_AUTH_FAILED", "AI API key rejected by provider", 502);
            }
            if (status === 429) {
                throw new AiProviderError("AI_RATE_LIMITED", "AI provider rate limit reached", 429);
            }
            if (error.code === "ECONNABORTED") {
                throw new AiProviderError("AI_TIMEOUT", "AI provider request timed out", 504);
            }
            throw new AiProviderError("AI_PROVIDER_ERROR", "AI provider request failed", 502);
        }
        console.error("Unexpected question generation error", error);
        throw new AiProviderError("AI_PROVIDER_ERROR", "Failed to generate question", 500);
    }
}
