import { Router } from "express";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse-fork");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/analyze", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No resume uploaded" });

        // Extract text from PDF
        const buffer = req.file.buffer;
        const data = await pdf(buffer);
        const text = data.text;

        // Mock response for now (would send 'text' to OpenAI here)
        // In a full implementation, you'd prompt: "Extract skills from this resume: " + text

        res.json({
            success: true,
            message: "Resume processed successfully!",
            textPreview: text.substring(0, 200) + "...",
            skillsFound: ["JavaScript", "React", "Node.js"] // Mock skills
        });
    } catch (error: any) {
        console.error("Resume parsing error:", error);
        res.status(500).json({ error: "Failed to process resume" });
    }
});

export default router;
