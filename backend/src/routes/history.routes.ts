import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware.js";
import InterviewSession from "../models/interviewSession.js";

const router = Router();

router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user: { _id: string } }).user;

    const sessions = await InterviewSession.find({ userId: user._id })
      .sort({ lastActivityAt: -1 })
      .limit(50)
      .select("-__v")
      .lean();

    return res.json({ sessions });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch history",
    });
  }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user: { _id: string } }).user;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session identifier",
      });
    }

    const session = await InterviewSession.findOne({
      _id: id,
      userId: user._id,
    })
      .select("-__v")
      .lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    return res.json({ session });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch session",
    });
  }
});

export default router;
