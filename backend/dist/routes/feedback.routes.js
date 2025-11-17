import express from "express";
import { generateFeedback } from "../services/feedback.service.js";
const router = express.Router();
router.post("/", async (req, res) => {
    try {
        const { role, question, answer } = req.body;
        const result = await generateFeedback(role, question, answer);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to generate feedback." });
    }
});
export default router;
