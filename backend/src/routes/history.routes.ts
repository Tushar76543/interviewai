import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import InterviewSession from "../models/interviewSession.js";

const router = Router();

router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const sessions = await InterviewSession.find({ userId: user._id })
      .sort({ lastActivityAt: -1 })
      .limit(50)
      .select("-__v")
      .lean();

    res.json({ sessions });
  } catch (error: any) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to fetch history." });
  }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const session = await InterviewSession.findOne({
      _id: req.params.id,
      userId: user._id,
    })
      .select("-__v")
      .lean();

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    res.json({ session });
  } catch (error: any) {
    console.error("Session fetch error:", error);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});

export default router;
