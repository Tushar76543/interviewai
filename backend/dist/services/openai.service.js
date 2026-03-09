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
const MIXED_CATEGORY = "Mixed";
const SUPPORTED_DIFFICULTIES = ["Easy", "Medium", "FAANG"];
const cleanText = (value, maxLength) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);
const defaultTimeLimitByDifficulty = (difficulty) => {
    if (difficulty === "Easy")
        return 120;
    if (difficulty === "FAANG")
        return 240;
    return 180;
};
const getCategoryPool = (role) => {
    const normalizedRole = role.toLowerCase();
    const base = [
        "Behavioral",
        "Communication",
        "Problem Solving",
        "Project Deep Dive",
    ];
    const engineering = [
        "Technical Fundamentals",
        "System Design",
        "Debugging",
        "Testing and Quality",
        "Performance",
        "Security",
    ];
    const aiData = [
        "ML Fundamentals",
        "Data Modeling",
        "Experimentation",
        "Model Evaluation",
        "Responsible AI",
    ];
    const product = [
        "Product Sense",
        "Prioritization",
        "Stakeholder Management",
        "Execution Planning",
    ];
    const leadership = [
        "Leadership and Ownership",
        "Mentoring",
        "Conflict Resolution",
        "Cross-functional Collaboration",
    ];
    const includeEngineering = /(engineer|developer|sre|devops|architect|qa|test|programmer)/i.test(normalizedRole);
    const includeAiData = /(ai|ml|machine learning|data scientist|data engineer|analytics)/i.test(normalizedRole);
    const includeProduct = /(product|pm|program manager|analyst)/i.test(normalizedRole);
    const includeLeadership = /(manager|lead|director|head|principal|staff)/i.test(normalizedRole);
    const pool = [
        ...base,
        ...(includeEngineering ? engineering : []),
        ...(includeAiData ? aiData : []),
        ...(includeProduct ? product : []),
        ...(includeLeadership ? leadership : []),
    ];
    return Array.from(new Set(pool));
};
const resolveCategory = (requestedCategory, categoryPool, previousCategories, previousQuestionCount) => {
    if (!requestedCategory || requestedCategory.toLowerCase() === MIXED_CATEGORY.toLowerCase()) {
        const recent = previousCategories.slice(-3).map((item) => item.toLowerCase());
        const available = categoryPool.filter((item) => !recent.includes(item.toLowerCase()));
        const rotationPool = available.length > 0 ? available : categoryPool;
        const index = previousQuestionCount % rotationPool.length;
        return rotationPool[index];
    }
    const matched = categoryPool.find((item) => item.toLowerCase() === requestedCategory.toLowerCase());
    return matched ?? (cleanText(requestedCategory, 60) || MIXED_CATEGORY);
};
const extractJson = (value) => {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : "";
};
const parseQuestion = (raw, fallbackCategory, fallbackDifficulty) => {
    try {
        const parsed = JSON.parse(extractJson(raw));
        if (!parsed || typeof parsed.prompt !== "string") {
            return null;
        }
        const prompt = cleanText(parsed.prompt, 1000);
        const category = typeof parsed.category === "string" && parsed.category.trim()
            ? cleanText(parsed.category, 60)
            : fallbackCategory;
        const expectedPoints = Array.isArray(parsed.expectedPoints)
            ? parsed.expectedPoints
                .filter((item) => typeof item === "string")
                .map((item) => cleanText(item, 240))
                .filter(Boolean)
                .slice(0, 6)
            : [];
        return {
            qid: typeof parsed.qid === "string" && parsed.qid.trim() ? parsed.qid.trim() : "q1",
            category,
            prompt,
            expectedPoints,
            timeLimitSec: typeof parsed.timeLimitSec === "number" && parsed.timeLimitSec > 0
                ? Math.min(parsed.timeLimitSec, 600)
                : defaultTimeLimitByDifficulty(fallbackDifficulty),
        };
    }
    catch {
        return null;
    }
};
export async function generateQuestion(role, difficulty, previousQuestions = [], category = MIXED_CATEGORY, previousCategories = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new AiProviderError("AI_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured", 500);
    }
    const safeRole = cleanText(role || "Software Engineer", 80) || "Software Engineer";
    const safeDifficulty = cleanText(difficulty || "Medium", 20) || "Medium";
    const resolvedDifficulty = SUPPORTED_DIFFICULTIES.find((item) => item.toLowerCase() === safeDifficulty.toLowerCase())
        ? (safeDifficulty[0].toUpperCase() + safeDifficulty.slice(1).toLowerCase()).replace("Faang", "FAANG")
        : "Medium";
    const safePrevious = previousQuestions
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 500))
        .filter(Boolean)
        .slice(0, 20);
    const safePreviousCategories = previousCategories
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item, 60))
        .filter(Boolean)
        .slice(0, 20);
    const categoryPool = getCategoryPool(safeRole);
    const requestedCategory = cleanText(category || MIXED_CATEGORY, 60) || MIXED_CATEGORY;
    const resolvedCategory = resolveCategory(requestedCategory, categoryPool, safePreviousCategories, safePrevious.length);
    const previousPromptGuidance = safePrevious.length
        ? `Avoid repeating these previous prompts:\n${safePrevious.join("\n")}`
        : "No previous prompts are provided yet.";
    const previousCategoryGuidance = safePreviousCategories.length
        ? `Recent categories used: ${safePreviousCategories.join(", ")}. Prefer a different angle when possible.`
        : "";
    const prompt = `
You are a senior interviewer running a realistic mock interview.

Candidate role: ${safeRole}
Difficulty: ${resolvedDifficulty}
Focus category: ${resolvedCategory}

Question requirements:
- Ask exactly one realistic interview question in 1 to 3 sentences.
- Use practical context (trade-offs, incidents, constraints, metrics, timelines, collaboration).
- Avoid trivia and yes/no-only prompts.
- Keep the question interview-ready and conversational.
- Match the challenge level to difficulty.

${previousPromptGuidance}
${previousCategoryGuidance}

Set timeLimitSec by complexity:
- Easy: 90 to 150
- Medium: 120 to 210
- FAANG: 180 to 300

Return JSON only in this format:
{"qid":"q1","category":"<category>","prompt":"<question>","expectedPoints":["point1","point2","point3"],"timeLimitSec":150}
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
            temperature: 0.85,
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
        const parsed = parseQuestion(text, resolvedCategory, resolvedDifficulty);
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
