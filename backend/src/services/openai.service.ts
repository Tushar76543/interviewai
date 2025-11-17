import dotenv from "dotenv";
import path from "path";
import axios from "axios";

// ✅ Load environment variables explicitly
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

export async function generateQuestion(role: string, difficulty: string, previousQuestions: string[] = []) {
  // Build context for variety
  const previousList = previousQuestions.length
    ? `Avoid repeating any of these topics:\n${previousQuestions.join("\n")}`
    : "";

  const prompt = `
  You are an expert interviewer.
  Generate ONE unique ${difficulty} level interview question for a ${role}.
  ${previousList}
  The question should be fresh, non-repetitive, and cover a different subtopic.
  
  Return JSON in this format:
  {"qid":"q1","prompt":"<the question>","expectedPoints":["point1","point2"],"timeLimitSec":120}
  `;

  console.log("🔹 Sending request to OpenRouter...");
  console.log("🔹 Using key starts with:", process.env.OPENROUTER_API_KEY?.slice(0, 10) + "...");

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-70b-instruct",
        messages: [
          { role: "system", content: "You are an AI Interview Coach." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7, // higher temp => more creativity / less repetition
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "AI Interview Coach",
          "Content-Type": "application/json",
        },
      }
    );

    const text = response.data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from model");

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Invalid JSON format: " + text);
    }
  } catch (err: any) {
    console.error("❌ Error contacting OpenRouter:", err.response?.data || err.message);
    throw new Error("Failed to generate question.");
  }
}
