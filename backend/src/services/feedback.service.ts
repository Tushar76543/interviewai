import dotenv from "dotenv";
import path from "path";
import axios from "axios";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export async function generateFeedback(role: string, question: string, answer: string) {
  const prompt = `
You are an expert interviewer evaluating a candidate for a ${role} position.

Evaluate the following answer in 3 key areas:
1️⃣ Technical correctness (0–10)
2️⃣ Clarity & communication (0–10)
3️⃣ Completeness (0–10)

Also, write a short suggestion (1–2 lines) for improvement.

Finally, generate ONE short, meaningful follow-up question that builds on the candidate’s answer.

Return JSON ONLY in this format:
{
  "feedback": {
    "technical": 8.5,
    "clarity": 9,
    "completeness": 7.5,
    "suggestion": "Try explaining the trade-offs between models."
  },
  "followUp": {
    "qid": "followup1",
    "prompt": "<the follow-up question>",
    "expectedPoints": ["point1", "point2"]
  }
}

Question: ${question}
Answer: ${answer}
`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-70b-instruct",
        messages: [
          { role: "system", content: "You are a strict but fair AI interview evaluator." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
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
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    return parsed || {
      feedback: {
        technical: 0,
        clarity: 0,
        completeness: 0,
        suggestion: "No feedback generated.",
      },
      followUp: null,
    };
  } catch (err: any) {
    console.error("❌ Feedback error:", err.response?.data || err.message);
    throw new Error("Feedback generation failed.");
  }
}
